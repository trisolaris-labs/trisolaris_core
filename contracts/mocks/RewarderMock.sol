// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "../interfaces/IRewarder.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


contract RewarderMock is IRewarder {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    uint256 private immutable rewardMultiplier;
    IERC20 private immutable rewardToken;
    uint256 private constant REWARD_TOKEN_DIVISOR = 1e18;
    address private immutable MASTERCHEF;

    constructor (uint256 _rewardMultiplier, IERC20 _rewardToken, address _MASTERCHEF) public {
        rewardMultiplier = _rewardMultiplier;
        rewardToken = _rewardToken;
        MASTERCHEF = _MASTERCHEF;
    }

    function onTriReward (uint256 pid, address user, address to, uint256 triAmount, uint256) onlyMC override external {
        uint256 pendingReward = triAmount.mul(rewardMultiplier) / REWARD_TOKEN_DIVISOR;
        uint256 rewardBal = rewardToken.balanceOf(address(this));
        if (pendingReward > rewardBal) {
            rewardToken.safeTransfer(to, rewardBal);
        } else {
            rewardToken.safeTransfer(to, pendingReward);
        }
    }
    
    function pendingTokens(uint256 pid, address user, uint256 triAmount) override external view returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        IERC20[] memory _rewardTokens = new IERC20[](1);
        _rewardTokens[0] = (rewardToken);
        uint256[] memory _rewardAmounts = new uint256[](1);
        _rewardAmounts[0] = triAmount.mul(rewardMultiplier) / REWARD_TOKEN_DIVISOR;
        return (_rewardTokens, _rewardAmounts);
    }

    modifier onlyMC {
        require(
            msg.sender == MASTERCHEF,
            "Only MC can call this function."
        );
        _;
    }
  
}