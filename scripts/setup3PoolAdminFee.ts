// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import {
  ethers,
  // , run
} from "hardhat";
import {
  threePoolAmplificationUtilsAddress,
  threePoolSwapFlashLoanAddress,
  threePoolSwapUtilsAddress,
} from "./constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants
  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", deployer);
  const amplificationUtils = await AmpUtilsFactory.attach(threePoolAmplificationUtilsAddress);
  console.log(`amplificationUtils attached at ${amplificationUtils.address}`);

  const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", deployer);
  const swapUtils = await SwapUtilsFactory.attach(threePoolSwapUtilsAddress);
  console.log(`swapUtils attached at ${swapUtils.address}`);

  const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
    libraries: {
      SwapUtils: swapUtils.address,
      AmplificationUtils: amplificationUtils.address,
    },
  });

  const swapFlashLoan = await SwapFlashLoanFactory.connect(deployer).attach(threePoolSwapFlashLoanAddress);
  console.log(`swapFlashLoan connected and attached at "${swapFlashLoan.address}"`);

  // Set Admin Fee to 50%
  const ADMIN_FEE = 5 * 10e9; // 50 %
  await swapFlashLoan.setAdminFee(ADMIN_FEE);
  console.log(`swapFlashLoan.setAdminFee("${ADMIN_FEE}")`);

  // NOTE - Setting admin fee receiver to deployer address,
  // will send to StableTriMaker once contract is deployed
  // + cronjob is setup to send to TriBar
  // StableTriMaker needs to be modified to swap for USN and add liquidity for 3pool LP tokens
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
