// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { triAddress, chefV2Address, zeroAddress } from '../constants';


async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const allocPoint = 0;

  // THIS IS ONLT ITEM TO CHANGE
  const lpAddresses = [
    "0xffb69779f14E851A8c550Bf5bB1933c44BBDE129",//pad-near
  ];
  const rewarderAddress = zeroAddress;

  const signers = await ethers.getSigners();
  const deployer = signers[7]
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");

  const chef = masterChefV2.attach(chefV2Address);
  console.log(`Chef address: ${chef.address}`);

  for (let j = 0; j < lpAddresses.length; j++) {
    const lpAddress = lpAddresses[j];
    const poolLength = await chef.poolLength();
    let canAddPool = true;
    for (let i = 0; i < poolLength.toNumber(); i++) {
      const lpToken = await chef.lpToken(i);
      if (lpToken === lpAddress) {
        canAddPool = false;
      }
    }
    if (canAddPool) {
      console.log("adding pool", lpAddress);
      const tx = await chef
        .connect(deployer)
        .add(allocPoint, lpAddress, rewarderAddress);
      console.log(tx);
      const receipt = await tx.wait();
      console.log(receipt.logs);
    }
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
