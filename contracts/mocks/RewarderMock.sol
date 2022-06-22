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
    address private immutable MASTERCHEF;

    constructor(
        uint256 _rewardMultiplier,
        IERC20 _rewardToken,
        address _MASTERCHEF
    ) public {
        rewardMultiplier = _rewardMultiplier;
        rewardToken = _rewardToken;
        MASTERCHEF = _MASTERCHEF;
    }

    function onTriReward(
        uint256,
        address,
        address to,
        uint256 triAmount,
        uint256
    ) external override onlyMC {
        uint256 pendingReward = triAmount.mul(rewardMultiplier);
        uint256 rewardBal = rewardToken.balanceOf(address(this));
        if (pendingReward > rewardBal) {
            rewardToken.safeTransfer(to, rewardBal);
        } else {
            rewardToken.safeTransfer(to, pendingReward);
        }
    }

    function pendingTokens(
        uint256,
        address,
        uint256 triAmount
    ) external view override returns (IERC20[] memory rewardTokens, uint256[] memory rewardAmounts) {
        IERC20[] memory _rewardTokens = new IERC20[](1);
        _rewardTokens[0] = (rewardToken);
        uint256[] memory _rewardAmounts = new uint256[](1);
        _rewardAmounts[0] = triAmount.mul(rewardMultiplier);
        return (_rewardTokens, _rewardAmounts);
    }

    modifier onlyMC() {
        require(msg.sender == MASTERCHEF, "Only MC can call this function.");
        _;
    }
}
