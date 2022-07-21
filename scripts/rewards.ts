// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants
  const decimals = ethers.BigNumber.from("1000000000000000000");
  const triPerBlock = decimals.mul(5);
  const transferAmount = ethers.BigNumber.from("500000000").mul(decimals).mul(33).div(100); // 33 percent
  const startBlock = "52811000"; // Tuesday 16th 1PM GMT

  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChef = await ethers.getContractFactory("MasterChef");
  const triToken = await ethers.getContractFactory("Tri");

  const tri = await triToken.connect(deployer).deploy(deployer.address);
  await tri.deployed();
  console.log(`Tri address: ${tri.address}`);

  const chef = await masterChef.connect(deployer).deploy(tri.address, triPerBlock, startBlock);
  await chef.deployed();
  console.log(`Chef address: ${chef.address}`);

  await tri.connect(deployer).mint(deployer.address, transferAmount);
  await tri.connect(deployer).setMinter(chef.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
