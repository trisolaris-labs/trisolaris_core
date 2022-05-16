// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import {
  ethers,
  // , run
} from "hardhat";

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
  const amplificationUtils = await AmpUtilsFactory.attach("0x114ECaa70256aFAd393f733aA4B4bF61c8959fc2");
  console.log(`amplificationUtils attached at ${amplificationUtils.address}`);

  const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", deployer);
  const swapUtils = await SwapUtilsFactory.attach("0x0564d68404608599e8c567A0bD74F90a942A69A0");
  console.log(`swapUtils attached at ${swapUtils.address}`);

  const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
    libraries: {
      SwapUtils: swapUtils.address,
      AmplificationUtils: amplificationUtils.address,
    },
  });

  const swapFlashLoan = await SwapFlashLoanFactory.connect(deployer).attach(
    "0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970",
  );
  console.log(`swapFlashLoan connected and attached at "${swapFlashLoan.address}"`);

  // Set Fee Address to deployer
  await swapFlashLoan.setFeeAddress(deployer.address);
  console.log(`swapFlashLoan.setFeeAddress("${deployer.address}")`);

  // Set Admin Fee to 50%
  const ADMIN_FEE = 5 * 10e8; // 50 %
  await swapFlashLoan.setAdminFee(ADMIN_FEE);
  console.log(`swapFlashLoan.setAdminFee("${ADMIN_FEE}")`);

  // NOTE - Setting admin fee receiver to deployer address,
  // will send to StableTriMaker once contract is deployed
  // + cronjob is setup to send to TriBar
  // StableTriMaker needs to be modified to swap for USN ( + TRI )

  // Deploying contracts with 0x620b5A0998e19B47681A02055bfcD0B856AbC375
  // LPToken Base deployed at 0xB77190A4fD2528d2Bb778B409FB5224f7ffaCB24
  // amplificationUtils deployed at 0x114ECaa70256aFAd393f733aA4B4bF61c8959fc2
  // swapUtils deployed at 0x0564d68404608599e8c567A0bD74F90a942A69A0
  // swapFlashLoan deployed at 0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970
  // lpToken deployed at 0x87BCC091d0A7F9352728100268Ac8D25729113bB
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
