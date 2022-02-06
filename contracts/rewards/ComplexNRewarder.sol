// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IRewarder.sol";
import "../interfaces/IMasterChefV2.sol";


/**
 * This is a sample contract to be used in the MasterChef contract for partners to reward
 * stakers with their native token alongside TRI.
 *
 * It assumes the project already has an existing MasterChef-style farm contract.
 * The contract then transfers the reward token to the user on each call to
 * onTriReward().
 *
 */
contract ComplexNRewarder is IRewarder, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20[] public rewardTokens;
    IERC20 public immutable lpToken;
    IMasterChefV2 public immutable MCV2;

    /// @notice Info of each MCV2 user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of TRI entitled to the user.
    struct UserInfo {
        uint256 amount;
        uint256[] rewardDebt;
    }

    /// @notice Info of each MCV2 poolInfo.
    /// `accTokenPerShare` Amount of rewardTokens each LP token is worth.
    /// `lastRewardBlock` The last block rewards were rewarded to the poolInfo.
    struct PoolInfo {
        uint256[] accTokenPerShare;
        uint256 lastRewardBlock;
    }

    /// @notice Info of the poolInfo.
    PoolInfo public poolInfo;
    /// @notice Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    uint256[] public tokenPerBlock;
    uint256 private constant ACC_TOKEN_PRECISION = 1e12;

    event OnReward(address indexed token, address indexed user, uint256 amount);
    event RewardRateUpdated(address indexed token, uint256 oldRate, uint256 newRate);

    modifier onlyMCV2() {
        require(msg.sender == address(MCV2), "onlyMCV2: only MasterChef can call this function");
        _;
    }

    constructor(
        IERC20[] memory _rewardTokens,
        IERC20 _lpToken,
        uint256[] memory _tokenPerBlock,
        IMasterChefV2 _mcv2
    ) public {
        require(_rewardTokens.length == _tokenPerBlock.length, "reward tokens and tokenperblock length mismatch");
        rewardTokens = _rewardTokens;
        lpToken = _lpToken;
        tokenPerBlock = _tokenPerBlock;
        MCV2 = _mcv2;
        poolInfo = PoolInfo({lastRewardBlock: block.number, accTokenPerShare: new uint256[](_rewardTokens.length)});
    }

    
    /// @notice Sets the distribution reward rate. This will also update the poolInfo.
    /// @param _tokenPerBlock The number of tokens to distribute per block
    function setRewardRate(uint256[] calldata _tokenPerBlock) external onlyOwner {
        updatePool();
        
        uint256[] memory oldRate = tokenPerBlock;
        require(oldRate.length == _tokenPerBlock.length, "tokenperblock length mismatch");
        tokenPerBlock = _tokenPerBlock;

        for (uint256 i = 0; i < _tokenPerBlock.length; i++) {
            emit RewardRateUpdated(address(rewardTokens[i]), oldRate[i], _tokenPerBlock[i]);    
        }
    }

    // @notice Allows owner to reclaim/withdraw any tokens (including reward tokens) held by this contract
    /// @param token Token to reclaim, use 0x00 for Ethereum
    /// @param amount Amount of tokens to reclaim
    /// @param to Receiver of the tokens
    function reclaimTokens(address token, uint256 amount, address payable to) public onlyOwner {
        if (token == address(0)) {
            to.transfer(amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice Update reward variables of the given poolInfo.
    /// @return pool Returns the pool that was updated.
    function updatePool() public returns (PoolInfo memory pool) {
        pool = poolInfo;

        if (block.number > pool.lastRewardBlock) {
            uint256 lpSupply = lpToken.balanceOf(address(MCV2));

            if (lpSupply > 0) {
                uint256 blocks = block.number.sub(pool.lastRewardBlock);
                for (uint256 i = 0; i < tokenPerBlock.length; i++) {
                    uint256 tokenReward = blocks.mul(tokenPerBlock[i]);
                    // solhint-disable-next-line
                    pool.accTokenPerShare[i] = pool.accTokenPerShare[i].add((tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply));    
                }
            }

            pool.lastRewardBlock = block.number;
            poolInfo = pool;
        }
    }

    /// @notice Function called by MasterChef whenever staker claims TRI harvest. 
    /// Allows staker to also receive a 2nd reward token.
    /// @param _user Address of user
    /// @param _lpAmount Number of LP tokens the user has
    function onTriReward(
        uint256, 
        address _user, 
        address, 
        uint256, 
        uint256 _lpAmount
        ) external override onlyMCV2 {
        updatePool();
        PoolInfo memory pool = poolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 pendingBal;
        uint256 rewardBal;
        // if user had deposited
        if (user.amount > 0) {
            for (uint256 i = 0; i < tokenPerBlock.length; i++) {
                // solhint-disable-next-line
                pendingBal = (user.amount.mul(pool.accTokenPerShare[i]) / ACC_TOKEN_PRECISION).sub(user.rewardDebt[i]);    
                rewardBal = rewardTokens[i].balanceOf(address(this));
                if (pendingBal > rewardBal) {
                    rewardTokens[i].safeTransfer(_user, rewardBal);
                } else {
                    rewardTokens[i].safeTransfer(_user, pendingBal);
                }
                emit OnReward(address(rewardTokens[i]), _user, pendingBal);
            }
            user.amount = _lpAmount;
            for (uint256 i = 0; i < tokenPerBlock.length; i++) {
                // solhint-disable-next-line
                user.rewardDebt[i] = user.amount.mul(pool.accTokenPerShare[i]) / ACC_TOKEN_PRECISION;
            }
        }
    }

    /// @notice View function to see pending tokens
    /// @param _user Address of user.
    function pendingTokens(
        uint256, 
        address _user, 
        uint256
    ) external view override returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        uint256[] memory _rewardAmounts = new uint256[](rewardTokens.length);

        PoolInfo memory pool = poolInfo;
        UserInfo storage user = userInfo[_user];

        uint256[] memory accTokenPerShare = pool.accTokenPerShare;
        uint256 lpSupply = lpToken.balanceOf(address(MCV2));

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number.sub(pool.lastRewardBlock);
            for (uint256 i = 0; i < tokenPerBlock.length; i++) {
                    uint256 tokenReward = blocks.mul(tokenPerBlock[i]);
                    // solhint-disable-next-line
                    accTokenPerShare[i] = pool.accTokenPerShare[i].add((tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply));
                    // solhint-disable-next-line
                    _rewardAmounts[i] = (user.amount.mul(accTokenPerShare[i]) / ACC_TOKEN_PRECISION).sub(user.rewardDebt[i]);    
                }
        }
        return (rewardTokens, _rewardAmounts);
    } 
}