// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { chefV2Address } from '../constants';

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [_, deployer] = await ethers.getSigners();
  console.log(`Address: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const chainAddress = "0xF5E2C6558d247651595f7EFa423010A2e533bea8"

  const mcv2 = await ethers.getContractFactory("MasterChefV2");
  const chefv2 = mcv2.attach(chefV2Address);
  console.log(`MasterChef V2 address: ${chefv2.address}`);

  const tx = await chefv2.connect(deployer).transferOwnership(chainAddress);
  const receipt = await tx.wait()
  console.log(receipt)
  
  const newOwner = await chefv2.owner();
  console.log("New owner", newOwner)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
