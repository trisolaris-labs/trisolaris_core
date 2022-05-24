// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { StableTRIStaking__factory } from "../typechain";
import { ethers, run } from "hardhat";

const USD_TLP_ADDRESS = "0x87BCC091d0A7F9352728100268Ac8D25729113bB";
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

  const pTRIFactory: StableTRIStaking__factory = await ethers.getContractFactory("StableTRIStaking");
  const factory = await pTRIFactory.deploy(
    "pTRI",
    "pTRI",
    USD_TLP_ADDRESS,
    TRI_ADDRESS,
    deployer.address, // Should this be treasury??
    0, // Original: ethers.utils.parseEther("0.03"); Disable fee for now
  );
  await factory.deployed();

  console.log(`pTRI address: ${factory.address}`);

  await run("verify:verify", {
    address: factory.address,
    constructorArguments: [
      "pTRI",
      "pTRI",
      USD_TLP_ADDRESS,
      TRI_ADDRESS,
      deployer.address, // Should this be treasury??
      0, // Original: ethers.utils.parseEther("0.03"); Disable fee for now
    ],
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
