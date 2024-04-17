// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre from "hardhat";
import { triAddress, factoryAddress, wethAddress, triBarAddress, triMakerAddress } from "../constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  await hre.run("verify:verify", {
    address: triBarAddress,
    constructorArguments: ["0xaf22b40aB6352368b3F224E016ff9af962734BA5"],
  });

  await hre.run("verify:verify", {
    address: triMakerAddress,
    constructorArguments: [factoryAddress, triBarAddress, triAddress, wethAddress],
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
