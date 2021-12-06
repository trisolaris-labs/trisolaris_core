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

  const rewarderAddress = "0xeC679452e1A6D404014fe3363Ac041BD79844F82";
  const tokensPerBlock = 1286008230000000;

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = complexRewarder.attach(rewarderAddress);

  const rewardSetterTx = await rewarder.connect(deployer).setRewardRate(tokensPerBlock);
  const rewardSetterReceipt = await rewardSetterTx.wait();
  console.log(rewardSetterReceipt.logs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
