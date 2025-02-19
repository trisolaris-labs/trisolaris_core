import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("FeeCollector", function () {
  let feeCollector: Contract;
  let erc20Mock: Contract;
  let owner: SignerWithAddress;
  let feeManager1: SignerWithAddress;
  let feeManager2: SignerWithAddress;
  let feeManager3: SignerWithAddress;
  let nonFeeManager: SignerWithAddress;

  beforeEach(async function () {
    // Get signers.
    [owner, feeManager1, feeManager2, feeManager3, nonFeeManager] = await ethers.getSigners();

    // Deploy ERC20Mock for testing.
    const ERC20MockFactory = await ethers.getContractFactory("TestTokenMock");
    const decimals = ethers.BigNumber.from("1000000000000000000");
    const supply = ethers.BigNumber.from("1000000000").mul(decimals);
    erc20Mock = await ERC20MockFactory.deploy("TestToken", "TT", 18, supply);
    await erc20Mock.deployed();

    // Deploy the FeeCollector contract with 3 fee managers.
    const FeeCollectorFactory = await ethers.getContractFactory("FeeCollector");
    feeCollector = await FeeCollectorFactory.deploy([feeManager1.address, feeManager2.address, feeManager3.address]);
    await feeCollector.deployed();

    // Fund the FeeCollector contract with 10 ETH.
    await owner.sendTransaction({
      to: feeCollector.address,
      value: ethers.utils.parseEther("10"),
    });

    // Transfer 100 tokens from owner to the FeeCollector.
    await erc20Mock.transfer(feeCollector.address, ethers.utils.parseEther("100"));
  });

  describe("ETH Withdrawals", function () {
    it("allows fee manager to withdraw ETH", async function () {
      // Fee manager 1 withdraws 1 ETH.
      const initialBalance = await feeManager1.getBalance();
      const tx = await feeCollector.connect(feeManager1).withdrawETH(feeManager1.address, ethers.utils.parseEther("1"));
      await tx.wait();

      const finalBalance = await feeManager1.getBalance();
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("prevents non fee manager from withdrawing ETH", async function () {
      await expect(
        feeCollector.connect(nonFeeManager).withdrawETH(nonFeeManager.address, ethers.utils.parseEther("1")),
      ).to.be.revertedWith("Caller is not a fee manager");
    });
  });

  describe("Token Withdrawals", function () {
    it("allows fee manager to withdraw tokens", async function () {
      // Fee manager 2 withdraws 10 tokens.
      const initialBalance = await erc20Mock.balanceOf(feeManager2.address);
      const tx = await feeCollector
        .connect(feeManager2)
        .withdrawToken(erc20Mock.address, feeManager2.address, ethers.utils.parseEther("10"));
      await tx.wait();

      const finalBalance = await erc20Mock.balanceOf(feeManager2.address);
      expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("10"));
    });

    it("prevents non fee manager from withdrawing tokens", async function () {
      await expect(
        feeCollector
          .connect(nonFeeManager)
          .withdrawToken(erc20Mock.address, nonFeeManager.address, ethers.utils.parseEther("10")),
      ).to.be.revertedWith("Caller is not a fee manager");
    });
  });
});
