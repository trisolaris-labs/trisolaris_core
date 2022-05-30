// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, run } from "hardhat";
import { usdcAddress, factoryAddress, wethAddress } from "./constants";
import { main as deployStableLpMaker } from "./rewards/deployStableLPMaker";
import { main as deployPTRI } from "./deployStableTRIStaking";

type DeployedContracts = {
  usdcMaker: string;
  stableLPMaker: string;
};

async function main(): Promise<DeployedContracts> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  // Deploy pTRI dependency
  const { pTRI } = await deployPTRI();

  // Deploy StableLPMaker dependency
  const { stableLPMaker } = await deployStableLpMaker({ pTRI });

  console.info("Deployed StableLPMaker via ./rewards/deployStableLPMaker.ts");

  // Deploy UsdcMaker
  const UsdcMaker = await ethers.getContractFactory("UsdcMaker");

  const usdcMakerConstructorArgs = [factoryAddress, stableLPMaker, usdcAddress, wethAddress];
  console.log(...usdcMakerConstructorArgs);
  const usdcMakerFactory = await UsdcMaker.connect(deployer);
  const usdcMaker = await usdcMakerFactory.deploy(
    usdcMakerConstructorArgs[0],
    usdcMakerConstructorArgs[1],
    usdcMakerConstructorArgs[2],
    usdcMakerConstructorArgs[3],
  );
  await usdcMaker.deployed();
  console.log(`USDCMaker deployed at: ${usdcMaker.address}`);

  // Verify USDCMaker deployment for aurorascan
  await run("verify:verify", {
    address: usdcMaker.address,
    constructorArguments: usdcMakerConstructorArgs,
  });

  const deployedContracts: DeployedContracts = { stableLPMaker, usdcMaker: usdcMaker.address };

  return deployedContracts;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
