// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre, { ethers } from "hardhat";
import { wturboTurboAddress } from "../constants";

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

  const uniFactory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await uniFactory.deploy(deployer.address);
  await factory.deployed();
  console.log(`Factory address: ${factory.address}`);
  const initHash = await factory.INIT_CODE_PAIR_HASH();
  console.log(initHash.toString());

  const routerFactory = await ethers.getContractFactory("UniswapV2Router02");
  const router = await routerFactory.deploy(factory.address, wturboTurboAddress);
  await router.deployed();
  console.log(`Router address: ${router.address}`);

  await hre.run("verify:verify", {
    address: factory.address,
    constructorArguments: [deployer.address],
  });

  await hre.run("verify:verify", {
    address: router.address,
    constructorArguments: [factory.address, wturboTurboAddress],
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
