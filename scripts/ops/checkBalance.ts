// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import {
  triAddress,
  babooRecepientAddress,
  chainRecepientAddress,
  donRecepientAddress,
  kRecepientAddress,
  dfRecepientAddress,
} from "../constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [_, deployer] = await ethers.getSigners();
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const triToken = await ethers.getContractFactory("Tri");

  const tri = triToken.attach(triAddress);
  console.log(`Tri address: ${tri.address}`);

  console.log("Deployer balance", (await tri.balanceOf(deployer.address)).toString());
  console.log("Baboo balance", (await tri.balanceOf(babooRecepientAddress)).toString());
  console.log("Don balance", (await tri.balanceOf(donRecepientAddress)).toString());
  console.log("Chain balance", (await tri.balanceOf(chainRecepientAddress)).toString());
  console.log("Df balance", (await tri.balanceOf(dfRecepientAddress)).toString());
  console.log("K balance", (await tri.balanceOf(kRecepientAddress)).toString());
  console.log((await tri.totalSupply()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
