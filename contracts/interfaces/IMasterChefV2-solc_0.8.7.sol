// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
pragma experimental ABIEncoderV2;

interface IMasterChefV2 {
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    struct PoolInfo {
        uint256 allocPoint; // How many allocation points assigned to this pool. SUSHI to distribute per block.
        uint256 lastRewardBlock; // Last block number that SUSHI distribution occurs.
        uint256 accSushiPerShare; // Accumulated SUSHI per share, times 1e12. See below.
    }

    function poolInfo(uint256 pid) external view returns (IMasterChefV2.PoolInfo memory);

    function totalAllocPoint() external view returns (uint256);

    function deposit(
        uint256 _pid,
        uint256 _amount,
        address to
    ) external;

    function triPerBlock() external view returns (uint256);

    function pendingTri(uint256 _pid, address _user) external view returns (uint256);
}
