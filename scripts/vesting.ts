// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { triAddress, totalSupply, specialistAddress, decimals } from "./constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const vestingBegin = 1652140800; // 10th May 2022 00:00 UTC
  const vestingCliff = 1659744000; // 20th Mar 2022 00:00 UTC
  const vestingEnd = 1691280000; // 1st Dec 2022 00:00 UTC
  const recepientAddress = "0x41E64ea21c0bD691A8a70d57653c044Cb2d4E677";
  const vestingAmount = decimals.mul("100000");

  const triToken = await ethers.getContractFactory("Tri");
  const vesterContract = await ethers.getContractFactory("Vester");
  const tri = triToken.attach(triAddress);
  const triBalance = await tri.balanceOf(deployer.address);
  console.log(`Tri balance: ${triBalance.toString()}`);

  const treasuryVester = await vesterContract
    .connect(deployer)
    .deploy(tri.address, recepientAddress, vestingAmount, vestingBegin, vestingCliff, vestingEnd);
  console.log(`Vester address: ${treasuryVester.address}`);

  /*
    const tx = await tri.transfer(treasuryVester.address, vestingAmount);
    const receipt = await tx.wait();
    console.log(receipt.logs);
    */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
