// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { usdcAddress, usdc_eAddress } from "./constants";

type DeployedContracts = {
  lpTokenBaseAddress: string;
  amplificationUtilsAddress: string;
  swapUtilsAddress: string;
  swapFlashLoanAddress: string;
  lpTokenAddress: string;
};

async function main(): Promise<DeployedContracts> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants
  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const erc20Factory = await ethers.getContractFactory("ERC20Mock");
  const usdc = erc20Factory.attach(usdcAddress);
  const usdc_e = erc20Factory.attach(usdc_eAddress);

  const usdcDecimals = await usdc.decimals();
  const usdc_eDecimals = await usdc_e.decimals();

  const LpTokenFactory = await ethers.getContractFactory("LPToken", deployer);
  const lpTokenBase = await LpTokenFactory.deploy();
  await lpTokenBase.deployed();
  console.log(`LPToken Base deployed at ${lpTokenBase.address}`);

  const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", deployer);
  const amplificationUtils = await AmpUtilsFactory.deploy();
  await amplificationUtils.deployed();
  console.log(`amplificationUtils deployed at ${amplificationUtils.address}`);

  const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", deployer);
  const swapUtils = await SwapUtilsFactory.deploy();
  await swapUtils.deployed();
  console.log(`swapUtils deployed at ${swapUtils.address}`);

  const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
    libraries: {
      SwapUtils: swapUtils.address,
      AmplificationUtils: amplificationUtils.address,
    },
  });
  const swapFlashLoan = await SwapFlashLoanFactory.connect(deployer).deploy();
  await swapFlashLoan.deployed();
  console.log(`swapFlashLoan deployed at ${swapFlashLoan.address}`);

  // Constructor arguments
  const TOKEN_ADDRESSES = [usdc.address, usdc_e.address];
  const TOKEN_DECIMALS = [usdcDecimals, usdc_eDecimals];
  const LP_TOKEN_NAME = "Trisolaris USDC/USDC.e";
  const LP_TOKEN_SYMBOL = "USDC/USDC.e TLP";
  const INITIAL_A = 1000;
  const SWAP_FEE = 4e6; // 4bps
  const ADMIN_FEE = 99 * 10e7; // 99%, less than 100% lol

  await swapFlashLoan
    .connect(deployer)
    .initialize(
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A,
      SWAP_FEE,
      ADMIN_FEE,
      lpTokenBase.address,
    );
  const swapStorage = await swapFlashLoan.swapStorage();
  const lpToken = LpTokenFactory.attach(swapStorage.lpToken);
  console.log(`lpToken deployed at ${lpToken.address}`);

  // Verify contracts

  // await run("verify:verify", {
  //   address: amplificationUtils.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: lpTokenBase.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: swapUtils.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: swapFlashLoan.address,
  //   constructorArguments: [],
  // });

  // Can't verify lpToken because it's internally deployed via swapFlashLoan constructor

  const deployedContracts: DeployedContracts = {
    lpTokenBaseAddress: lpTokenBase.address,
    amplificationUtilsAddress: amplificationUtils.address,
    swapUtilsAddress: swapUtils.address,
    swapFlashLoanAddress: swapFlashLoan.address,
    lpTokenAddress: lpToken.address,
  };

  return deployedContracts;
}

export { main };
