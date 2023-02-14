// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { GUniRouter, GUniRouter__factory, WETH9, WETH9__factory } from "../../typechain";
import { gUniRouterAddress } from "../constants";


async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");

  const [deployer] = await ethers.getSigners();
  console.log(`Calling contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const gUniRouter: GUniRouter__factory = await ethers.getContractFactory("GUniRouter");
  const router = gUniRouter.attach(gUniRouterAddress);

  console.log(`gUniRouter address: ${router.address}`);

  //Set Vault and Token Addresses (Manual for now until vaults finalized)
  const vaultAddress = "0xC7b83e5CC0E997e9D230AFBFC268Fec3b00a9F61" // OP-WETH Vault

  const token0Address = "0x4200000000000000000000000000000000000006" // WETH
  const wethFactory: WETH9__factory = await ethers.getContractFactory("WETH9");
  const token0 = wethFactory.attach(token0Address);
  const token0BalanceDeployer = await token0.balanceOf(deployer.address);
  console.log(`Token0 Balance of Deployer: ${token0BalanceDeployer}`);
  
  const token1Address = "0x4200000000000000000000000000000000000042" // OP
  const erc20Factory = await ethers.getContractFactory("ERC20Mock");
  const token1 = erc20Factory.attach(token1Address);
  const token1BalanceDeployer = await token1.balanceOf(deployer.address);
  console.log(`Token1 Balance of Deployer: ${token1BalanceDeployer}`);
  

  // Approve token0 to be used by gUNI Router
  console.log(`Approving token0 ${token0.address} for spend by gUniRouter: ${router.address}`);
  const approveTx0 = await token0.connect(deployer).approve(router.address, token0BalanceDeployer);
  const approveReceipt0 = await approveTx0.wait();
  console.log(approveReceipt0.logs);

  const allowance0 = await token0.connect(deployer).allowance(deployer.address, router.address);
  console.log(`Allowance of gUniRouter to spend Token0: ${allowance0}`);


  // Approve token1 to be used by gUNI Router
  console.log(`Approving token1 ${token1.address} for spend by gUniRouter: ${router.address}`);
  const approveTx1 = await token1.connect(deployer).approve(router.address, token1BalanceDeployer);
  const approveReceipt1 = await approveTx1.wait();
  console.log(approveReceipt1.logs);

  const allowance1 = await token1.connect(deployer).allowance(deployer.address, router.address);
  console.log(`Allowance of gUniRouter to spend Token1: ${allowance1}`);



// Add Liquidity via gUNI Router
const amount0Max = "3000000000000000" // WETH to add
const amount1Max = "1404916453317048553" // OP to add
const amount0Min = 0
const amount1Min = 0
console.log(`Calling addLiquidity function on gUNIRouter`);
  const addLiqTxn = await router.connect(deployer).addLiquidity(vaultAddress, amount0Max, amount1Max, amount0Min, amount1Min, deployer.address);
  const initReceipt = await addLiqTxn.wait();
  console.log(initReceipt.logs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
