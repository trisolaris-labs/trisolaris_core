// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, run } from "hardhat";
import {
  usdtAddress,
  usdc_eAddress,
  usnAddress,
  dao,
  threePoolSwapFlashLoanAddress,
  threePoolLpTokenAddress,
} from "../constants";
import { main as set3PoolFeeAddress } from "../ops/set3PoolFeeAddress";

type DeployedContracts = {
  stableLPMaker: string;
};
type DeployConstructorDependencies = {
  pTRI: string;
};
async function main(deployConstructorDependencies: DeployConstructorDependencies): Promise<DeployedContracts> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const { pTRI } = deployConstructorDependencies;
  const StableLPMaker = await ethers.getContractFactory("StableLPMaker");

  const stableLPMakerConstructorArgs = [
    threePoolSwapFlashLoanAddress,
    pTRI,
    usnAddress,
    usdc_eAddress,
    usdtAddress,
    threePoolLpTokenAddress,
    dao,
  ];
  console.log(...stableLPMakerConstructorArgs);

  const stableLPMaker = await StableLPMaker.connect(deployer).deploy(
    stableLPMakerConstructorArgs[0],
    stableLPMakerConstructorArgs[1],
    stableLPMakerConstructorArgs[2],
    stableLPMakerConstructorArgs[3],
    stableLPMakerConstructorArgs[4],
    stableLPMakerConstructorArgs[5],
    stableLPMakerConstructorArgs[6],
  );
  await stableLPMaker.deployed();
  console.log(`StableLPMaker deployed at: ${stableLPMaker.address}`);

  // Verify StableLPMaker deployment for aurorascan
  await run("verify:verify", {
    address: stableLPMaker.address,
    constructorArguments: stableLPMakerConstructorArgs,
  });

  // Set the stableLPMaker address as the 3PoolSwapFlashLoan's fee address
  await set3PoolFeeAddress(stableLPMaker.address);

  const deployedContracts: DeployedContracts = { stableLPMaker: stableLPMaker.address };

  return deployedContracts;
}

export { main };
