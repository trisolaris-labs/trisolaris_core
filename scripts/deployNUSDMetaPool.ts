// We require the Hardhat Runtime Environment explicitly here. This is optional
// });// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, run } from "hardhat";
import { nusdAddress } from "./constants";
import { main as deploy2PoolStableSwap } from "./deploy2poolStableswap";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants
  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  // Deploy usdc-usdt 2pool base stableswap
  const { amplificationUtilsAddress, lpTokenBaseAddress, swapFlashLoanAddress, swapUtilsAddress } =
    await deploy2PoolStableSwap();

  // Deploy NUSD Metapool attached
  const LpTokenFactory = await ethers.getContractFactory("LPToken", deployer);
  const lpTokenBase = LpTokenFactory.attach(lpTokenBaseAddress);

  const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
    libraries: {
      SwapUtils: swapUtilsAddress,
      AmplificationUtils: amplificationUtilsAddress,
    },
  });
  const swapFlashLoan = SwapFlashLoanFactory.attach(swapFlashLoanAddress);

  const swapStorage = await swapFlashLoan.swapStorage();
  const swapLPToken = LpTokenFactory.attach(swapStorage.lpToken);
  const swapLPTokenDecimals = await swapLPToken.decimals();

  const erc20Factory = await ethers.getContractFactory("ERC20Mock");
  const nusd = erc20Factory.attach(nusdAddress);
  const nusdDecimals = await nusd.decimals();

  const MetaSwapUtilsFactory = await ethers.getContractFactory("MetaSwapUtils", deployer);
  const metaSwapUtils = await MetaSwapUtilsFactory.deploy();
  await metaSwapUtils.deployed();
  console.log(`metaSwapUtils deployed at ${metaSwapUtils.address}`);

  const MetaSwapFactory = await ethers.getContractFactory("MetaSwap", {
    libraries: {
      SwapUtils: swapUtilsAddress,
      AmplificationUtils: amplificationUtilsAddress,
      MetaSwapUtils: metaSwapUtils.address,
    },
  });
  const metaSwap = await MetaSwapFactory.connect(deployer).deploy();
  await metaSwap.deployed();
  console.log(`metaSwap deployed at ${metaSwap.address}`);

  // Constructor arguments
  const TOKEN_ADDRESSES = [nusd.address, swapLPToken.address];
  const TOKEN_DECIMALS = [nusdDecimals, swapLPTokenDecimals];
  const LP_TOKEN_NAME = "Trisolaris NUSD-USDC/USDT";
  const LP_TOKEN_SYMBOL = "NUSD-USDC/USDT TLP";
  const INITIAL_A = 800;
  const SWAP_FEE = 1e6; // 1bps
  const ADMIN_FEE = 5 * 10e8; // 50 %

  await metaSwap.initializeMetaSwap(
    TOKEN_ADDRESSES,
    TOKEN_DECIMALS,
    LP_TOKEN_NAME,
    LP_TOKEN_SYMBOL,
    INITIAL_A,
    SWAP_FEE,
    ADMIN_FEE,
    lpTokenBase.address,
    swapFlashLoan.address,
  );
  const metaSwapStorage = await metaSwap.swapStorage();
  const metaSwapLPToken = LpTokenFactory.attach(metaSwapStorage.lpToken);
  console.log(`metaswap lpToken deployed at ${metaSwapLPToken.address}`);

  const MetaSwapDepositFactory = await ethers.getContractFactory("MetaSwapDeposit", deployer);
  const metaSwapDeposit = await MetaSwapDepositFactory.connect(deployer).deploy();
  await metaSwapDeposit.deployed();
  console.log(`metaSwapDeposit deployed at ${metaSwapDeposit.address}`);

  await metaSwapDeposit.initialize(swapFlashLoan.address, metaSwap.address, metaSwapLPToken.address);

  // Verify contracts

  // await run("verify:verify", {
  //   address: metaSwapUtils.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: metaSwap.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: metaSwapLPToken.address,
  //   constructorArguments: [],
  // });

  // await run("verify:verify", {
  //   address: metaSwapDeposit.address,
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
