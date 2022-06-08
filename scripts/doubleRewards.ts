// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { padAddress, metaAddress, brrrAddress, chefV2Address } from './constants';

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  // const [_, deployer] = await ethers.getSigners();
  const signers = await ethers.getSigners();
  const deployer = signers[7]
  console.log(`Address: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const lpAddress = "0x71dBEB011EAC90C51b42854A77C45C1E53242698";

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(deployer).deploy(brrrAddress, lpAddress, "0", chefV2Address);
  await rewarder.deployed();
  console.log(`Complex Rewarder address: ${rewarder.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
