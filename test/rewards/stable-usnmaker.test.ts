import { expect } from "chai";
import { ethers } from "hardhat";
import { getBigNumber, setupStableSwap, asyncForEach } from "../utils";

describe("StableUsnMaker", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    this.user1 = this.signers[1]
    this.user2 = this.signers[2]
    this.user3 = this.signers[3]
        
    this.MAX_UINT256 = ethers.constants.MaxUint256;
    this.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    await setupStableSwap(this, this.owner)

    this.UsnMaker = await ethers.getContractFactory("StableUsnMaker");
    this.UsnMakerExploitMock = await ethers.getContractFactory("StableUsnMakerExploitMock");
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

    this.usnMaker = await this.UsnMaker.connect(this.owner).deploy(this.swapFlashLoan.address,this.user3.address,this.usn.address,this.usdc.address, this.usdt.address)
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


    it("should send assets to LpMaker ", async function () {
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(19979939773100);
      await this.usnMaker.sendUsnToLPMaker();
      expect(await this.usn.balanceOf(this.user3.address)).to.equal(19979939773100);
      expect(await this.usn.balanceOf(this.usnMaker.address)).to.equal(0);
    });

    it("should fail to send usn when not enough balance", async function () {
      await expect(this.usnMaker.sendUsnToLPMaker()).to.be.revertedWith("StableUsnMaker: no Usn to send");
    })

    it("should revert if caller is not EOA", async function () {
      await expect(
        this.exploiter.convertStables(
          this.swapFlashLoan.address,
          [this.usdc.address, this.usdt.address],
          [
            [this.usdc.address, this.usdt.address],
            [this.usdt.address, this.usdc.address],
          ],
        ),
      ).to.be.revertedWith("StableUsnMaker: must use EOA");
    });


    it("only owner should be able to change addresses", async function () {
      await expect(this.usnMaker.connect(this.user1).setLPMaker(this.usdt.address)).to.be.revertedWith("Ownable: caller is not the owner");
      await this.usnMaker.connect(this.owner).setLPMaker(this.usdt.address)
      expect(await this.usnMaker.lpMaker()).to.equal(this.usdt.address);
    });


  });
});
