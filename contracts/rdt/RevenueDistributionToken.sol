// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.7;

import { ERC20 }       from "./ERC20.sol";
import { ERC20Helper } from "./ERC20Helper.sol";

import { IERC4626 } from "./interfaces/IERC4626.sol";

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

    uint256 public immutable override precision;  // Precision of rates, equals max deposit amounts before rounding errors occur

    address public override asset = 0xFa94348467f64D5A457F75F8bc40495D33c65aBB;           // Underlying revenue share asset
    address public revenueAsset;

    address public override owner;         // Current owner of the contract, able to update the vesting schedule.
    address public override pendingOwner;  // Pending owner of the contract, able to accept ownership.

    uint256 public override freeAssets;           // Amount of revenue assets unlocked regardless of time passed.
    uint256 public override issuanceRate;         // asset/second rate dependent on aggregate vesting schedule.
    uint256 public override lastUpdated;          // Timestamp of when issuance equation was last updated.
    uint256 public override vestingPeriodFinish;  // Timestamp when current vesting schedule ends.

    uint256 private locked = 1;  // Used in reentrancy check.

    /*****************/
    /*** Modifiers ***/
    /*****************/

    modifier nonReentrant() {
        require(locked == 1, "RDT:LOCKED");

        locked = 2;

        _;

        locked = 1;
    }

    constructor(string memory name_, string memory symbol_, address owner_, address revenueAsset_, uint256 precision_)
        ERC20(name_, symbol_, ERC20(revenueAsset_).decimals())
    {
        require((owner = owner_) != address(0), "RDT:C:OWNER_ZERO_ADDRESS");

        revenueAsset     = revenueAsset_;  // Don't need to check zero address as ERC20(asset_).decimals() will fail in ERC20 constructor.
        precision = precision_;
    }

    /********************************/
    /*** Administrative Functions ***/
    /********************************/

    function acceptOwnership() external virtual override {
        require(msg.sender == pendingOwner, "RDT:AO:NOT_PO");

        emit OwnershipAccepted(owner, msg.sender);

        owner        = msg.sender;
        pendingOwner = address(0);
    }

    function setPendingOwner(address pendingOwner_) external virtual override {
        require(msg.sender == owner, "RDT:SPO:NOT_OWNER");

        pendingOwner = pendingOwner_;

        emit PendingOwnerSet(msg.sender, pendingOwner_);
    }

    function updateVestingSchedule(uint256 vestingPeriod_) external virtual override returns (uint256 issuanceRate_, uint256 freeAssets_) {
        require(msg.sender == owner, "RDT:UVS:NOT_OWNER");
        require(totalSupply != 0,    "RDT:UVS:ZERO_SUPPLY");

        // Update "y-intercept" to reflect current available asset.
        freeAssets_ = freeAssets = totalClaimableRevenueAssets();

        // Calculate slope.
        issuanceRate_ = issuanceRate = ((ERC20(revenueAsset).balanceOf(address(this)) - freeAssets_) * precision) / vestingPeriod_;

        // Update timestamp and period finish.
        vestingPeriodFinish = (lastUpdated = block.timestamp) + vestingPeriod_;

        emit IssuanceParamsUpdated(freeAssets_, issuanceRate_);
        emit VestingScheduleUpdated(msg.sender, vestingPeriodFinish);
    }

    /************************/
    /*** Staker Functions ***/
    /************************/

    function deposit(uint256 asset_, address receiver_) external virtual override nonReentrant returns (uint256 shares_) {
        _mint(shares_ = asset_, asset_, receiver_, msg.sender);
    }

    function depositWithPermit(
        uint256 asset_,
        address receiver_,
        uint256 deadline_,
        uint8   v_,
        bytes32 r_,
        bytes32 s_
    )
        external virtual override nonReentrant returns (uint256 shares_)
    {
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
        uint8   v_,
        bytes32 r_,
        bytes32 s_
    )
        external virtual override nonReentrant returns (uint256 assets_)
    {
        require((assets_ = previewMint(shares_)) <= maxAssets_, "RDT:MWP:INSUFFICIENT_PERMIT");

        ERC20(asset).permit(msg.sender, address(this), maxAssets_, deadline_, v_, r_, s_);
        _mint(shares_, assets_, receiver_, msg.sender);
    }

    function withdraw(uint256 asset_, address receiver_, address owner_) external virtual override nonReentrant returns (uint256 shares_) {
        _burn(shares_ = asset_, asset_, receiver_, owner_, msg.sender);
    }
    
    function redeem(uint256 shares_, address receiver_, address owner_) external override returns (uint256 assets_) {
        _burn(shares_, assets_ = shares_, receiver_, owner_, msg.sender);
    }

    function claim(address receiver_) external virtual nonReentrant returns (uint256 claimableRevenueAssets_) {
        require(ERC20Helper.transfer(revenueAsset, receiver_, claimableRevenueAssets(receiver_)), "RDT:C:TRANSFER");
    }

    /**************************/
    /*** Internal Functions ***/
    /**************************/

    function _mint(uint256 shares_, uint256 triAmount_, address receiver_, address caller_) internal {
        require(receiver_    != address(0), "RDT:M:ZERO_RECEIVER");
        require(shares_      != uint256(0), "RDT:M:ZERO_SHARES");
        require(triAmount_   != uint256(0), "RDT:M:ZERO_ASSETS");

        _mint(receiver_, shares_);

        uint256 freeAssetsCache = freeAssets = totalClaimableRevenueAssets() + triAmount_;

        uint256 issuanceRate_ = _updateIssuanceParams();

        // emit Deposit(caller_, receiver_, triAmount_, shares_);
        emit IssuanceParamsUpdated(freeAssetsCache, issuanceRate_);

        require(ERC20Helper.transferFrom(asset, caller_, address(this), triAmount_), "RDT:M:TRANSFER_FROM");
    }

    function _burn(uint256 shares_, uint256 triAmount_, address receiver_, address owner_, address caller_) internal {
        require(receiver_   != address(0), "RDT:B:ZERO_RECEIVER");
        require(shares_     != uint256(0), "RDT:B:ZERO_SHARES");
        require(triAmount_  != uint256(0), "RDT:B:ZERO_ASSETS");

        if (caller_ != owner_) {
            _decreaseAllowance(owner_, caller_, shares_);
        }

        _burn(owner_, shares_);

        uint256 freeAssetsCache = freeAssets = totalClaimableRevenueAssets() - triAmount_;

        uint256 issuanceRate_ = _updateIssuanceParams();

        // emit Withdraw(caller_, receiver_, owner_, triAmount_, shares_);
        emit IssuanceParamsUpdated(freeAssetsCache, issuanceRate_);

        require(ERC20Helper.transfer(asset, receiver_, triAmount_), "RDT:B:TRANSFER");
    }

    function _updateIssuanceParams() internal returns (uint256 issuanceRate_) {
        return issuanceRate = (lastUpdated = block.timestamp) > vestingPeriodFinish ? 0 : issuanceRate;
    }

    /**********************/
    /*** View Functions ***/
    /**********************/

    function claimableRevenueAssets(address account_) public view virtual returns (uint256 balanceOfAssets_) {
        return convertSharesToClaimableRevenueAssets(balanceOf[account_]);
    }

    function convertSharesToClaimableRevenueAssets(uint256 shares_) public view virtual returns (uint256 claimableRevenueAssets_) {
        uint256 supply = totalSupply;  // Cache to stack.

        claimableRevenueAssets_ = supply == 0 ? shares_ : (shares_ * totalClaimableRevenueAssets()) / supply;
    }

    function convertToShares(uint256 assets_) public view virtual override returns (uint256 shares_) {
        uint256 supply = totalSupply;  // Cache to stack.

        shares_ = supply == 0 ? assets_ : (assets_ * supply) / totalClaimableRevenueAssets();
    }

    function maxDeposit(address receiver_) external pure virtual override returns (uint256 maxAssets_) {
        receiver_;  // Silence warning
        maxAssets_ = type(uint256).max;
    }

    function maxMint(address receiver_) external pure virtual override returns (uint256 maxShares_) {
        receiver_;  // Silence warning
        maxShares_ = type(uint256).max;
    }
    
    function maxRedeem(address owner_) external pure virtual override returns (uint256 maxShares_) {
        owner_;  // Silence warning
        maxShares_ = type(uint256).max;
    }

    function maxWithdraw(address owner_) external view virtual override returns (uint256 maxAssets_) {
        maxAssets_ = claimableRevenueAssets(owner_);
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

    function totalClaimableRevenueAssets() public view virtual returns (uint256 totalClaimableManagedAssets_) {
        uint256 issuanceRate_ = issuanceRate;

        if (issuanceRate_ == 0) return freeAssets;

        uint256 vestingPeriodFinish_ = vestingPeriodFinish;
        uint256 lastUpdated_         = lastUpdated;

        uint256 vestingTimePassed =
            block.timestamp > vestingPeriodFinish_ ?
                vestingPeriodFinish_ - lastUpdated_ :
                block.timestamp - lastUpdated_;

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