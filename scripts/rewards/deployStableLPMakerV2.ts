// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, run } from "hardhat";
import {
  dao,
  threePoolLpTokenAddress,
  threePoolSwapFlashLoanAddress,
  usdcAddress,
  usdtAddress,
  usnAddress,
} from "../constants";

type DeployedContracts = {
  stableLPMakerV2: string;
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
  const StableLPMakerV2 = await ethers.getContractFactory("StableLPMakerV2");

  const stableLPMakerV2ConstructorArgs = [
    threePoolSwapFlashLoanAddress,
    pTRI,
    usnAddress,
    usdcAddress,
    usdtAddress,
    threePoolLpTokenAddress,
    dao,
  ];
  console.log(...stableLPMakerV2ConstructorArgs);

  const stableLPMakerV2 = await StableLPMakerV2.connect(deployer).deploy(
    stableLPMakerV2ConstructorArgs[0],
    stableLPMakerV2ConstructorArgs[1],
    stableLPMakerV2ConstructorArgs[2],
    stableLPMakerV2ConstructorArgs[3],
    stableLPMakerV2ConstructorArgs[4],
    stableLPMakerV2ConstructorArgs[5],
    stableLPMakerV2ConstructorArgs[6],
  );
  await stableLPMakerV2.deployed();
  console.log(`StableLPMakerV2 deployed at: ${stableLPMakerV2.address}`);

  // Verify StableLPMakerV2 deployment for aurorascan
  await run("verify:verify", {
    address: stableLPMakerV2.address,
    constructorArguments: stableLPMakerV2ConstructorArgs,
  });

  return { stableLPMakerV2: stableLPMakerV2.address };
}

export { main };
