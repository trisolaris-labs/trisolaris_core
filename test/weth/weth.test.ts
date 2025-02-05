import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ConfigurableWETH9 } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("ConfigurableWETH9", () => {
  let weth: ConfigurableWETH9;
  let deployer: SignerWithAddress;

  beforeEach(async () => {
    [deployer] = await ethers.getSigners();

    const wethFactory = await ethers.getContractFactory("ConfigurableWETH9");
    weth = await wethFactory.deploy("Wrapped Ether", "WETH");
  });

  it("deposit", async () => {
    const value = ethers.utils.parseEther("1");
    const prevBalance = await deployer.getBalance();
    await weth.deposit({ value });

    const currentBalance = await deployer.getBalance();
    const wethBalance = await weth.balanceOf(deployer.address);

    expect(wethBalance).to.equal(value);
    expect(currentBalance.lte(prevBalance.sub(value))).to.be.true;
  });

  it("withdraw", async () => {
    const value = ethers.utils.parseEther("1");
    await weth.deposit({ value });
    await weth.withdraw(value);

    const balance = await weth.balanceOf(deployer.address);
    expect(balance).to.equal(0);
  });
});
