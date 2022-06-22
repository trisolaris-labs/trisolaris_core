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
  const allocPoint = 30;
  const lpAddresses = ["0x84b123875F0F36B966d0B6Ca14b31121bd9676AD"];
  const rewarderAddress = "0x0000000000000000000000000000000000000000";

  const [_, deployer] = await ethers.getSigners();
  console.log(`Adding pools contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChef = await ethers.getContractFactory("MasterChef");
  const triToken = await ethers.getContractFactory("Tri");

  const tri = triToken.attach("0xFa94348467f64D5A457F75F8bc40495D33c65aBB");
  console.log(`Tri address: ${tri.address}`);
  const chef = masterChef.attach("0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B");
  console.log(`Chef address: ${chef.address}`);

  for (let j = 0; j < lpAddresses.length; j++) {
    let lpAddress = lpAddresses[j];
    const poolLength = await chef.poolLength();
    let canAddPool = true;
    for (let i = 0; i < poolLength.toNumber(); i++) {
      let poolInfo = await chef.poolInfo(i);
      if (poolInfo.lpToken === lpAddress) {
        canAddPool = false;
      }
    }
    if (canAddPool) {
      console.log("adding pool", lpAddress);
      const tx = await chef.connect(deployer).add(allocPoint, lpAddress, rewarderAddress, true);
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
