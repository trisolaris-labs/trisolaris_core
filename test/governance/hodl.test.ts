import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Hodl__factory, Tri__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe("scenario:TreasuryVester", () => {
  let hodl: Contract;
  let tri: Contract;
  let deployer: SignerWithAddress;
  let recepient: SignerWithAddress;
  let hodlEnd: number;
  let hodlStart: number;
  const hodlAmount = ethers.BigNumber.from("100000000000000000000");
  const ethAmount = ethers.utils.parseEther("1"); // 1 ether;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  beforeEach("deploy treasury hodl contract", async () => {
    [deployer, recepient] = await ethers.getSigners();
    const { timestamp: now } = await ethers.provider.getBlock("latest");
    hodlStart = now;
    hodlEnd = now + 60;
    const triFactory = new Tri__factory(deployer);
    tri = await triFactory.deploy(deployer.address);
    const hodlFactory = new Hodl__factory(deployer);
    hodl = await hodlFactory.deploy(hodlEnd);

    await deployer.sendTransaction({
      to: hodl.address,
      value: ethAmount,
    });

    // fund the treasury
    await tri.mint(hodl.address, hodlAmount);
  });

  it("claim:fail not yet time", async () => {
    await expect(hodl.reclaimTokens(tri.address, hodlAmount, recepient.address)).to.be.revertedWith(
      "Hodl:: reclaimTokens: not time yet",
    );
    await ethers.provider.send("evm_mine", [hodlStart + 30]);
    await expect(hodl.reclaimTokens(tri.address, hodlAmount, recepient.address)).to.be.revertedWith(
      "Hodl:: reclaimTokens: not time yet",
    );
  });

  it("claim:fail not owner", async () => {
    await expect(hodl.connect(recepient).reclaimTokens(tri.address, hodlAmount, recepient.address)).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("claim:all", async () => {
    await ethers.provider.send("evm_mine", [hodlEnd + 10]);
    // claiming ether
    const preBal = await ethers.provider.getBalance(recepient.address);
    await hodl.connect(deployer).reclaimTokens(zeroAddress, ethAmount, recepient.address);
    const postBal = await ethers.provider.getBalance(recepient.address);
    expect(postBal.sub(preBal)).to.be.eq(ethAmount);

    // claiming tri
    await hodl.connect(deployer).reclaimTokens(tri.address, hodlAmount, recepient.address);
    const balance = await tri.balanceOf(recepient.address);
    expect(balance).to.be.eq(hodlAmount);
  });
});
