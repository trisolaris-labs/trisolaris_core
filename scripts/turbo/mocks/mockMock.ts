// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre, { ethers } from "hardhat";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const tokenFactory = await ethers.getContractFactory("ERC20Mock");
  const name = "mock Mock";
  const symbol = "mockMock";
  const decimals = ethers.BigNumber.from("1000000000000000000");
  const supply = ethers.BigNumber.from("1000000000").mul(decimals);
  const mockToken = await tokenFactory.deploy(name, symbol, 18, supply);
  await mockToken.deployed();
  await hre.run("verify:verify", {
    address: mockToken.address,
    constructorArguments: [name, symbol, 18, supply],
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
