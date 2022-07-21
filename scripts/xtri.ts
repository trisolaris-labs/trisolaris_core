// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { triAddress, factoryAddress, wethAddress } from "./constants";

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

  const TriMaker = await ethers.getContractFactory("TriMaker");
  const TriBar = await ethers.getContractFactory("TriBar");
  const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");

  const bar = await TriBar.connect(deployer).deploy(triAddress);
  await bar.deployed();
  console.log(`Bar deployed at: ${bar.address}`);

  const triMaker = await TriMaker.connect(deployer).deploy(factoryAddress, bar.address, triAddress, wethAddress);
  await triMaker.deployed();
  console.log(`Maker deployed at: ${triMaker.address}`);

  const factory = UniswapV2Factory.attach(factoryAddress);
  console.log(`Factory address: ${factory.address}`);

  const tx = await factory.connect(deployer).setFeeTo(triMaker.address);
  const receipt = await tx.wait();
  console.log(`Fee set to tri maker address`);
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
