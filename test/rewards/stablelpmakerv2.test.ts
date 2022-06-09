import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, setupStableSwap, asyncForEach } from "../utils";

describe("StableLpMaker", function () {
  before(async function () {
    this.LPMakerV2 = await ethers.getContractFactory("StableLPMakerV2");
    this.LPMakerV2ExploitMock = await ethers.getContractFactory("StableLpMakerExploitMockV2");

    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    this.user1 = this.signers[1]
    this.user2 = this.signers[2]
    this.pTRI = this.signers[3]
    this.dao = this.signers[4]

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  })

  beforeEach(async function () {
    await setupStableSwap(this, this.owner)

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner)
    this.usdc = await ERC20Mock.connect(this.owner).deploy("USDC", "USDC", 18, getBigNumber("300"))
    await this.usdc.deployed()
    this.usdt = await ERC20Mock.connect(this.owner).deploy("USDT", "USDT", 18, getBigNumber("300"))
    await this.usdt.deployed()
    this.usn = await ERC20Mock.connect(this.owner).deploy("USN", "USN", 18, getBigNumber("300"))
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

    this.lpMakerV2 = await this.LPMakerV2.connect(this.owner).deploy(this.swapFlashLoan.address, this.pTRI.address, this.usn.address, this.usdc.address, this.usdt.address, this.swapToken.address, this.dao.address)
    await this.lpMakerV2.deployed()
    this.exploiter = await this.LPMakerV2ExploitMock.connect(this.owner).deploy(this.lpMakerV2.address)
    await this.exploiter.deployed()

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

    await this.swapFlashLoan.connect(this.owner).setFeeAddress(this.lpMakerV2.address);
    await this.swapFlashLoan.setAdminFee(getBigNumber(10, 8));
    await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
    await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
  });

  describe("StableLPMakerV2 Unit Tests", function () {
    it("should withdraw fees to stableLPMakerV2 from stableswap", async function () {
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal("0");
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(9980241397654);
      // gets no fees now
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(0);
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(9980241397654);
    });

    it("should convert USDC and USDT to USN ", async function () {
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal("0");
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(9980241397654);
      // converting usdc to usn
      await this.lpMakerV2.swapStableTokens(
        this.swapFlashLoan.address,
        this.usdc.address,
        this.usn.address,
      );
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(10009738698795);
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(0);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(9980241397654);
      // converting usdt to usn
      await this.lpMakerV2.swapStableTokens(
        this.swapFlashLoan.address,
        this.usdt.address,
        this.usn.address,
      );
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(19979939773100);
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(0);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(0);
    });

    it("should add liquidity to stableswap", async function () {
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal("0");
      expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(10019739358388);
      expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(9980241397654);
      await this.lpMakerV2.addLiquidityToStableSwap();
      expect(await this.swapToken.balanceOf(this.lpMakerV2.address)).to.equal(19993767888811);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(0);
    });

    it("should send assets to pTRI ", async function () {
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      await this.lpMakerV2.addLiquidityToStableSwap();
      expect(await this.swapToken.balanceOf(this.lpMakerV2.address)).to.equal(19993767888811);
      await this.lpMakerV2.sendLpToken();
      expect(await this.swapToken.balanceOf(this.pTRI.address)).to.be.closeTo("19993767888811", 10);
    });

    it("should fail to send usn when not enough balance", async function () {
      await expect(this.lpMakerV2.sendLpToken()).to.be.revertedWith("StableLpMaker: no TLP to send");
    })

    it("should revert if caller is not EOA", async function () {
      await expect(
        this.exploiter.convertStables(
          [this.swapFlashLoan.address],
          [this.swapFlashLoan.address],
          [this.usdc.address],
          [this.usn.address],
        )).to.be.revertedWith("StableLPMaker: must use EOA");
    });

    it("only owner should be able to change addresses", async function () {
      await expect(this.lpMakerV2.connect(this.user1).setpTri(this.usdt.address)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(this.lpMakerV2.connect(this.owner).setpTri(this.user1.address))
        .to.emit(this.lpMakerV2, "LogSetpTri")
        .withArgs(this.pTRI.address, this.user1.address);
      expect(await this.lpMakerV2.pTri()).to.equal(this.user1.address);
    });
  });

  describe("StableLPMakerV2 Dao Tests", function () {
    it("should have correct address", async function () {
      expect(await this.lpMakerV2.dao()).to.equal(this.dao.address);
    })

    it("Only admin can change dao address", async function () {
      await expect(this.lpMakerV2.connect(this.user1).setDaoAddress(this.user1.address)).to.be.reverted
      await this.lpMakerV2.connect(this.owner).setDaoAddress(this.user1.address)
      expect(await this.lpMakerV2.dao()).to.equal(this.user1.address);
      await this.lpMakerV2.connect(this.owner).setDaoAddress(this.dao.address)
      expect(await this.lpMakerV2.dao()).to.equal(this.dao.address);
    })

    it("should have correct pol percent", async function () {
      expect(await this.lpMakerV2.polPercent()).to.equal(0);
      await expect(this.lpMakerV2.connect(this.owner).setProtocolOwnerLiquidityPercent(101)).to.be.revertedWith("POL is too high")
      await this.lpMakerV2.connect(this.owner).setProtocolOwnerLiquidityPercent(50)
      expect(await this.lpMakerV2.polPercent()).to.equal(50);
    })

    it("should send 50% of fees to dao", async function () {
      await this.swapFlashLoan.connect(this.user1).swap(0, 1, String(1e17), 0, this.MAX_UINT256);
      await this.swapFlashLoan.connect(this.user1).swap(1, 0, String(1e17), 0, this.MAX_UINT256);
      expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(0);
      expect(await this.swapToken.balanceOf(this.dao.address)).to.equal(0);
      await this.lpMakerV2.withdrawStableTokenFees(this.swapFlashLoan.address);
      // expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(2499512096);
      // expect(await this.usdc.balanceOf(this.lpMakerV2.address)).to.equal(249710331);
      // expect(await this.usdt.balanceOf(this.lpMakerV2.address)).to.equal(249808873);
      await this.lpMakerV2.addLiquidityToStableSwap();
      await this.lpMakerV2.sendLpToken();
      expect(await this.swapToken.balanceOf(this.dao.address)).to.be.closeTo("1498864617", 10);
      expect(await this.swapToken.balanceOf(this.user1.address)).to.be.closeTo("1498864617", 10);
    })
  });

  /*
  it("should run all the steps together without converting assets", async function () {
    expect(await this.usn.balanceOf(this.lpMakerV2.address)).to.equal(0);
    expect(await this.swapToken.balanceOf(this.dao.address)).to.equal(0);
    await this.lpMakerV2.convertStables([this.swapFlashLoan.address], [], [], []);
    expect(await this.swapToken.balanceOf(this.dao.address)).to.be.closeTo("1498864617", 10);
    expect(await this.swapToken.balanceOf(this.user1.address)).to.be.closeTo("1498864617", 10);
  });
  */
});
