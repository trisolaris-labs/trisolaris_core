// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { auroraAddress, chefV2Address } from "./constants";

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

  const lpAddress = "0xd1654a7713617d41A8C9530Fb9B948d00e162194"; //wnear-ETH LP Address

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(deployer).deploy(auroraAddress, lpAddress, "0", chefV2Address);
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
