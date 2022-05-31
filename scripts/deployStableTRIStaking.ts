// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { StableTRIStaking__factory } from "../typechain";
import { ethers, run } from "hardhat";
import { triAddress, usdTLPAddress } from "./constants";

type DeployedContracts = {
  pTRI: string;
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

  const pTRIFactory: StableTRIStaking__factory = await ethers.getContractFactory("StableTRIStaking");
  const pTRI = await pTRIFactory.deploy(
    "pTRI",
    "pTRI",
    usdTLPAddress,
    triAddress,
    deployer.address, // Should this be treasury??
    0, // Original: ethers.utils.parseEther("0.03"); Disable fee for now
  );
  await pTRI.deployed();

  console.log(`pTRI address: ${pTRI.address}`);

  await run("verify:verify", {
    address: pTRI.address,
    constructorArguments: [
      "pTRI",
      "pTRI",
      usdTLPAddress,
      triAddress,
      deployer.address, // Should this be treasury??
      0, // Original: ethers.utils.parseEther("0.03"); Disable fee for now
    ],
  });

  const deployedContracts: DeployedContracts = {
    pTRI: pTRI.address,
  };

  return deployedContracts;
}

export { main };
