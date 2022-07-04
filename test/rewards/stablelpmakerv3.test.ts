import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, asyncForEach } from "../utils";

describe("StableLpMaker - V3", function () {
  before(async function () {
    this.LPMakerV3 = await ethers.getContractFactory("StableLPMakerV3");
    this.LPMakerV3ExploitMock = await ethers.getContractFactory("StableLpMakerExploitMockV3");

    this.signers = await ethers.getSigners();
    this.owner = this.signers[0];
    this.user1 = this.signers[1];
    this.user2 = this.signers[2];
    this.pTRI = this.signers[3];
    this.dao = this.signers[4];

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  });

  beforeEach(async function () {
    await ethers.provider.send("hardhat_reset", []);
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.lpTokenBase = await LpTokenFactory.deploy();
    await this.lpTokenBase.deployed();
    await this.lpTokenBase.initialize("Test Token", "TEST");

    const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", this.owner);
    this.amplificationUtils = await AmpUtilsFactory.deploy();
    await this.amplificationUtils.deployed();

    const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", this.owner);
    this.swapUtils = await SwapUtilsFactory.deploy();
    await this.swapUtils.deployed();

    const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
        libraries: {
        SwapUtils: this.swapUtils.address,
        AmplificationUtils: this.amplificationUtils.address,
        },
    });
    this.swapFlashLoan = await SwapFlashLoanFactory.connect(this.owner).deploy();
    await this.swapFlashLoan.deployed();

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner);
    this.usn = await ERC20Mock.connect(this.owner).deploy("USN", "USN", 18, getBigNumber("1000"));
    await this.usn.deployed();
    this.usdt = await ERC20Mock.connect(this.owner).deploy("USDT", "USDT", 18, getBigNumber("1000"));
    await this.usdt.deployed();
    this.usdc = await ERC20Mock.connect(this.owner).deploy("USDC", "USDC", 18, getBigNumber("1000"));
    await this.usdc.deployed();
    this.ust = await ERC20Mock.connect(this.owner).deploy("UST", "UST", 18, getBigNumber("1000"));
    await this.ust.deployed();

    // Constructor arguments
    const TOKEN_ADDRESSES = [this.usdc.address, this.usdt.address, this.usn.address];
    const TOKEN_DECIMALS = [18, 18, 18];
    this.LP_TOKEN_NAME = "Saddle USDC/USDT/USN";
    this.LP_TOKEN_SYMBOL = "saddleTestUSD";
    this.INITIAL_A = 50;
    this.SWAP_FEE = 1e6; // 1bps
    this.ADMIN_FEE = 0;

    await this.swapFlashLoan
        .connect(this.owner)
        .initialize(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        this.LP_TOKEN_NAME,
        this.LP_TOKEN_SYMBOL,
        this.INITIAL_A,
        this.SWAP_FEE,
        this.ADMIN_FEE,
        this.lpTokenBase.address,
        );
    const swapStorage = await this.swapFlashLoan.swapStorage();
    this.swapLPToken = LpTokenFactory.attach(swapStorage.lpToken);

    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
        await this.usn.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
        await this.usdt.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
        await this.usdc.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
        await this.ust.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
        await this.swapLPToken.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
        await this.usn.transfer(signer.address, getBigNumber("300"));
        await this.usdt.transfer(signer.address, getBigNumber("300"));
        await this.usdc.transfer(signer.address, getBigNumber("300"));
        await this.ust.transfer(signer.address, getBigNumber("300"));
    });

    const MetaSwapUtilsFactory = await ethers.getContractFactory("MetaSwapUtils", this.owner);
    this.metaSwapUtils = await MetaSwapUtilsFactory.deploy();
    await this.metaSwapUtils.deployed();

    const MetaSwapFactory = await ethers.getContractFactory("MetaSwap", {
        libraries: {
        SwapUtils: this.swapUtils.address,
        AmplificationUtils: this.amplificationUtils.address,
        MetaSwapUtils: this.metaSwapUtils.address,
        },
    });
    this.metaSwap = await MetaSwapFactory.connect(this.owner).deploy();
    await this.metaSwap.deployed();

    // Set approvals
    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
        await this.usn.connect(signer).approve(this.metaSwap.address, this.MAX_UINT256);
        await this.usdt.connect(signer).approve(this.metaSwap.address, this.MAX_UINT256);
        await this.usdc.connect(signer).approve(this.metaSwap.address, this.MAX_UINT256);
        await this.ust.connect(signer).approve(this.metaSwap.address, this.MAX_UINT256);
        await this.swapLPToken.connect(signer).approve(this.metaSwap.address, this.MAX_UINT256);

        // Add some liquidity to the base pool
        await this.swapFlashLoan
        .connect(signer)
        .addLiquidity([String(1e20), String(1e20), String(1e20)], 0, this.MAX_UINT256);
    });

    // Test Values
    const INITIAL_A_VALUE = 50;
    const SWAP_FEE = 1e7;
    const META_LP_TOKEN_NAME = "Meta Test LP Token Name";
    const META_LP_TOKEN_SYMBOL = "Meta TESTLP";

    // Initialize meta swap pool
    // Manually overload the signature
    await this.metaSwap.initializeMetaSwap(
      [this.ust.address, this.swapLPToken.address],
      [18, 18],
      META_LP_TOKEN_NAME,
      META_LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      0,
      this.lpTokenBase.address,
      this.swapFlashLoan.address,
    );
    const metaSwapStorage = await this.metaSwap.swapStorage();
    const metaLpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.metaSwapLPToken = metaLpTokenFactory.attach(metaSwapStorage.lpToken);

    const MetaSwapDepositFactory = await ethers.getContractFactory("MetaSwapDeposit", this.owner)
    this.metaSwapDeposit = await MetaSwapDepositFactory.deploy()

    // Initialize MetaSwapDeposit
    await this.metaSwapDeposit.initialize(
      this.swapFlashLoan.address,
      this.metaSwap.address,
      this.metaSwapLPToken.address,
    )

    // Add liquidity to the meta swap pool
    await this.metaSwap.addLiquidity([String(1e18), String(1e18)], 0, this.MAX_UINT256);

    expect(await this.ust.balanceOf(this.metaSwap.address)).to.eq(String(1e18));
    expect(await this.swapLPToken.balanceOf(this.metaSwap.address)).to.eq(String(1e18));

    this.lpMakerV3 = await this.LPMakerV3.connect(this.owner).deploy(
      this.swapFlashLoan.address,
      this.pTRI.address,
      this.usn.address,
      this.usdc.address,
      this.usdt.address,
      this.swapLPToken.address,
      this.dao.address,
    );
    await this.lpMakerV3.deployed();
    this.exploiter = await this.LPMakerV3ExploitMock.connect(this.owner).deploy(this.lpMakerV3.address);
    await this.exploiter.deployed();
    await this.swapFlashLoan.connect(this.owner).setFeeAddress(this.lpMakerV3.address);
    
    await this.swapFlashLoan.setAdminFee(getBigNumber(10, 8));
    await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
    expect(await this.swapFlashLoan.feeAddress()).to.eq(this.lpMakerV3.address);

    await this.ust.connect(this.owner).transfer(this.owner.address, getBigNumber("10"));
    await this.ust.connect(this.owner).approve(this.swapFlashLoan.address, this.MAX_UINT256);
    await this.metaSwap.connect(this.owner).setFeeAddress(this.lpMakerV3.address);
    await this.metaSwap.setAdminFee(getBigNumber(10, 8));
    await this.metaSwap.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
    await this.metaSwap.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);

    expect(await this.metaSwap.feeAddress()).to.eq(this.lpMakerV3.address);
  });

  it("should withdraw fees to stableLPMakerV3 from stableswap", async function () {
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal("0");
    expect(await this.swapFlashLoan.feeAddress()).to.eq(this.lpMakerV3.address);
    await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(999993464094);
    // gets no fees now
    await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(999993464094);
  });

  it("should withdraw fees to stableLPMakerV3 from metastableswap", async function () {
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal("0");
    expect(await this.metaSwap.feeAddress()).to.eq(this.lpMakerV3.address);

    await this.lpMakerV3.withdrawStableTokenFees(this.metaSwap.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(10019739648609);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(9980241397654);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(0);
    // gets no fees now
    await this.lpMakerV3.withdrawStableTokenFees(this.metaSwap.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(10019739648609);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(9980241397654);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(0);
  });

  it("should remove liquidity of baseLps", async function () {
    await this.lpMakerV3.withdrawStableTokenFees(this.metaSwap.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(10019739648609);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(9980241397654);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    // should revert for not whitelisted stableswaps
    await expect(this.lpMakerV3.removeLiquidity(this.swapFlashLoan.address)).to.be.revertedWith(
        "StableLPMaker: Stableswap not whitelisted",
      );
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.swapFlashLoan.address);
    expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.swapFlashLoan.address)).to.equal(true);
  
    await this.lpMakerV3.removeLiquidity(this.swapFlashLoan.address);
    // swapLPToken is converted into base tokens
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(10019739648609);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(3326747132551);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(3327856048262);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(3325638323890);
  });

  it("should convert USDC to USDT ", async function () {
    await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(999993464094);
    // should revert for not whitelisted stableswaps
    await expect(this.lpMakerV3.swapStableTokens(this.swapFlashLoan.address, 0, 1)).to.be.revertedWith(
      "StableLPMaker: Stableswap not whitelisted",
    );
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.swapFlashLoan.address);
    expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.swapFlashLoan.address)).to.equal(true);

    // converting USN to usdt
    await this.lpMakerV3.swapStableTokens(this.swapFlashLoan.address, 0, 1);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(999906534642);
  });

  it("should convert UST to USDC ", async function () {
    await this.lpMakerV3.withdrawStableTokenFees(this.metaSwap.address);
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.swapFlashLoan.address);
    await this.lpMakerV3.removeLiquidity(this.swapFlashLoan.address);
    // swapLPToken is converted into base tokens
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(10019739648609);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(3326747132551);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(3327856048262);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(3325638323890);

    /// Will use metaswapdeposit to swap ust to usdc
    // should revert for not whitelisted stableswaps
    await expect(this.lpMakerV3.swapStableTokens(this.metaSwapDeposit.address, 0, 1)).to.be.revertedWith(
      "StableLPMaker: Stableswap not whitelisted",
    );
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.metaSwapDeposit.address);
    expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.metaSwapDeposit.address)).to.equal(true);
    await this.lpMakerV3.swapStableTokens(this.metaSwapDeposit.address, 0, 1);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(3326747132551);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(3327856048262);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(13334867809052);

  });

  it("should add liquidity to stableswap", async function () {
    await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
    expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
    expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(999993464094);
    await this.lpMakerV3.addLiquidityToStableSwap();
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(999949982842);
    expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
  });

  it("should send assets to pTRI ", async function () {
    await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
    await this.lpMakerV3.addLiquidityToStableSwap();
    expect(await this.swapLPToken.balanceOf(this.lpMakerV3.address)).to.equal(999949982842);
    await this.lpMakerV3.sendLpToken();
    expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.be.closeTo("999949982842", 10);
  });

  it("should fail to send tlp to pTRI when not enough balance", async function () {
    await expect(this.lpMakerV3.sendLpToken()).to.be.revertedWith("StableLpMaker: no TLP to send");
  });

  it("should revert if caller is not EOA", async function () {
    await expect(
      this.exploiter.convertStables([this.swapFlashLoan.address], [this.metaSwap.address], [this.swapFlashLoan.address], [0], [2]),
    ).to.be.revertedWith("StableLPMaker: must use EOA");
  });

  it("should run all the steps together without converting assets", async function () {
    expect(await this.swapLPToken.balanceOf(this.dao.address)).to.equal(0);
    expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.equal(0);
    await this.lpMakerV3.convertStables([this.swapFlashLoan.address], [], [], [], []);
    expect(await this.swapLPToken.balanceOf(this.dao.address)).to.be.closeTo("0", 10);
    expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.be.closeTo("999949982842", 10);
  });

  it("should convert usdc, ust to usn, and perform all steps", async function () {
    // TODO: also withdraw metaswap fees
    expect(await this.swapLPToken.balanceOf(this.dao.address)).to.equal(0);
    expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.equal(0);
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.swapFlashLoan.address);
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.metaSwap.address);
    await this.lpMakerV3.connect(this.owner).addStableSwap(this.metaSwapDeposit.address);
    await this.lpMakerV3.convertStables(
      [this.swapFlashLoan.address, this.metaSwap.address],
      [this.metaSwap.address],
      [this.swapFlashLoan.address, this.metaSwapDeposit.address],
      [0, 0],
      [2, 3],
    );
    expect(await this.swapLPToken.balanceOf(this.dao.address)).to.be.closeTo("0", 10);
    expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.be.closeTo("20988885828069", 10);
  });

  describe("StableLPMakerV3: Dao Tests", function () {
    it("should have correct dao address", async function () {
      expect(await this.lpMakerV3.dao()).to.equal(this.dao.address);
    });

    it("should send 50% of fees to dao", async function () {
      expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
      expect(await this.swapLPToken.balanceOf(this.dao.address)).to.equal(0);

      await this.lpMakerV3.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.ust.balanceOf(this.lpMakerV3.address)).to.equal(0);
      expect(await this.usn.balanceOf(this.lpMakerV3.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.lpMakerV3.address)).to.equal(999993464094);
      expect(await this.usdt.balanceOf(this.lpMakerV3.address)).to.equal(0);
      await this.lpMakerV3.addLiquidityToStableSwap();
      await this.lpMakerV3.connect(this.owner).setProtocolOwnerLiquidityPercent(50);
      await this.lpMakerV3.sendLpToken();
      expect(await this.swapLPToken.balanceOf(this.dao.address)).to.be.closeTo("499974991421", 10);
      expect(await this.swapLPToken.balanceOf(this.pTRI.address)).to.be.closeTo("499974991421", 10);
    });
  });

  describe("StableLPMakerV3: onlyOwner tests", function () {
    it("only owner should be able to change pTRI addresses", async function () {
      await expect(this.lpMakerV3.connect(this.user1).setPTri(this.usdt.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(this.lpMakerV3.connect(this.owner).setPTri(this.user1.address))
        .to.emit(this.lpMakerV3, "LogSetpTri")
        .withArgs(this.pTRI.address, this.user1.address);
      expect(await this.lpMakerV3.pTri()).to.equal(this.user1.address);
    });

    it("Only owner can change dao address", async function () {
      await expect(this.lpMakerV3.connect(this.user1).setDaoAddress(this.user1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await this.lpMakerV3.connect(this.owner).setDaoAddress(this.user1.address);
      expect(await this.lpMakerV3.dao()).to.equal(this.user1.address);
      await this.lpMakerV3.connect(this.owner).setDaoAddress(this.dao.address);
      expect(await this.lpMakerV3.dao()).to.equal(this.dao.address);
    });

    it("should have correct pol percent", async function () {
      expect(await this.lpMakerV3.polPercent()).to.equal(0);
      await expect(this.lpMakerV3.connect(this.user1).setProtocolOwnerLiquidityPercent(49)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(this.lpMakerV3.connect(this.owner).setProtocolOwnerLiquidityPercent(101)).to.be.revertedWith(
        "StableLPMaker: POL is too high",
      );
      await this.lpMakerV3.connect(this.owner).setProtocolOwnerLiquidityPercent(50);
      expect(await this.lpMakerV3.polPercent()).to.equal(50);
    });

    it("should be able to add and remove from the whitelist", async function () {
      // adding a stableswap
      expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.swapFlashLoan.address)).to.equal(false);
      await expect(this.lpMakerV3.connect(this.user1).addStableSwap(this.swapFlashLoan.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await this.lpMakerV3.connect(this.owner).addStableSwap(this.swapFlashLoan.address);
      expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.swapFlashLoan.address)).to.equal(true);

      // removing stableswap
      await expect(this.lpMakerV3.connect(this.user1).removeStableSwap(this.swapFlashLoan.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await this.lpMakerV3.connect(this.owner).removeStableSwap(this.swapFlashLoan.address);
      expect(await this.lpMakerV3.whitelistedStableSwapAddresses(this.swapFlashLoan.address)).to.equal(false);
    });
  });
});