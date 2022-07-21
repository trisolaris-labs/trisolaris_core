// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../libraries/SignedSafeMath.sol";
import "../interfaces/IRewarder.sol";
import "../interfaces/IMasterChef.sol";

/// @notice The (older) MasterChef contract gives out a constant number of TRI tokens per block.
/// It is the only address with minting rights for TRI.
/// The idea for this MasterChef V2 (MCV2) contract is therefore to be the owner of a dummy token
/// that is deposited into the MasterChef V1 (MCV1) contract.
/// The allocation point for this pool on MCV1 is the total allocation point for
/// all pools that receive double incentives.
contract MasterChefV2 is Ownable {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using SafeERC20 for IERC20;
    using SignedSafeMath for int256;

    /// @notice Info of each MCV2 user.
    /// `amount` LP token amount the user has provided.
    /// `rewardDebt` The amount of TRI entitled to the user.
    struct UserInfo {
        uint256 amount;
        int256 rewardDebt;
    }

    /// @notice Info of each MCV2 pool.
    /// `allocPoint` The amount of allocation points assigned to the pool.
    /// Also known as the amount of TRI to distribute per block.
    struct PoolInfo {
        uint128 accTriPerShare;
        uint64 lastRewardBlock;
        uint64 allocPoint;
    }

    /* solhint-disable var-name-mixedcase */
    /// @notice Address of MCV1 contract.
    IMasterChef public immutable MASTER_CHEF;
    /// @notice Address of TRI contract.
    IERC20 public immutable TRI;
    /// @notice The index of MCV2 master pool in MCV1.
    uint256 public immutable MASTER_PID;
    /// @notice Info of each MCV2 pool.
    PoolInfo[] public poolInfo;
    /// @notice Address of the LP token for each MCV2 pool.
    IERC20[] public lpToken;
    /// @notice Address of each `IRewarder` contract in MCV2.
    IRewarder[] public rewarder;
    /* solhint-enable */

    /// @notice Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    /// @dev Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;

    uint256 private constant ACC_TRI_PRECISION = 1e12;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount, address indexed to);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount, address indexed to);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount, address indexed to);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event LogPoolAddition(uint256 indexed pid, uint256 allocPoint, IERC20 indexed lpToken, IRewarder indexed rewarder);
    event LogSetPool(uint256 indexed pid, uint256 allocPoint, IRewarder indexed rewarder, bool overwrite);
    event LogUpdatePool(uint256 indexed pid, uint64 lastRewardBlock, uint256 lpSupply, uint256 accTriPerShare);
    event LogInit();

    /// @param _MASTER_CHEF The TriSwap MCV1 contract address.
    /// @param _tri The TRI token contract address.
    /// @param _MASTER_PID The pool ID of the dummy token on the base MCV1 contract.
    constructor(
        IMasterChef _MASTER_CHEF,
        IERC20 _tri,
        uint256 _MASTER_PID
    ) public {
        MASTER_CHEF = _MASTER_CHEF;
        TRI = _tri;
        MASTER_PID = _MASTER_PID;
    }

    /// @notice Deposits a dummy token to `MASTER_CHEF` MCV1.
    /// This is required because MCV1 holds the minting rights for TRI.
    /// Any balance of transaction sender in `dummyToken` is transferred.
    /// The allocation point for the pool on MCV1 is the total allocation point for
    /// all pools that receive double incentives.
    /// @param dummyToken The address of the ERC-20 token to deposit into MCV1.
    function init(IERC20 dummyToken) external {
        uint256 balance = dummyToken.balanceOf(msg.sender);
        require(balance != 0, "MasterChefV2: Balance must exceed 0");
        dummyToken.safeTransferFrom(msg.sender, address(this), balance);
        dummyToken.approve(address(MASTER_CHEF), balance);
        MASTER_CHEF.deposit(MASTER_PID, balance);
        emit LogInit();
    }

    /// @notice Returns the number of MCV2 pools.
    function poolLength() public view returns (uint256 pools) {
        pools = poolInfo.length;
    }

    /// @notice Add a new LP to the pool. Can only be called by the owner.
    /// DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    /// @param allocPoint AP of the new pool.
    /// @param _lpToken Address of the LP ERC-20 token.
    /// @param _rewarder Address of the rewarder delegate.
    function add(
        uint256 allocPoint,
        IERC20 _lpToken,
        IRewarder _rewarder
    ) public onlyOwner {
        uint256 lastRewardBlock = block.number;
        totalAllocPoint = totalAllocPoint.add(allocPoint);
        lpToken.push(_lpToken);
        rewarder.push(_rewarder);

        poolInfo.push(
            PoolInfo({ allocPoint: allocPoint.to64(), lastRewardBlock: lastRewardBlock.to64(), accTriPerShare: 0 })
        );
        emit LogPoolAddition(lpToken.length.sub(1), allocPoint, _lpToken, _rewarder);
    }

    /// @notice Update the given pool's TRI allocation point and `IRewarder` contract. Can only be called by the owner.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _allocPoint New AP of the pool.
    /// @param _rewarder Address of the rewarder delegate.
    /// @param overwrite True if _rewarder should be `set`. Otherwise `_rewarder` is ignored.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        IRewarder _rewarder,
        bool overwrite
    ) public onlyOwner {
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint.to64();
        if (overwrite) {
            rewarder[_pid] = _rewarder;
        }
        emit LogSetPool(_pid, _allocPoint, overwrite ? _rewarder : rewarder[_pid], overwrite);
    }

    /// @notice View function to see pending TRI on frontend.
    /// @param _pid The index of the pool. See `poolInfo`.
    /// @param _user Address of user.
    /// @return pending TRI reward for a given user.
    function pendingTri(uint256 _pid, address _user) external view returns (uint256 pending) {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accTriPerShare = pool.accTriPerShare;
        uint256 lpSupply = lpToken[_pid].balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blocks = block.number.sub(pool.lastRewardBlock);
            uint256 triReward = blocks.mul(triPerBlock()).mul(pool.allocPoint) / totalAllocPoint;
            accTriPerShare = accTriPerShare.add(triReward.mul(ACC_TRI_PRECISION) / lpSupply);
        }
        pending = int256(user.amount.mul(accTriPerShare) / ACC_TRI_PRECISION).sub(user.rewardDebt).toUInt256();
    }

    /// @notice Update reward variables for all pools. Be careful of gas spending!
    /// @param pids Pool IDs of all to be updated. Make sure to update all active pools.
    function massUpdatePools(uint256[] calldata pids) external {
        uint256 len = pids.length;
        for (uint256 i = 0; i < len; ++i) {
            updatePool(pids[i]);
        }
    }

    /// @notice Calculates and returns the `amount` of TRI per block.
    function triPerBlock() public view returns (uint256 amount) {
        amount =
            uint256(MASTER_CHEF.triPerBlock()).mul(MASTER_CHEF.poolInfo(MASTER_PID).allocPoint) /
            MASTER_CHEF.totalAllocPoint();
    }

    /// @notice Update reward variables of the given pool.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @return pool Returns the pool that was updated.
    function updatePool(uint256 pid) public returns (PoolInfo memory pool) {
        pool = poolInfo[pid];
        if (block.number > pool.lastRewardBlock) {
            uint256 lpSupply = lpToken[pid].balanceOf(address(this));
            if (lpSupply > 0) {
                uint256 blocks = block.number.sub(pool.lastRewardBlock);
                uint256 triReward = blocks.mul(triPerBlock()).mul(pool.allocPoint) / totalAllocPoint;
                pool.accTriPerShare = pool.accTriPerShare.add((triReward.mul(ACC_TRI_PRECISION) / lpSupply).to128());
            }
            pool.lastRewardBlock = block.number.to64();
            poolInfo[pid] = pool;
            emit LogUpdatePool(pid, pool.lastRewardBlock, lpSupply, pool.accTriPerShare);
        }
    }

    /// @notice Deposit LP tokens to MCV2 for TRI allocation.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to deposit.
    /// @param to The receiver of `amount` deposit benefit.
    function deposit(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        harvestFromMasterChef();
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][to];

        // Effects
        user.amount = user.amount.add(amount);
        user.rewardDebt = user.rewardDebt.add(int256(amount.mul(pool.accTriPerShare) / ACC_TRI_PRECISION));

        // Interactions
        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(pid, to, to, 0, user.amount);
        }

        lpToken[pid].safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(msg.sender, pid, amount, to);
    }

    /// @notice Withdraw LP tokens from MCV2.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to withdraw.
    /// @param to Receiver of the LP tokens.
    function withdraw(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        harvestFromMasterChef();
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];

        // Effects
        user.rewardDebt = user.rewardDebt.sub(int256(amount.mul(pool.accTriPerShare) / ACC_TRI_PRECISION));
        user.amount = user.amount.sub(amount);

        // Interactions
        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(pid, msg.sender, to, 0, user.amount);
        }

        lpToken[pid].safeTransfer(to, amount);

        emit Withdraw(msg.sender, pid, amount, to);
    }

    /// @notice Harvest proceeds for transaction sender to `to`.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param to Receiver of TRI rewards.
    function harvest(uint256 pid, address to) public {
        harvestFromMasterChef();
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];
        int256 accumulatedTri = int256(user.amount.mul(pool.accTriPerShare) / ACC_TRI_PRECISION);
        uint256 _pendingTri = accumulatedTri.sub(user.rewardDebt).toUInt256();

        // Effects
        user.rewardDebt = accumulatedTri;

        // Interactions
        if (_pendingTri != 0) {
            TRI.safeTransfer(to, _pendingTri);
        }

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(pid, msg.sender, to, _pendingTri, user.amount);
        }

        emit Harvest(msg.sender, pid, _pendingTri);
    }

    /// @notice Withdraw LP tokens from MCV2 and harvest proceeds for transaction sender to `to`.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param amount LP token amount to withdraw.
    /// @param to Receiver of the LP tokens and TRI rewards.
    function withdrawAndHarvest(
        uint256 pid,
        uint256 amount,
        address to
    ) public {
        harvestFromMasterChef();
        PoolInfo memory pool = updatePool(pid);
        UserInfo storage user = userInfo[pid][msg.sender];
        int256 accumulatedTri = int256(user.amount.mul(pool.accTriPerShare) / ACC_TRI_PRECISION);
        uint256 _pendingTri = accumulatedTri.sub(user.rewardDebt).toUInt256();

        // Effects
        user.rewardDebt = accumulatedTri.sub(int256(amount.mul(pool.accTriPerShare) / ACC_TRI_PRECISION));
        user.amount = user.amount.sub(amount);

        // Interactions
        TRI.safeTransfer(to, _pendingTri);

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(pid, msg.sender, to, _pendingTri, user.amount);
        }

        lpToken[pid].safeTransfer(to, amount);

        emit Withdraw(msg.sender, pid, amount, to);
        emit Harvest(msg.sender, pid, _pendingTri);
    }

    /// @notice Harvests TRI from `MASTER_CHEF` MCV1 and pool `MASTER_PID` to this MCV2 contract.
    function harvestFromMasterChef() public {
        MASTER_CHEF.deposit(MASTER_PID, 0);
    }

    /// @notice Withdraw without caring about rewards. EMERGENCY ONLY.
    /// @param pid The index of the pool. See `poolInfo`.
    /// @param to Receiver of the LP tokens.
    function emergencyWithdraw(uint256 pid, address to) public {
        UserInfo storage user = userInfo[pid][msg.sender];
        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;

        IRewarder _rewarder = rewarder[pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(pid, msg.sender, to, 0, 0);
        }

        // Note: transfer can fail or succeed if `amount` is zero.
        lpToken[pid].safeTransfer(to, amount);
        emit EmergencyWithdraw(msg.sender, pid, amount, to);
    }
}
