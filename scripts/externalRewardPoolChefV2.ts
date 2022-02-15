// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { chefV2Address, triAddress } from "./constants";

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

  // Deploy Rewarder
  const lpAddress = "0x7B273238C6DD0453C160f305df35c350a123E505";
  const rewardTokenAddress = "0xc2ac78ffddf39e5cd6d83bbd70c1d67517c467ef";
  const rewardTokenPerBlock = "0";

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder
    .connect(deployer)
    .deploy(rewardTokenAddress, lpAddress, rewardTokenPerBlock, chefV2Address);
  await rewarder.deployed();
  console.log(`Complex Rewarder address: ${rewarder.address}`);

  // Add Pool to Chef V2 with Deployed Rewarder
  const allocPoint = 0;
  const rewarderAddress = rewarder.address;

  console.log(`Adding pools contracts with ${deployer.address}`);

  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
  const triToken = await ethers.getContractFactory("Tri");

  const tri = triToken.attach(triAddress);
  console.log(`Tri address: ${tri.address}`);
  const chef = masterChefV2.attach(chefV2Address);
  console.log(`Chef address: ${chef.address}`);

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
    const tx = await chef.connect(deployer).add(allocPoint, lpAddress, rewarderAddress);
    console.log(tx);
    const receipt = await tx.wait();
    console.log(receipt.logs);
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
