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
  const [_, deployer] = await ethers.getSigners();
  console.log(`Address: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const rewardTokenAddress = "0x8E93fA976eCB6495086e68860261DeF4399E77B5"; //fAurora address (replace)
  const lpAddress = "0x20F8AeFB5697B77E0BB835A8518BE70775cdA1b0"; //wnear-ETH LP Address
  const chefV2Address = "0xBa3B61394873D0ED1d0d61793ef428c113069d96"; //Chef V2 Test Address (replace)

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(deployer).deploy(rewardTokenAddress, lpAddress, "0", chefV2Address);
  await rewarder.deployed();
  console.log(`Complex Rewarder address: ${rewarder.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
