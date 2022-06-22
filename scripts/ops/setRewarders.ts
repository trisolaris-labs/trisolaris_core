// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { auroraAddress, chefV2Address } from "../constants";

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

  const poolId = 0;
  const rewarderAddress = "0x94669d7a170bfe62FAc297061663e0B48C63B9B5";

  const chefV2Contract = await ethers.getContractFactory("MasterChefV2");
  const chefv2 = chefV2Contract.attach(chefV2Address);
  const rewarderContract = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = rewarderContract.attach(rewarderAddress);

  const poolLpToken = await chefv2.lpToken(poolId);
  const rewarderLpToken = await rewarder.lpToken();
  const poolInfo = await chefv2.poolInfo(poolId);

  if (poolLpToken === rewarderLpToken) {
    console.log("Reached here");
    /*
    const rewarderSetTx = await chefv2.connect(deployer).set(poolId, poolInfo.allocPoint, rewarderAddress, true);
    const rewarderSetReceipt = await rewarderSetTx.wait();
    console.log(rewarderSetReceipt.logs);  
    */
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
