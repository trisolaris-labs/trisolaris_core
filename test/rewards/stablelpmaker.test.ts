import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, setupStableSwap, asyncForEach } from "../utils";

describe("StableLpMaker", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    this.user1 = this.signers[1]
    this.user2 = this.signers[2]
    this.pTRI = this.signers[3]
    this.dao = this.signers[4]
        
    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    await setupStableSwap(this, this.owner)

    this.UsnMaker = await ethers.getContractFactory("StableLpMaker");
    this.UsnMakerExploitMock = await ethers.getContractFactory("StableLpMakerExploitMock");
    this.ZeroAddress = "0x0000000000000000000000000000000000000000";

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner)
    this.usdc = await ERC20Mock.connect(this.owner).deploy("USDC", "USDC",  18, getBigNumber("300"))
    await this.usdc.deployed()
    this.usdt = await ERC20Mock.connect(this.owner).deploy("USDT", "USDT",  18, getBigNumber("300"))
    await this.usdt.deployed()
    this.usn = await ERC20Mock.connect(this.owner).deploy("USN", "USN",  18, getBigNumber("300"))
    await this.usn.deployed()

    // transferring to users
    await this.usdc.transfer(this.user1.address, getBigNumber("100"))
    await this.usdc.transfer(this.user2.address, getBigNumber("100"))
    await this.usdt.transfer(this.user1.address, getBigNumber("100"))
    await this.usdt.transfer(this.user2.address, getBigNumber("100"))
    await this.usn.transfer(this.user1.address, getBigNumber("100"))
    await this.usn.transfer(this.user2.address, getBigNumber("100"))

    const TOKEN_ADDRESSES = [this.usdc.address, this.usdt.address, this.usn.address];
    const TOKEN_DECIMALS = [18, 18, 18];
    this.LP_TOKEN_NAME = "USDC/USDT/USN";
    this.LP_TOKEN_SYMBOL = "Tri 3Pool";
    this.INITIAL_A = 50;
    this.SWAP_FEE = 1e7; // 10bps
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
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.swapToken = LpTokenFactory.attach(swapStorage.lpToken);

    expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq(0);

    const testSwapReturnValuesFactory = await ethers.getContractFactory("TestSwapReturnValues");
    this.testSwapReturnValues = await testSwapReturnValuesFactory.deploy(
      this.swapFlashLoan.address,
      this.swapToken.address,
      3,
    );

    this.usnMaker = await this.UsnMaker.connect(this.owner).deploy(this.swapFlashLoan.address,this.pTRI.address,this.usn.address,this.usdc.address, this.usdt.address, this.swapToken.address, this.dao.address)
    await this.usnMaker.deployed()
    this.exploiter = await this.UsnMakerExploitMock.connect(this.owner).deploy(this.usnMaker.address)
    await this.exploiter.deployed()

    await this.usdc.connect(this.owner).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usdt.connect(this.owner).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usn.connect(this.owner).transfer(this.testSwapReturnValues.address, getBigNumber("10"));
    await this.usdc.connect(this.owner).transfer(this.owner.address, getBigNumber("10"));
    await this.usdt.connect(this.owner).transfer(this.owner.address, getBigNumber("10"));
    await this.usn.connect(this.owner).transfer(this.owner.address, getBigNumber("10"));

    await asyncForEach([this.owner, this.user1, this.user2], async signer => {
      await this.usdc.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.usdt.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.usn.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
      await this.swapToken.connect(signer).approve(this.swapFlashLoan.address, this.MAX_UINT256);
    });
    await this.swapFlashLoan.addLiquidity([String(1e18), String(1e18), String(1e18)], 0, this.MAX_UINT256);

    expect(await this.usdc.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
    expect(await this.usdt.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));
    expect(await this.usn.balanceOf(this.swapFlashLoan.address)).to.eq(String(1e18));

    await this.swapFlashLoan.connect(this.owner).setFeeAddress(this.usnMaker.address);
    await this.swapFlashLoan.setAdminFee(getBigNumber(10, 8));
    await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
    await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
  });

  describe("StableUsnMaker Unit Tests", function () {
    it("should withdraw fees to stableUsnMaker from stableswap", async function () {
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal("0");
      await this.usnMaker.withdrawStableTokenFees();
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.usnMaker.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.usnMaker.address)).to.equal(9980241397654);
      await this.usnMaker.withdrawStableTokenFees();
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.usnMaker.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.usnMaker.address)).to.equal(9980241397654);
    });

    it("should convert USN ", async function () {
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal("0");
      expect(await this.usdc.balanceOf(this.usnMaker.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.usnMaker.address)).to.equal(9980241397654);
      await this.usnMaker.swapStableTokensToUsn();
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(19979939773100);
      expect(await this.usdc.balanceOf(this.usnMaker.address)).to.equal(0);
      expect(await this.usdt.balanceOf(this.usnMaker.address)).to.equal(0);
    });

    it("should add liquidity to stableswap", async function () {
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(19979939773100);
      await this.usnMaker.addLiquidityToStableSwap();
      expect(await this.swapToken.balanceOf(this.usnMaker.address)).to.equal(19968778622668);
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
    });

    it("should send assets to pTRI ", async function () {
      expect(await this.swapToken.balanceOf(this.usnMaker.address)).to.equal(19968778622668);
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
      await this.usnMaker.sendLpToken();
    });

    it("should fail to send usn when not enough balance", async function () {
      await expect(this.usnMaker.sendLpToken()).to.be.revertedWith("StableLPMaker: no TLP to send");
    })

    it("should revert if caller is not EOA", async function () {
      await expect(
        this.exploiter.convertStables(this.swapFlashLoan.address)).to.be.revertedWith("StableLPMaker: must use EOA");
    });

    it("only owner should be able to change addresses", async function () {
      await expect(this.usnMaker.connect(this.user1).setpTri(this.usdt.address)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(this.usnMaker.connect(this.owner).setpTri(this.user1.address))
        .to.emit(this.usnMaker, "LogSetpTri")
        .withArgs(this.pTRI.address, this.user1.address);
      expect(await this.usnMaker.pTri()).to.equal(this.user1.address);
    });
  });

  describe("StableUsnMaker Dao Tests", function () {
    it("should have correct address", async function () {
      expect(await this.usnMaker.dao()).to.equal(this.dao.address);
    })

    it("Only admin can change dao address", async function () {
      await expect(this.usnMaker.connect(this.user1).setDaoAddress(this.user1.address)).to.be.reverted
      await this.usnMaker.connect(this.owner).setDaoAddress(this.user1.address)
      expect(await this.usnMaker.dao()).to.equal(this.user1.address);
      await this.usnMaker.connect(this.owner).setDaoAddress(this.dao.address)
      expect(await this.usnMaker.dao()).to.equal(this.dao.address);
    })

    it("should have correct address", async function () {
      expect(await this.usnMaker.polPercent()).to.equal(0);
      await expect(this.usnMaker.connect(this.owner).setprotocolOwnerLiquidityPercent(101)).to.be.revertedWith("POL is too high")
      await this.usnMaker.connect(this.owner).setprotocolOwnerLiquidityPercent(50)
      expect(await this.usnMaker.polPercent()).to.equal(50);
    })

    it("should send 50% of fees to dao", async function () {
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
       expect(await this.swapToken.balanceOf(this.dao.address)).to.equal(0);
      await this.usnMaker.withdrawStableTokenFees();
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(2499512096);
      expect(await this.usdc.balanceOf(this.usnMaker.address)).to.equal(249710331);
      expect(await this.usdt.balanceOf(this.usnMaker.address)).to.equal(249808873);
      await this.usnMaker.swapStableTokensToUsn();
      await this.usnMaker.addLiquidityToStableSwap();
      await this.usnMaker.sendLpToken();
      expect(await this.swapToken.balanceOf(this.dao.address)).to.equal(1498427689);
      expect(await this.swapToken.balanceOf(this.user1.address)).to.equal(1498427689);
      // the ptri address was changed in old test
    })
  });

});



















