// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { RevenueDistributionToken__factory } from "../typechain";
import { ethers, run } from "hardhat";

const USDT_ADDRESS = "0x4988a896b1227218e4A686fdE5EabdcAbd91571f";
const TRI_ADDRESS = "0xfa94348467f64d5a457f75f8bc40495d33c65abb";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [_, deployer] = await ethers.getSigners();

  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const rdtFactory: RevenueDistributionToken__factory = await ethers.getContractFactory("RevenueDistributionToken");
  const factory = await rdtFactory.deploy("Test xTRI V2", "xTRI", deployer.address, USDT_ADDRESS, TRI_ADDRESS);
  await factory.deployed();

  console.log(`RDT address: ${factory.address}`);

  await run("verify:verify", {
    address: factory.address,
    constructorArguments: ["Test xTRI V2", "xTRI", deployer.address, USDT_ADDRESS, TRI_ADDRESS],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
