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
  const allocPoint = 14;
  const lpAddresses = [
    "0x63da4DB6Ef4e7C62168aB03982399F9588fCd198", // REPLACE THESE WITH LP WANTING TO ADD
    "0x20F8AeFB5697B77E0BB835A8518BE70775cdA1b0",
  ];
  const rewarderAddress = "0x0000000000000000000000000000000000000000";

  const [_, deployer] = await ethers.getSigners();
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChef = await ethers.getContractFactory("MasterChefV2");
  const triToken = await ethers.getContractFactory("fTri"); // REPLACE THIS WITH REAL TRI

  const tri = triToken.attach("0x5b652E38a8be707c9838eB0A07bC7A828Bc62f40");
  console.log(`fTri address: ${tri.address}`);
  const chef = masterChef.attach("0xa229265a8C7655ae59C9081B5D5e85C453e28C78");
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
