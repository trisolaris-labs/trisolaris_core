// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import {
  nusdPoolSwapFlashLoanAddress,
  stableLPMakerV2Address,
  threePoolSwapFlashLoanAddress,
  twoPoolSwapFlashLoanAddress,
} from "../constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  const [_, deployer] = await ethers.getSigners();
  console.log(`Calling contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const stableLPMakerV2 = { address: stableLPMakerV2Address };

  const stableSwapPool = await ethers.getContractFactory("SwapFlashLoan");

  await stableSwapPool.connect(deployer).attach(threePoolSwapFlashLoanAddress).setFeeAddress(stableLPMakerV2.address);
  console.log(
    `stableSwapPool.connect(deployer).attach(${threePoolSwapFlashLoanAddress}).setFeeAddress(${stableLPMakerV2.address})`,
  );

  await stableSwapPool.connect(deployer).attach(twoPoolSwapFlashLoanAddress).setFeeAddress(stableLPMakerV2.address);
  console.log(
    `stableSwapPool.connect(deployer).attach(${twoPoolSwapFlashLoanAddress}).setFeeAddress(${stableLPMakerV2.address})`,
  );

  await stableSwapPool.connect(deployer).attach(nusdPoolSwapFlashLoanAddress).setFeeAddress(stableLPMakerV2.address);
  console.log(
    `stableSwapPool.connect(deployer).attach(${nusdPoolSwapFlashLoanAddress}).setFeeAddress(${stableLPMakerV2.address})`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
