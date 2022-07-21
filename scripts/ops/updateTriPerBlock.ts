// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChef = await ethers.getContractFactory("MasterChef");

  const chef = masterChef.attach("0x474b825a605c45836Ac50398473059D4c4c6d3Db");
  console.log(`Chef address: ${chef.address}`);

  const decimals = ethers.BigNumber.from("1000000000000000000");
  const newTriPerBlock = decimals.mul(10);

  const tx = await chef.updateTriPerBlock(newTriPerBlock);
  console.log(tx);
  const receipt = await tx.wait();
  console.log(receipt.logs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
