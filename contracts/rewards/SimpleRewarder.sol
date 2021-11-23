// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "../interfaces/IRewarder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IMasterChef.sol";


contract SimpleRewarder is IRewarder, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    uint256 private constant ACC_TOKEN_PRECISION = 1e12;

    IERC20 public immutable rewardToken;
    IMasterChef public immutable MASTERCHEF;
    uint256 public rewardMultiplier;

    constructor (uint256 _rewardMultiplier, IERC20 _rewardToken, IMasterChef _MASTERCHEF) public {
        rewardMultiplier = _rewardMultiplier;
        rewardToken = _rewardToken;
        MASTERCHEF = _MASTERCHEF;
    }

    modifier onlyMC() {
        require(msg.sender == address(MASTERCHEF), "onlyMC: only MasterChef can call this function");
        _;
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

    /// @notice Sets the distribution reward rate.
    /// @param _rewardMultiplier The number of tokens to distribute per distributedTri
    function setRewardMultiplier(uint256 _rewardMultiplier) external onlyOwner {
        rewardMultiplier = _rewardMultiplier;
    }

    function onTriReward (uint256, address, address to, uint256 triAmount, uint256) onlyMC override external {
        uint256 pendingReward = triAmount.mul(rewardMultiplier).div(ACC_TOKEN_PRECISION);
        uint256 rewardBal = rewardToken.balanceOf(address(this));
        if (pendingReward > rewardBal) {
            rewardToken.safeTransfer(to, rewardBal);
        } else {
            rewardToken.safeTransfer(to, pendingReward);
        }
    }
    
    function pendingTokens(uint256 _pid, address _user, uint256) override external view returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        IERC20[] memory _rewardTokens = new IERC20[](1);
        _rewardTokens[0] = (rewardToken);
        uint256[] memory _rewardAmounts = new uint256[](1);
        // get pendingTri from chef and calculate rewards accordingly
        uint256 triAmount = MASTERCHEF.pendingTri(_pid, _user);
        _rewardAmounts[0] = triAmount.mul(rewardMultiplier).div(ACC_TOKEN_PRECISION);
        return (_rewardTokens, _rewardAmounts);
    }
  
}