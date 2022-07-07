import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { setupStableSwap, getBigNumber } from "../utils";

// import { Contract, BigNumber, ContractFactory, Signer } from 'ethers'
// import { asyncForEach, MAX_UINT256 } from "./testUtils"

chai.use(solidity);
const { expect } = chai;

describe("LPToken", function () {
  before(async function () {
    this.signers = await ethers.getSigners();
    this.owner = this.signers[0];

    this.MAX_UINT256 = ethers.constants.MaxUint256;
    await setupStableSwap(this, this.owner);

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner);
    this.dai = await ERC20Mock.connect(this.owner).deploy("DAI", "DAI", 6, getBigNumber("100", 6));
    await this.dai.deployed();
    this.usdc = await ERC20Mock.connect(this.owner).deploy("USDC", "USDC", 18, getBigNumber("100"));
    await this.usdc.deployed();

    // Constructor arguments
    const TOKEN_ADDRESSES = [this.dai.address, this.usdc.address];
    const TOKEN_DECIMALS = [6, 18];
    const LP_TOKEN_NAME = "Saddle DAI/USDC";
    const LP_TOKEN_SYMBOL = "saddleTestUSD";
    const INITIAL_A = 400;
    const SWAP_FEE = 4e6; // 4bps
    const ADMIN_FEE = 1e6; //1bps

    await this.swapFlashLoan
      .connect(this.owner)
      .initialize(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A,
        SWAP_FEE,
        ADMIN_FEE,
        this.lpTokenBase.address,
      );
    const swapStorage = await this.swapFlashLoan.swapStorage();
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.lpToken = LpTokenFactory.attach(swapStorage.lpToken);
  });

  it("Reverts when minting 0", async function () {
    // Deploy dummy tokens
    await expect(this.lpTokenBase.mint(await this.owner.getAddress(), 0)).to.be.revertedWith("LPToken: cannot mint 0");
  });

  it("Reverts when transferring the token to itself", async function () {
    await setupStableSwap(this, this.owner);

    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.owner);
    this.dai = await ERC20Mock.connect(this.owner).deploy("DAI", "DAI", 18, getBigNumber("300"));
    await this.dai.deployed();
    this.usdc = await ERC20Mock.connect(this.owner).deploy("USDT", "USDT", 6, getBigNumber("300", 6));
    await this.usdc.deployed();

    await this.dai.approve(this.swapFlashLoan.address, this.MAX_UINT256);
    await this.usdc.approve(this.swapFlashLoan.address, this.MAX_UINT256);

    // Constructor arguments
    const TOKEN_ADDRESSES = [this.dai.address, this.usdc.address];
    const TOKEN_DECIMALS = [18, 6];
    this.LP_TOKEN_NAME = "Saddle DAI/USDC";
    this.LP_TOKEN_SYMBOL = "saddleTestUSD";
    this.INITIAL_A = 100;
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
    const LpTokenFactory = await ethers.getContractFactory("LPToken", this.owner);
    this.swapToken = LpTokenFactory.attach(swapStorage.lpToken);

    expect(await this.swapFlashLoan.getVirtualPrice()).to.be.eq(0);

    await this.swapFlashLoan.addLiquidity([getBigNumber(100), getBigNumber(100, 6)], 1, this.MAX_UINT256);

    // Verify current balance
    expect(await this.swapToken.balanceOf(this.owner.address)).to.eq(String(200e18));

    // Transferring LPToken to itself should revert
    await expect(this.swapToken.transfer(this.swapToken.address, String(100e18))).to.be.revertedWith(
      "LPToken: cannot send to itself",
    );
  });
});
