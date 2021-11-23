// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IRewarder.sol";
import "../interfaces/IMasterChef.sol";


/**
 * This is a sample contract to be used in the MasterChef contract for partners to reward
 * stakers with their native token alongside TRI.
 *
 * It assumes the project already has an existing MasterChef-style farm contract.
 * The contract then transfers the reward token to the user on each call to
 * onTriReward().
 *
 */
contract ComplexRewarder is IRewarder, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    IERC20 public immutable lpToken;
    IMasterChef public immutable MC;

    /// @notice Info of each MC user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of TRI entitled to the user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    /// @notice Info of each MC poolInfo.
    /// `accTokenPerShare` Amount of rewardTokens each LP token is worth.
    /// `lastRewardBlock` The last block rewards were rewarded to the poolInfo.
    struct PoolInfo {
        uint256 accTokenPerShare;
        uint256 lastRewardBlock;
    }

    /// @notice Info of the poolInfo.
    PoolInfo public poolInfo;
    /// @notice Info of each user that stakes LP tokens.
    mapping(address => UserInfo) public userInfo;

    uint256 public tokenPerBlock;
    // TODO: should we keep this constant or variable
    uint256 private constant ACC_TOKEN_PRECISION = 1e12;

    event OnReward(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event AllocPointUpdated(uint256 oldAllocPoint, uint256 newAllocPoint);

    modifier onlyMC() {
        require(msg.sender == address(MC), "onlyMC: only MasterChef can call this function");
        _;
    }

    constructor(
        IERC20 _rewardToken,
        IERC20 _lpToken,
        uint256 _tokenPerBlock,
        IMasterChef _mc
    ) public {
        rewardToken = _rewardToken;
        lpToken = _lpToken;
        tokenPerBlock = _tokenPerBlock;
        MC = _mc;
        poolInfo = PoolInfo({lastRewardBlock: block.number, accTokenPerShare: 0});
    }

    
    /// @notice Sets the distribution reward rate. This will also update the poolInfo.
    /// @param _tokenPerBlock The number of tokens to distribute per block
    function setRewardRate(uint256 _tokenPerBlock) external onlyOwner {
        updatePool();

        uint256 oldRate = tokenPerBlock;
        tokenPerBlock = _tokenPerBlock;

        emit RewardRateUpdated(oldRate, _tokenPerBlock);
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
            uint256 lpSupply = lpToken.balanceOf(address(MC));

            if (lpSupply > 0) {
                uint256 blocks = block.number.sub(pool.lastRewardBlock);
                uint256 tokenReward = blocks.mul(tokenPerBlock);
                pool.accTokenPerShare = pool.accTokenPerShare.add((tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply));
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
        ) external override onlyMC {
        updatePool();
        PoolInfo memory pool = poolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 pendingBal;
        // if user had deposited
        if (user.amount > 0) {
            pendingBal = (user.amount.mul(pool.accTokenPerShare) / ACC_TOKEN_PRECISION).sub(user.rewardDebt);
            uint256 rewardBal = rewardToken.balanceOf(address(this));
            if (pendingBal > rewardBal) {
                rewardToken.safeTransfer(_user, rewardBal);
            } else {
                rewardToken.safeTransfer(_user, pendingBal);
            }
        }

        user.amount = _lpAmount;
        user.rewardDebt = user.amount.mul(pool.accTokenPerShare) / ACC_TOKEN_PRECISION;

        emit OnReward(_user, pendingBal);
    }

    /// @notice View function to see pending tokens
    /// @param _user Address of user.
    function pendingTokens(
        uint256, 
        address _user, 
        uint256
    ) external view override returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        IERC20[] memory _rewardTokens = new IERC20[](1);
        _rewardTokens[0] = (rewardToken);
        uint256[] memory _rewardAmounts = new uint256[](1);

        PoolInfo memory pool = poolInfo;
        UserInfo storage user = userInfo[_user];

        uint256 accTokenPerShare = pool.accTokenPerShare;
        uint256 lpSupply = lpToken.balanceOf(address(MC));

        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number.sub(pool.lastRewardBlock);
            uint256 tokenReward = blocks.mul(tokenPerBlock);
            accTokenPerShare = accTokenPerShare.add(tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply);
        }

        _rewardAmounts[0] = (user.amount.mul(accTokenPerShare) / ACC_TOKEN_PRECISION).sub(user.rewardDebt);
        return (_rewardTokens, _rewardAmounts);
    } 
}