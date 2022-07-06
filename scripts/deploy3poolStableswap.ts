// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { usdcAddress, usdtAddress, usnAddress } from "./constants";

async function main(): Promise<void> {
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
  const usdt = erc20Factory.attach(usdtAddress);
  const usn = erc20Factory.attach(usnAddress);

  const usdcDecimals = await usdc.decimals();
  const usdtDecimals = await usdt.decimals();
  const usnDecimals = await usn.decimals();

  const LpTokenFactory = await ethers.getContractFactory("LPToken", deployer);
  const lpTokenBase = await LpTokenFactory.deploy();
  await lpTokenBase.deployed();
  await lpTokenBase.initialize("Test Token", "TEST");
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
  const TOKEN_ADDRESSES = [usdc.address, usdt.address, usn.address];
  const TOKEN_DECIMALS = [usdcDecimals, usdtDecimals, usnDecimals];
  const LP_TOKEN_NAME = "Trisolaris USDC/USDT/USN";
  const LP_TOKEN_SYMBOL = "USD TLP";
  const INITIAL_A = 400;
  const SWAP_FEE = 10e6; // 10bps
  const ADMIN_FEE = 0; // 5 * 10e8; // 50 %

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

  // Deploying contracts with 0x620b5A0998e19B47681A02055bfcD0B856AbC375
  // LPToken Base deployed at 0xB77190A4fD2528d2Bb778B409FB5224f7ffaCB24
  // amplificationUtils deployed at 0x114ECaa70256aFAd393f733aA4B4bF61c8959fc2
  // swapUtils deployed at 0x0564d68404608599e8c567A0bD74F90a942A69A0
  // swapFlashLoan deployed at 0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970
  // lpToken deployed at 0x87BCC091d0A7F9352728100268Ac8D25729113bB

  // Verify contracts
  // await run("verify:verify", {
  //   address: "0xB77190A4fD2528d2Bb778B409FB5224f7ffaCB24",
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: "0x114ECaa70256aFAd393f733aA4B4bF61c8959fc2",
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: "0x0564d68404608599e8c567A0bD74F90a942A69A0",
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: "0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970",
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: "0x87BCC091d0A7F9352728100268Ac8D25729113bB",
  //   constructorArguments: [],
  // });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
