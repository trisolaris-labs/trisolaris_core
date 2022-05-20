// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.7;

import { ERC20 } from "./ERC20.sol";
import { ERC20Helper } from "./ERC20Helper.sol";
import { ITriBar } from "../rewards/interfaces/ITriBar.sol";

import { IRevenueDistributionToken } from "./interfaces/IRevenueDistributionToken.sol";

/*
    ██████╗ ██████╗ ████████╗
    ██╔══██╗██╔══██╗╚══██╔══╝
    ██████╔╝██║  ██║   ██║
    ██╔══██╗██║  ██║   ██║
    ██║  ██║██████╔╝   ██║
    ╚═╝  ╚═╝╚═════╝    ╚═╝
*/

contract RevenueDistributionToken is IRevenueDistributionToken, ERC20 {
    uint256 public immutable override precision = 1e9; // Precision of rates, equals max deposit amounts before rounding errors occur

    address public override asset; // Underlying revenue share asset
    address public revenueAsset;

    address public override owner; // Current owner of the contract, able to update the vesting schedule.
    address public override pendingOwner; // Pending owner of the contract, able to accept ownership.

    uint256 public override freeAssets; // Amount of revenue assets unlocked regardless of time passed.
    uint256 public override issuanceRate; // asset/second rate dependent on aggregate vesting schedule.
    uint256 public override lastUpdated; // Timestamp of when issuance equation was last updated.
    uint256 public override vestingPeriodFinish; // Timestamp when current vesting schedule ends.

    uint256 private locked = 1; // Used in reentrancy check.
    mapping(address => uint256) private lastDeposited; // Used in preventing flashloan claims

    /*****************/
    /*** Modifiers ***/
    /*****************/

    modifier nonReentrant() {
        require(locked == 1, "RDT:LOCKED");

        locked = 2;

        _;

        locked = 1;
    }

    /*****************/
    /*** Events ***/
    /*****************/

    event Migrated(address xTRI, address asset, uint256 triUnstaked, uint256 shares);
    event ReclaimTokens(address token_, uint256 amount_, address payable receiver_);

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        address revenueAsset_,
        address asset_
    ) ERC20(name_, symbol_, ERC20(asset_).decimals()) {
        require((owner = owner_) != address(0), "RDT:C:OWNER_ZERO_ADDRESS");

        revenueAsset = revenueAsset_; // Don't need to check zero address as ERC20(asset_).decimals() will fail in ERC20 constructor.
        asset = asset_;
    }

    /********************************/
    /*** Administrative Functions ***/
    /********************************/

    function acceptOwnership() external virtual override {
        require(msg.sender == pendingOwner, "RDT:AO:NOT_PO");

        emit OwnershipAccepted(owner, msg.sender);

        owner = msg.sender;
        pendingOwner = address(0);
    }

    function setPendingOwner(address pendingOwner_) external virtual override {
        require(msg.sender == owner, "RDT:SPO:NOT_OWNER");

        pendingOwner = pendingOwner_;

        emit PendingOwnerSet(msg.sender, pendingOwner_);
    }

    function updateVestingSchedule(uint256 vestingPeriod_)
        external
        virtual
        override
        returns (uint256 issuanceRate_, uint256 freeAssets_)
    {
        require(msg.sender == owner, "RDT:UVS:NOT_OWNER");

        // Update "y-intercept" to reflect current available asset.
        freeAssets_ = freeAssets = totalClaimableRevenueAssets();

        // Calculate slope.
        issuanceRate_ = issuanceRate =
            ((ERC20(revenueAsset).balanceOf(address(this)) - freeAssets_) * precision) /
            vestingPeriod_;

        // Update timestamp and period finish.
        vestingPeriodFinish = (lastUpdated = block.timestamp) + vestingPeriod_;

        emit IssuanceParamsUpdated(freeAssets_, issuanceRate_);
        emit VestingScheduleUpdated(msg.sender, vestingPeriodFinish);
    }

    // @notice Allows owner to reclaim/withdraw any tokens (including reward tokens) held by this contract
    /// @param token_ Token to reclaim, use 0x00 for Ethereum
    /// @param amount_ Amount of tokens to reclaim
    /// @param receiver_ Receiver of the tokens
    function reclaimTokens(
        address token_,
        uint256 amount_,
        address payable receiver_
    ) public {
        require(msg.sender == owner, "RDT:RT:NOT_OWNER");
        if (token_ == address(0)) {
            receiver_.transfer(amount_);
        } else {
            ERC20Helper.transfer(token_, receiver_, amount_);
        }
    }

    /************************/
    /*** Staker Functions ***/
    /************************/

    function deposit(uint256 asset_, address receiver_)
        external
        virtual
        override
        nonReentrant
        returns (uint256 shares_)
    {
        require(receiver_ != address(0), "RDT:D:ZERO_RECEIVER");
        _claim(receiver_);
        _mint(shares_ = asset_, asset_, receiver_, msg.sender);
    }

    function depositWithPermit(
        uint256 asset_,
        address receiver_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external virtual override nonReentrant returns (uint256 shares_) {
        require(receiver_ != address(0), "RDT:DWP:ZERO_RECEIVER");
        _claim(receiver_);
        ERC20(asset).permit(msg.sender, address(this), asset_, deadline_, v_, r_, s_);
        _mint(shares_ = asset_, asset_, receiver_, msg.sender);
    }

    function mint(uint256 shares_, address receiver_) external virtual override nonReentrant returns (uint256 assets_) {
        _mint(shares_, assets_ = shares_, receiver_, msg.sender);
    }

    function mintWithPermit(
        uint256 shares_,
        address receiver_,
        uint256 maxAssets_,
        uint256 deadline_,
        uint8 v_,
        bytes32 r_,
        bytes32 s_
    ) external virtual override nonReentrant returns (uint256 assets_) {
        require((assets_ = previewMint(shares_)) <= maxAssets_, "RDT:MWP:INSUFFICIENT_PERMIT");

        ERC20(asset).permit(msg.sender, address(this), maxAssets_, deadline_, v_, r_, s_);
        _mint(shares_, assets_, receiver_, msg.sender);
    }

    function withdraw(
        uint256 asset_,
        address receiver_,
        address owner_
    ) external virtual override nonReentrant returns (uint256 shares_) {
        _claim(receiver_);
        _burn(shares_ = asset_, asset_, receiver_, owner_, msg.sender);
    }

    function redeem(
        uint256 shares_,
        address receiver_,
        address owner_
    ) external override returns (uint256 assets_) {
        _claim(receiver_);
        _burn(shares_, assets_ = shares_, receiver_, owner_, msg.sender);
    }

    function claim(address receiver_) external virtual nonReentrant returns (uint256 claimableRevenueAssets_) {
        _claim(receiver_);
    }

    function migrate(
        address receiver_,
        address xTRI_,
        uint256 xTRIAmount_
    ) external virtual nonReentrant returns (uint256 shares_) {
        require(ERC20(xTRI_).transferFrom(receiver_, address(this), xTRIAmount_), "RDT:M:INSUFFICIENT_PERMIT");
        uint256 triBalanceBefore = ERC20(asset).balanceOf(address(this));
        ITriBar(xTRI_).leave(xTRIAmount_);
        uint256 triBalanceUnstaked = ERC20(asset).balanceOf(address(this)) - triBalanceBefore;

        _mint(shares_ = triBalanceUnstaked, triBalanceUnstaked, receiver_, address(this));
    }

    /**************************/
    /*** Internal Functions ***/
    /**************************/

    function _mint(
        uint256 shares_,
        uint256 triAmount_,
        address receiver_,
        address caller_
    ) internal {
        require(receiver_ != address(0), "RDT:M:ZERO_RECEIVER");
        require(shares_ != uint256(0), "RDT:M:ZERO_SHARES");
        require(triAmount_ != uint256(0), "RDT:M:ZERO_ASSETS");
        lastDeposited[caller_] = block.timestamp;

        _mint(receiver_, shares_);

        uint256 freeAssetsCache = freeAssets = totalClaimableRevenueAssets();

        uint256 issuanceRate_ = _updateIssuanceParams();

        emit Deposit(caller_, receiver_, triAmount_, shares_);
        emit IssuanceParamsUpdated(freeAssetsCache, issuanceRate_);

        require(ERC20Helper.transferFrom(asset, caller_, address(this), triAmount_), "RDT:M:TRANSFER_FROM");
    }

    function _burn(
        uint256 shares_,
        uint256 triAmount_,
        address receiver_,
        address owner_,
        address caller_
    ) internal {
        require(receiver_ != address(0), "RDT:B:ZERO_RECEIVER");
        require(shares_ != uint256(0), "RDT:B:ZERO_SHARES");
        require(triAmount_ != uint256(0), "RDT:B:ZERO_ASSETS");
        require(balanceOf[owner_] >= shares_, "RDT:B:INSUFFICIENT_BALANCE");

        if (caller_ != owner_) {
            _decreaseAllowance(owner_, caller_, shares_);
        }

        _burn(owner_, shares_);

        uint256 freeAssetsCache = freeAssets = totalClaimableRevenueAssets();

        uint256 issuanceRate_ = _updateIssuanceParams();

        emit Withdraw(caller_, receiver_, owner_, triAmount_, shares_);
        emit IssuanceParamsUpdated(freeAssetsCache, issuanceRate_);

        require(ERC20Helper.transfer(asset, receiver_, triAmount_), "RDT:B:TRANSFER");
    }

    function _claim(address receiver_) internal returns (uint256 claimableRevenueAssets_) {
        require(ERC20Helper.transfer(revenueAsset, receiver_, claimableRevenueAssets(receiver_)), "RDT:C:TRANSFER");

        claimableRevenueAssets_ = claimableRevenueAssets(receiver_);
    }

    function _updateIssuanceParams() internal returns (uint256 issuanceRate_) {
        return issuanceRate = (lastUpdated = block.timestamp) > vestingPeriodFinish ? 0 : issuanceRate;
    }

    /**********************/
    /*** View Functions ***/
    /**********************/

    // function claimableRevenueAssets(address account_) public view virtual returns (uint256 balanceOfAssets_) {
    //     return convertSharesToClaimableRevenueAssets(balanceOf[account_]);
    // }
    function claimableRevenueAssets(address account_) public view virtual returns (uint256 balanceOfAssets_) {
        uint256 issuanceRate_ = issuanceRate;

        if (ERC20(asset).balanceOf(address(this)) == 0) return 0;
        if (issuanceRate_ == 0) return freeAssets;

        uint256 vestingPeriodFinish_ = vestingPeriodFinish;
        uint256 lastUpdated_ = lastUpdated;

        uint256 vestingTimePassed = block.timestamp > vestingPeriodFinish_
            ? vestingPeriodFinish_ - lastDeposited[account_]
            : block.timestamp - lastDeposited[account_];

        uint256 supply = totalSupply; // Cache to stack.
        uint256 shares_ = balanceOf[account_];

        balanceOfAssets_ = (supply == 0 || shares_ == 0)
            ? 0
            : _divRoundUp((shares_ * ((issuanceRate_ * vestingTimePassed) / precision) + freeAssets), supply);
    }

    function convertSharesToClaimableRevenueAssets(uint256 shares_)
        public
        view
        virtual
        returns (uint256 claimableRevenueAssets_)
    {
        uint256 supply = totalSupply; // Cache to stack.

        claimableRevenueAssets_ = (supply == 0 || shares_ == 0)
            ? 0
            : _divRoundUp((shares_ * totalClaimableRevenueAssets()), supply);
    }

    function convertToShares(uint256 assets_) public view virtual override returns (uint256 shares_) {
        return assets_;
    }

    function maxDeposit(address receiver_) external pure virtual override returns (uint256 maxAssets_) {
        receiver_; // Silence warning
        maxAssets_ = type(uint256).max;
    }

    function maxMint(address receiver_) external pure virtual override returns (uint256 maxShares_) {
        receiver_; // Silence warning
        maxShares_ = type(uint256).max;
    }

    function maxRedeem(address owner_) external pure virtual override returns (uint256 maxShares_) {
        owner_; // Silence warning
        maxShares_ = type(uint256).max;
    }

    function maxWithdraw(address owner_) external view virtual override returns (uint256 maxAssets_) {
        owner_; // Silence warning
        maxAssets_ = type(uint256).max;
    }

    function previewMint(uint256 shares_) public pure virtual override returns (uint256 assets_) {
        return shares_;
    }

    function previewDeposit(uint256 assets_) external pure override returns (uint256 shares_) {
        return assets_;
    }

    function previewWithdraw(uint256 assets_) public pure virtual override returns (uint256 shares_) {
        return assets_;
    }

    function previewRedeem(uint256 shares_) public pure virtual override returns (uint256 assets_) {
        return shares_;
    }

    function totalAssets() external view override returns (uint256 totalAssets_) {
        return ERC20(asset).balanceOf(address(this));
    }

    function totalRevenueAssets() external view returns (uint256 totalAssets_) {
        return ERC20(revenueAsset).balanceOf(address(this));
    }

    function totalClaimableRevenueAssets() public view virtual returns (uint256 totalClaimableManagedAssets_) {
        uint256 issuanceRate_ = issuanceRate;

        if (ERC20(asset).balanceOf(address(this)) == 0) return 0;
        if (issuanceRate_ == 0) return freeAssets;

        uint256 vestingPeriodFinish_ = vestingPeriodFinish;
        uint256 lastUpdated_ = lastUpdated;

        uint256 vestingTimePassed = block.timestamp > vestingPeriodFinish_
            ? vestingPeriodFinish_ - lastUpdated_
            : block.timestamp - lastUpdated_;

        return ((issuanceRate_ * vestingTimePassed) / precision) + freeAssets;
    }

    function balanceOfAssets(address account_) external view override returns (uint256 assets_) {
        return claimableRevenueAssets(account_);
    }

    function convertToAssets(uint256 shares_) external pure override returns (uint256 assets_) {
        return shares_;
    }

    /**************************/
    /*** Internal Functions ***/
    /**************************/

    function _divRoundUp(uint256 numerator_, uint256 divisor_) internal pure returns (uint256 result_) {
        return (numerator_ / divisor_) + (numerator_ % divisor_ > 0 ? 1 : 0);
    }
}
