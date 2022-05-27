// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { ITriBar } from "../interfaces/ITriBar.sol";

/**
 * @title Stable TRI Staking
 * @author Trader TRI
 * @notice StableTRIStaking is a contract that allows TRI deposits and receives stablecoins sent by MoneyMaker's daily
 * harvests. Users deposit TRI and receive a share of what has been sent by MoneyMaker based on their participation of
 * the total deposited TRI. It is similar to a MasterChef, but we allow for claiming of different reward tokens
 * (in case at some point we wish to change the stablecoin rewarded).
 * Every time `updateReward(token)` is called, We distribute the balance of that tokens as rewards to users that are
 * currently staking inside this contract, and they can claim it using `withdraw(0)`
 */
contract StableTRIStaking is Ownable, ERC20 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice Info of each user
    struct UserInfo {
        uint256 amount;
        mapping(IERC20 => uint256) rewardDebt;
        /**
         * @notice We do some fancy math here. Basically, any point in time, the amount of TRIs
         * entitled to a user but is pending to be distributed is:
         *
         *   pending reward = (user.amount * accRewardPerShare) - user.rewardDebt[token]
         *
         * Whenever a user deposits or withdraws TRI. Here's what happens:
         *   1. accRewardPerShare (and `lastRewardBalance`) gets updated
         *   2. User receives the pending reward sent to his/her address
         *   3. User's `amount` gets updated
         *   4. User's `rewardDebt[token]` gets updated
         */
    }

    IERC20 public tri;

    /// @dev Internal balance of TRI, this gets updated on user deposits / withdrawals
    /// this allows to reward users with TRI
    uint256 public internalTRIBalance;
    /// @notice Array of tokens that users can claim
    IERC20[] public rewardTokens;
    mapping(IERC20 => bool) public isRewardToken;
    /// @notice Last reward balance of `token`
    mapping(IERC20 => uint256) public lastRewardBalance;

    address public feeCollector;

    /// @notice The deposit fee, scaled to `DEPOSIT_FEE_PERCENT_PRECISION`
    uint256 public depositFeePercent;
    /// @notice The precision of `depositFeePercent`
    uint256 public immutable DEPOSIT_FEE_PERCENT_PRECISION = 1e18;
    /// @notice The max deposit fee value, scaled to `DEPOSIT_FEE_PERCENT_PRECISION`
    uint256 public immutable MAX_DEPOSIT_FEE_PERCENT;

    /// @notice Accumulated `token` rewards per share, scaled to `ACC_REWARD_PER_SHARE_PRECISION`
    mapping(IERC20 => uint256) public accRewardPerShare;
    /// @notice The precision of `accRewardPerShare`
    uint256 public immutable ACC_REWARD_PER_SHARE_PRECISION = 1e24;

    /// @dev Info of each user that stakes TRI
    mapping(address => UserInfo) private userInfo;

    /// @notice Emitted when a user deposits TRI
    event Deposit(address indexed user, uint256 amount, uint256 fee);

    /// @notice Emitted when owner changes the deposit fee percentage
    event DepositFeeChanged(uint256 newFee, uint256 oldFee);

    /// @notice Emitted when a user withdraws TRI
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims reward
    event ClaimReward(address indexed user, address indexed rewardToken, uint256 amount);

    /// @notice Emitted when a user emergency withdraws its TRI
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /// @notice Emitted when owner adds a token to the reward tokens list
    event RewardTokenAdded(address token);

    /// @notice Emitted when owner removes a token from the reward tokens list
    event RewardTokenRemoved(address token);

    /// @notice Emitted when owner migrates from xTRI to pTRI
    event Migrated(address xTRI, address asset, uint256 triUnstaked, uint256 shares);

    /// @notice Emitted when owner updates the feeCollector
    event FeeCollectorUpdated(address feeCollector);

    /**
     * @notice Initialize a new StableTRIStaking contract
     * @dev This contract needs to receive an ERC20 `_rewardToken` in order to distribute them
     * (with MoneyMaker in our case)
     * @param _rewardToken The address of the ERC20 reward token
     * @param _tri The address of the TRI token
     * @param _feeCollector The address where deposit fees will be sent
     * @param _depositFeePercent The deposit fee percent, scalled to 1e18, e.g. 3% is 3e16
     */
    constructor(
        string memory name_,
        string memory symbol_,
        IERC20 _rewardToken,
        IERC20 _tri,
        address _feeCollector,
        uint256 _depositFeePercent
    ) ERC20(name_, symbol_) {
        uint256 _tempMaxDepositFeePercent = 5e17;

        require(address(_rewardToken) != address(0), "StableTRIStaking: reward token can't be address(0)");
        require(address(_tri) != address(0), "StableTRIStaking: tri can't be address(0)");
        require(_feeCollector != address(0), "StableTRIStaking: fee collector can't be address(0)");
        require(
            _depositFeePercent <= _tempMaxDepositFeePercent,
            "StableTRIStaking: max deposit fee can't be greater than 50%"
        );

        tri = _tri;
        depositFeePercent = _depositFeePercent;
        feeCollector = _feeCollector;

        isRewardToken[_rewardToken] = true;
        rewardTokens.push(_rewardToken);

        MAX_DEPOSIT_FEE_PERCENT = _tempMaxDepositFeePercent;
    }

    /**
     * @notice Deposit TRI for reward token allocation
     * @param _amount The amount of TRI to deposit
     */
    function deposit(uint256 _amount) external {
        uint256 _fee = _amount.mul(depositFeePercent).div(DEPOSIT_FEE_PERCENT_PRECISION);
        uint256 _amountMinusFee = _amount.sub(_fee);

        _beforeReceive(_msgSender(), _amountMinusFee);

        internalTRIBalance = internalTRIBalance.add(_amountMinusFee);
        tri.safeTransferFrom(_msgSender(), feeCollector, _fee);
        tri.safeTransferFrom(_msgSender(), address(this), _amountMinusFee);
        _mint(_msgSender(), _amountMinusFee);
        emit Deposit(_msgSender(), _amountMinusFee, _fee);
    }

    /**
     * @notice Get user info
     * @param _user The address of the user
     * @param _rewardToken The address of the reward token
     * @return The amount of TRI user has deposited
     * @return The reward debt for the chosen token
     */
    function getUserInfo(address _user, IERC20 _rewardToken) external view returns (uint256, uint256) {
        require(isRewardToken[_rewardToken], "StableTRIStaking: reward token is not a reward token");
        UserInfo storage user = userInfo[_user];
        return (user.amount, user.rewardDebt[_rewardToken]);
    }

    /**
     * @notice Get the number of reward tokens
     * @return The length of the array
     */
    function rewardTokensLength() external view returns (uint256) {
        return rewardTokens.length;
    }

    /**
     * @notice Add a reward token
     * @param _rewardToken The address of the reward token
     */
    function addRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(
            !isRewardToken[_rewardToken] && address(_rewardToken) != address(0),
            "StableTRIStaking: token can't be added"
        );
        require(rewardTokens.length < 25, "StableTRIStaking: list of token too big");
        rewardTokens.push(_rewardToken);
        isRewardToken[_rewardToken] = true;
        updateReward(_rewardToken);
        emit RewardTokenAdded(address(_rewardToken));
    }

    /**
     * @notice Add a reward token
     * @param feeCollector_ The address where deposit fees will be sent
     */
    function setFeeCollector(address feeCollector_) external onlyOwner {
        feeCollector = feeCollector_;
        emit FeeCollectorUpdated(feeCollector);
    }

    /**
     * @notice Remove a reward token
     * @param _rewardToken The address of the reward token
     */
    function removeRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(isRewardToken[_rewardToken], "StableTRIStaking: token can't be removed");
        updateReward(_rewardToken);
        isRewardToken[_rewardToken] = false;
        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            if (rewardTokens[i] == _rewardToken) {
                rewardTokens[i] = rewardTokens[_len - 1];
                rewardTokens.pop();
                break;
            }
        }
        emit RewardTokenRemoved(address(_rewardToken));
    }

    /**
     * @notice Set the deposit fee percent
     * @param _depositFeePercent The new deposit fee percent
     */
    function setDepositFeePercent(uint256 _depositFeePercent) external onlyOwner {
        require(
            _depositFeePercent <= MAX_DEPOSIT_FEE_PERCENT,
            "StableTRIStaking: deposit fee can't be greater than 50%"
        );
        uint256 oldFee = depositFeePercent;
        depositFeePercent = _depositFeePercent;
        emit DepositFeeChanged(_depositFeePercent, oldFee);
    }

    /**
     * @notice View function to see pending reward token on frontend
     * @param _user The address of the user
     * @param _token The address of the token
     * @return `_user`'s pending reward token
     */
    function pendingReward(address _user, IERC20 _token) external view returns (uint256) {
        require(isRewardToken[_token], "StableTRIStaking: wrong reward token");
        UserInfo storage user = userInfo[_user];
        uint256 _totalTRI = internalTRIBalance;
        uint256 _accRewardTokenPerShare = accRewardPerShare[_token];

        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tri ? _currRewardBalance.sub(_totalTRI) : _currRewardBalance;

        if (_rewardBalance != lastRewardBalance[_token] && _totalTRI != 0) {
            uint256 _accruedReward = _rewardBalance.sub(lastRewardBalance[_token]);
            _accRewardTokenPerShare = _accRewardTokenPerShare.add(
                _accruedReward.mul(ACC_REWARD_PER_SHARE_PRECISION).div(_totalTRI)
            );
        }
        return
            user.amount.mul(_accRewardTokenPerShare).div(ACC_REWARD_PER_SHARE_PRECISION).sub(user.rewardDebt[_token]);
    }

    /**
     * @notice Withdraw TRI and harvest the rewards
     * @param _amount The amount of TRI to withdraw
     */
    function withdraw(uint256 _amount) external {
        _beforeSend(_msgSender(), _amount);

        internalTRIBalance = internalTRIBalance.sub(_amount);
        tri.safeTransfer(_msgSender(), _amount);
        _burn(_msgSender(), _amount);
        emit Withdraw(_msgSender(), _amount);
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY
     */
    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[_msgSender()];

        uint256 _amount = user.amount;
        user.amount = 0;
        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            user.rewardDebt[_token] = 0;
        }
        internalTRIBalance = internalTRIBalance.sub(_amount);
        tri.safeTransfer(_msgSender(), _amount);
        _burn(_msgSender(), _amount);
        emit EmergencyWithdraw(_msgSender(), _amount);
    }

    /**
     * @notice Update reward variables
     * @param _token The address of the reward token
     * @dev Needs to be called before any deposit or withdrawal
     */
    function updateReward(IERC20 _token) public {
        require(isRewardToken[_token], "StableTRIStaking: wrong reward token");

        uint256 _totalTRI = internalTRIBalance;

        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tri ? _currRewardBalance.sub(_totalTRI) : _currRewardBalance;

        // Did StableTRIStaking receive any token
        if (_rewardBalance == lastRewardBalance[_token] || _totalTRI == 0) {
            return;
        }

        uint256 _accruedReward = _rewardBalance.sub(lastRewardBalance[_token]);

        accRewardPerShare[_token] = accRewardPerShare[_token].add(
            _accruedReward.mul(ACC_REWARD_PER_SHARE_PRECISION).div(_totalTRI)
        );
        lastRewardBalance[_token] = _rewardBalance;
    }

    /**
     * @notice Safe token transfer function, just in case if rounding error
     * causes pool to not have enough reward tokens
     * @param _token The address of then token to transfer
     * @param _to The address that will receive `_amount` `rewardToken`
     * @param _amount The amount to send to `_to`
     */
    function safeTokenTransfer(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) internal {
        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == tri ? _currRewardBalance.sub(internalTRIBalance) : _currRewardBalance;

        if (_amount > _rewardBalance) {
            lastRewardBalance[_token] = lastRewardBalance[_token].sub(_rewardBalance);
            _token.safeTransfer(_to, _rewardBalance);
        } else {
            lastRewardBalance[_token] = lastRewardBalance[_token].sub(_amount);
            _token.safeTransfer(_to, _amount);
        }
    }

    function migrate(address xTRI_, uint256 xTRIAmount_) external {
        IERC20(xTRI_).safeTransferFrom(_msgSender(), address(this), xTRIAmount_);

        uint256 triBalanceBefore_ = tri.balanceOf(address(this));
        ITriBar(xTRI_).leave(xTRIAmount_);
        uint256 triBalanceUnstaked_ = tri.balanceOf(address(this)).sub(triBalanceBefore_);

        uint256 _fee = triBalanceUnstaked_.mul(depositFeePercent).div(DEPOSIT_FEE_PERCENT_PRECISION);
        uint256 _amountMinusFee = triBalanceUnstaked_.sub(_fee);

        _beforeReceive(_msgSender(), _amountMinusFee);

        internalTRIBalance = internalTRIBalance.add(_amountMinusFee);
        _mint(_msgSender(), _amountMinusFee);
        emit Migrated(_msgSender(), xTRI_, triBalanceUnstaked_, xTRIAmount_);
    }

    /**
     * @notice internal harvest function to claim only rewards till this block
     * @param userAddress The address of the user which has to claim the rewards
     * @param _previousAmount Previous amount of the user in userInfo
     * @param _newAmount New amount of the user in userInfo
     */
    function _harvest(
        address userAddress,
        uint256 _previousAmount,
        uint256 _newAmount
    ) internal {
        UserInfo storage user = userInfo[userAddress];

        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            updateReward(_token);

            uint256 _previousRewardDebt = user.rewardDebt[_token];
            user.rewardDebt[_token] = _newAmount.mul(accRewardPerShare[_token]).div(ACC_REWARD_PER_SHARE_PRECISION);

            if (_previousAmount != 0) {
                uint256 _pending = _previousAmount
                    .mul(accRewardPerShare[_token])
                    .div(ACC_REWARD_PER_SHARE_PRECISION)
                    .sub(_previousRewardDebt);
                if (_pending != 0) {
                    safeTokenTransfer(_token, userAddress, _pending);
                    emit ClaimReward(userAddress, address(_token), _pending);
                }
            }
        }
    }

    /**
     * @notice Internal function called before an address sends pTRI tokens
     * function manages userInfo and distributes any outstanding rewards
     * @param _sender The address of the user is sending pTRI tokens
     * @param _amount The amount of the tokens being sent
     */
    function _beforeSend(address _sender, uint256 _amount) internal {
        // Managing userInfo + pendingTokens of the sender
        UserInfo storage userSender = userInfo[_sender];
        uint256 _previousAmountSender = userSender.amount;
        require(_amount <= _previousAmountSender, "StableTRIStaking: withdraw amount exceeds balance");
        uint256 _newAmountSender = userSender.amount.sub(_amount);
        userSender.amount = _newAmountSender;
        _harvest(_sender, _previousAmountSender, _newAmountSender);
    }

    /**
     * @notice Internal function called before an address receives pTRI tokens
     * function manages userInfo and distributes any outstanding rewards
     * @param _recipient The address of the user which is receiving pTRI tokens
     * @param _amount The amount of the tokens being received
     */
    function _beforeReceive(address _recipient, uint256 _amount) internal {
        // Managing userInfo + pendingTokens of the receiver
        UserInfo storage userRecepient = userInfo[_recipient];
        uint256 _previousAmountRecepient = userRecepient.amount;
        uint256 _newAmountRecepient = userRecepient.amount.add(_amount);
        userRecepient.amount = _newAmountRecepient;
        _harvest(_recipient, _previousAmountRecepient, _newAmountRecepient);
    }

    /**
     * @notice external harvest function to claim only rewards till this block
     */
    function harvest(address _receiver) external {
        UserInfo storage user = userInfo[_receiver];
        _harvest(_receiver, user.amount, user.amount);
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance qnd userInfo.amount of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        // manage user info and pendingRewards
        _beforeSend(_msgSender(), amount);
        _beforeReceive(recipient, amount);

        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * Requirements:
     *
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - the caller must have allowance for ``sender``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        // manage user info and pendingRewards
        _beforeSend(sender, amount);
        _beforeReceive(recipient, amount);

        _transfer(sender, recipient, amount);
        uint256 newAllowance = allowance(sender, _msgSender()).sub(amount, "ERC20: transfer amount exceeds allowance");
        _approve(sender, _msgSender(), newAllowance);
        return true;
    }
}
