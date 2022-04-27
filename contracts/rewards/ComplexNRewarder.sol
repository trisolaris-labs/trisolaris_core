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

    IERC20[] public rewardToken;
    IERC20 public immutable lpToken;
    IMasterChefV2 public immutable MCV2;
    uint256 public immutable numRewardTokens;

    

    /// @notice Info of each MCV2 poolInfo.
    /// `accTokenPerShare` Amount of rewardToken each LP token is worth.
    /// `lastRewardBlock` The last block rewards were rewarded to the poolInfo.
    uint256[] public accTokenPerShare;
    uint256 public lastRewardBlock;
    
    /// @notice Info of each user that stakes LP tokens.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of TRI entitled to the user.
    mapping(address => uint256) public userAmount;
    mapping(address => uint256[]) public userRewardDebt;

    uint256[] public tokenPerBlock;
    uint256 private constant ACC_TOKEN_PRECISION = 1e12;

    event OnReward(address indexed token, address indexed user, uint256 amount);
    event RewardRateUpdated(address indexed token, uint256 oldRate, uint256 newRate);

    modifier onlyMCV2() {
        require(msg.sender == address(MCV2), "onlyMCV2: only MasterChef can call this function");
        _;
    }

    constructor(
        IERC20[] memory _rewardToken,
        IERC20 _lpToken,
        uint256[] memory _tokenPerBlock,
        IMasterChefV2 _mcv2
    ) public {
        require(_rewardToken.length == _tokenPerBlock.length, "reward tokens and tokenperblock length mismatch");
        numRewardTokens = _rewardToken.length;
        rewardToken = _rewardToken;
        lpToken = _lpToken;
        tokenPerBlock = _tokenPerBlock;
        MCV2 = _mcv2;
        accTokenPerShare = new uint256[](_rewardToken.length);
        lastRewardBlock = block.number;
    }

    
    /// @notice Sets the distribution reward rate. This will also update the poolInfo.
    /// @param _tokenPerBlock The number of tokens to distribute per block
    function setRewardRate(uint256[] calldata _tokenPerBlock) external onlyOwner {
        updatePool();
        
        uint256[] memory oldRate = tokenPerBlock;
        require(numRewardTokens == _tokenPerBlock.length, "tokenperblock length incorrect");
        tokenPerBlock = _tokenPerBlock;

        for (uint256 i = 0; i < numRewardTokens; i++) {
            emit RewardRateUpdated(address(rewardToken[i]), oldRate[i], _tokenPerBlock[i]);    
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
    function updatePool() public {
        if (block.number > lastRewardBlock) {
            uint256 lpSupply = lpToken.balanceOf(address(MCV2));

            if (lpSupply > 0) {
                uint256 blocks = block.number.sub(lastRewardBlock);
                for (uint256 i = 0; i < numRewardTokens; i++) {
                    uint256 tokenReward = blocks.mul(tokenPerBlock[i]);
                    // solhint-disable-next-line
                    accTokenPerShare[i] = accTokenPerShare[i].add((tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply));    
                }
            }

            lastRewardBlock = block.number;
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
        uint256 _userAmount = userAmount[_user];
        uint256[] memory _userRewardDebt = userRewardDebt[_user];
        uint256 pendingBal;
        uint256 rewardBal;
        
        if (_userAmount == 0 && _userRewardDebt.length == 0) {
            // initializing userRewardDebt
            _userRewardDebt = new uint256[](numRewardTokens);
        } else if (_userAmount > 0) {
            // if user had deposited
            for (uint256 i = 0; i < numRewardTokens; i++) {
                // solhint-disable-next-line
                pendingBal = (_userAmount.mul(accTokenPerShare[i]) / ACC_TOKEN_PRECISION).sub(_userRewardDebt[i]);    
                rewardBal = rewardToken[i].balanceOf(address(this));
                if (pendingBal > rewardBal) {
                    rewardToken[i].safeTransfer(_user, rewardBal);
                } else {
                    rewardToken[i].safeTransfer(_user, pendingBal);
                }
                emit OnReward(address(rewardToken[i]), _user, pendingBal);
            }
        } 

        _userAmount = _lpAmount;
        for (uint256 i = 0; i < numRewardTokens; i++) {
            // solhint-disable-next-line
            _userRewardDebt[i] = _userAmount.mul(accTokenPerShare[i]) / ACC_TOKEN_PRECISION;
        }

        userAmount[_user] = _userAmount;
        userRewardDebt[_user] = _userRewardDebt;
    }

    /// @notice View function to see pending tokens
    /// @param _user Address of user.
    function pendingTokens(
        uint256, 
        address _user, 
        uint256
    ) external view override returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        uint256[] memory _rewardAmounts = new uint256[](numRewardTokens);
        uint256 _userAmount = userAmount[_user];
        uint256[] memory _userRewardDebt = userRewardDebt[_user];
        uint256 lpSupply = lpToken.balanceOf(address(MCV2));
        uint256[] memory _accTokenPerShare = accTokenPerShare;

        if (block.number > lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number.sub(lastRewardBlock);
            for (uint256 i = 0; i < numRewardTokens; i++) {
                uint256 tokenReward = blocks.mul(tokenPerBlock[i]);
                // solhint-disable-next-line
                _accTokenPerShare[i] = accTokenPerShare[i].add((tokenReward.mul(ACC_TOKEN_PRECISION) / lpSupply));
                // solhint-disable-next-line
                _rewardAmounts[i] = (_userAmount.mul(_accTokenPerShare[i]) / ACC_TOKEN_PRECISION).sub(_userRewardDebt[i]);    
            }
        }
        return (rewardToken, _rewardAmounts);
    } 
}