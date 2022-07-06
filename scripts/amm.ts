// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import {
  UniswapV2Factory__factory,
  UniswapV2Router02__factory,
  UniswapV2Router02,
} from "../typechain";
import { ethers } from "hardhat";

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

  const uniFactory: UniswapV2Factory__factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await uniFactory.deploy(deployer.address);
  await factory.deployed();
  console.log(`Factory address: ${factory.address}`);
  const initHash = await factory.INIT_CODE_PAIR_HASH();
  console.log(initHash.toString());

  // wrapped eth address
  const WETH_ADDRESS_AURORA_MAINNET = "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB";
  const uniRouter: UniswapV2Router02__factory = await ethers.getContractFactory("UniswapV2Router02");
  const router = <UniswapV2Router02>await uniRouter.deploy(factory.address, WETH_ADDRESS_AURORA_MAINNET);
  await router.deployed();
  console.log(`Router address: ${router.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
