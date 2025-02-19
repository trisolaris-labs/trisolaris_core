// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre, { ethers } from "hardhat";
import { factoryTurboAddress, feeManagerTurboAddress } from "../constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const feeCollectorFactory = await ethers.getContractFactory("FeeCollector");
  const feeCollector = await feeCollectorFactory.deploy([feeManagerTurboAddress]);
  await feeCollector.deployed();
  console.log(`FeeCollector address: ${feeCollector.address}`);

  const uniFactory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = uniFactory.attach(factoryTurboAddress);
  console.log(`Factory address: ${factory.address}`);

  const feeToSetter = await factory.feeToSetter();
  console.log(feeToSetter);

  const tx = await factory.connect(deployer).setFeeTo(feeCollector.address);
  const receipt = await tx.wait();
  console.log(receipt.logs);

  const feeTo = await factory.feeTo();
  console.log(feeTo);

  await hre.run("verify:verify", {
    address: "0xb0cec7e9A55cA4d6e1B17888BAb39dBe8C5eE614",
    constructorArguments: [[feeManagerTurboAddress]],
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
