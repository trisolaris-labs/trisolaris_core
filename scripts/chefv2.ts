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
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const masterChef = await ethers.getContractFactory("MasterChef");
  const triToken = await ethers.getContractFactory("Tri");

  const tri = triToken.attach("0xC6c3c200B8615d216CEa8E10Aa1B6DeAaCA25b24"); //Polygon TRI Contract (already deployed)
  console.log(`Tri address: ${tri.address}`);
  const chef = masterChef.attach("0x7666076DF6Cf4c35A0E73C45bF98D69cd4B16134"); //Polygon ChefV1 Contract (already deployed)
  console.log(`Chef address: ${chef.address}`);

  // Deploy dummy ERC20 LP token (auto mints full supply to deployer)
  const dummyERC20 = await ethers.getContractFactory("ERC20Mock", deployer);
  const dummyLPSupply = "100000000000000000000";
  const dummyLP = await dummyERC20.connect(deployer).deploy("DummyLP", "DLP", dummyLPSupply);
  await dummyLP.deployed();
  console.log(`Dummy LP token address: ${dummyLP.address}`);

  // Add dummy token as an LP pool on Masterchef V1
  const allocPoint = 0;
  const lpAddress = dummyLP.address;
  const rewarderAddress = "0x0000000000000000000000000000000000000000";

  const poolLength = await chef.poolLength();
  let canAddPool = true;
  for (let i = 0; i < poolLength.toNumber(); i++) {
    const poolInfo = await chef.poolInfo(i);
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
  const newPoolLength = await chef.poolLength();
  const poolId = newPoolLength.toNumber() - 1;
  console.log(`Pool ID of Dummy Token: ${poolId}`);

  // Deploy Masterchef V2 contract
  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
  const chefv2 = await masterChefV2.connect(deployer).deploy(chef.address, tri.address, poolId);
  await chefv2.deployed();
  console.log(`Masterchef V2 address: ${chefv2.address}`);

  // Approve Dummy LP to be used by Masterchef V2
  const dummyLPBalance = await dummyLP.balanceOf(deployer.address);
  console.log(`Dummy LP Balance of Deployer: ${dummyLPBalance}`);

  console.log(`Approving dummy lp token ${dummyLP.address} for spend by MasterChefV2: ${chefv2.address}`);
  const approveTx = await dummyLP.connect(deployer).approve(chefv2.address, dummyLPBalance);
  const approveReceipt = await approveTx.wait();
  console.log(approveReceipt.logs);

  const allowance = await dummyLP.connect(deployer).allowance(deployer.address, chefv2.address);
  console.log(`Allowance of Masterchef V2: ${allowance}`);

  // Init Masterchef V2
  console.log(`Calling init function on Masterchef V2`);
  const initTx = await chefv2.connect(deployer).init(dummyLP.address);
  const initReceipt = await initTx.wait();
  console.log(initReceipt.logs);

  // Check that Chef V1 got the Dummy LP tokens from Chef V2 Init
  const chefDummyLPBalance = await dummyLP.balanceOf(chef.address);
  console.log(`Chef V1 Dummy LP Token Balance: ${chefDummyLPBalance}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
