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
  // const [_, deployer] = await ethers.getSigners();
  const signers = await ethers.getSigners();
  const deployer = signers[7]
  console.log(`Address: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const rewarderAddress = "0xD59c44fb39638209ec4ADD6DcD7A230a286055ee";//META
  const tokensPerBlock = "200000000000000000000000";

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
