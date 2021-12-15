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
  const lpAddresses = [
    "0x5eeC60F348cB1D661E4A5122CF4638c7DB7A886e",
    "0xd1654a7713617d41A8C9530Fb9B948d00e162194",
  ];
  const rewarderAddress = zeroAddress;

  const [_, deployer] = await ethers.getSigners();
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
  const triToken = await ethers.getContractFactory("Tri"); // REPLACE THIS WITH REAL TRI

  const tri = triToken.attach(triAddress);
  console.log(`Tri address: ${tri.address}`);
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
