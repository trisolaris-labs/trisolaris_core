// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../governance/Tri.sol";
import "../interfaces/IRewarder.sol";

// MasterChef is the master of Tri. He can make Tri and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once TRI is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of TRIs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accTriPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accTriPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. TRIs to distribute per block.
        uint256 lastRewardBlock; // Last block number that TRIs distribution occurs.
        uint256 accTriPerShare; // Accumulated TRIs per share, times 1e12. See below.
    }
    // The Tri TOKEN!
    Tri public tri;
    // TRI tokens created per block.
    uint256 public triPerBlock;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when TRI mining starts.
    uint256 public startBlock;
    /// @notice Address of each `IRewarder` contract.
    IRewarder[] public rewarder;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event LogPoolAddition(
        uint256 indexed pid, 
        uint256 allocPoint, 
        IERC20 indexed lpToken, 
        IRewarder indexed rewarder
    );
    event LogSetPool(
        uint256 indexed pid, 
        uint256 allocPoint, 
        IRewarder indexed rewarder, 
        bool overwrite
    );
    event LogUpdatePool(
        uint256 indexed pid, 
        uint256 lastRewardBlock, 
        uint256 lpSupply, 
        uint256 accSushiPerShare
    );

    constructor(
        Tri _tri,
        uint256 _triPerBlock,
        uint256 _startBlock
    ) public {
        tri = _tri;
        triPerBlock = _triPerBlock;
        startBlock = _startBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // updateTriPerBlock, can update the tri per block only onwer can update this field
    function updateTriPerBlock(
        uint256 _triPerBlock
    ) public onlyOwner {
        massUpdatePools();
        triPerBlock = _triPerBlock;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        IRewarder _rewarder,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock =
            block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accTriPerShare: 0
            })
        );
        rewarder.push(_rewarder);
        emit LogPoolAddition(poolInfo.length.sub(1), _allocPoint, _lpToken, _rewarder);
    }

    // Update the given pool's TRI allocation point or rewarder. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        IRewarder _rewarder,
        bool _withUpdate,
        bool overwrite
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
            _allocPoint
        );
        poolInfo[_pid].allocPoint = _allocPoint;
        if (overwrite) { rewarder[_pid] = _rewarder; }
        emit LogSetPool(_pid, _allocPoint, overwrite ? _rewarder : rewarder[_pid], overwrite);
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        return _to.sub(_from);
    }

    // View function to see pending TRIs on frontend.
    function pendingTri(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accTriPerShare = pool.accTriPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier =
                getMultiplier(pool.lastRewardBlock, block.number);
            uint256 triReward =
                multiplier.mul(triPerBlock).mul(pool.allocPoint).div(
                    totalAllocPoint
                );
            accTriPerShare = accTriPerShare.add(
                triReward.mul(1e12).div(lpSupply)
            );
        }
        return user.amount.mul(accTriPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 triReward =
            multiplier.mul(triPerBlock).mul(pool.allocPoint).div(
                totalAllocPoint
            );
        tri.mint(address(this), triReward);
        pool.accTriPerShare = pool.accTriPerShare.add(
            triReward.mul(1e12).div(lpSupply)
        );
        pool.lastRewardBlock = block.number;
        emit LogUpdatePool(_pid, pool.lastRewardBlock, lpSupply, pool.accTriPerShare);
    }

    // Internal deposit function to deposit LP tokens to MasterChef for TRI allocation.
    function _deposit(uint256 _pid, uint256 _amount, address userAddress) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][userAddress];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending =
                user.amount.mul(pool.accTriPerShare).div(1e12).sub(
                    user.rewardDebt
                );
            safeTriTransfer(userAddress, pending);
        }
        pool.lpToken.safeTransferFrom(
            address(userAddress),
            address(this),
            _amount
        );
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accTriPerShare).div(1e12);
        // Rewarder
        IRewarder _rewarder = rewarder[_pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(_pid, userAddress, userAddress, 0, user.amount);
        }
        emit Deposit(userAddress, _pid, _amount);
    }

    // Deposit LP tokens to MasterChef for TRI allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        _deposit(_pid, _amount, msg.sender);
    }

    // Harvest TRI rewards from MasterChef pools.
    function harvest(uint256 _pid) public returns (address) {
        _deposit(_pid, 0, msg.sender);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending =
            user.amount.mul(pool.accTriPerShare).div(1e12).sub(
                user.rewardDebt
            );
        safeTriTransfer(msg.sender, pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accTriPerShare).div(1e12);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        // Rewarder
        IRewarder _rewarder = rewarder[_pid];
        if (address(_rewarder) != address(0)) {
            _rewarder.onTriReward(_pid, msg.sender, msg.sender, 0, user.amount);
        }
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe tri transfer function, just in case if rounding error causes pool to not have enough TRIs.
    function safeTriTransfer(address _to, uint256 _amount) internal {
        uint256 triBal = tri.balanceOf(address(this));
        if (_amount > triBal) {
            tri.transfer(_to, triBal);
        } else {
            tri.transfer(_to, _amount);
        }
    }
}