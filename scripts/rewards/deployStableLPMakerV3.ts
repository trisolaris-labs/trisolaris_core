// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, run } from "hardhat";
import {
  dao,
  nusdPoolSwapDepositAddress,
  nusdPoolSwapFlashLoanAddress,
  pTRIAddress,
  threePoolLpTokenAddress,
  threePoolSwapFlashLoanAddress,
  twoPoolSwapFlashLoanAddress,
  usdc_eAddress,
  usdt_eAddress,
  usnAddress,
} from "../constants";

type DeployedContracts = {
  stableLPMakerV3: string;
};
type DeployConstructorDependencies = {
  pTRI: string;
};
async function main(deployConstructorDependencies?: DeployConstructorDependencies): Promise<DeployedContracts> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  let pTRI;
  if (deployConstructorDependencies) {
    console.log(`Using fresh deployed arg pTRI: ${deployConstructorDependencies.pTRI}`);
    pTRI = deployConstructorDependencies.pTRI;
  } else {
    console.log(`Using already deployed arg pTRI: ${pTRIAddress}`);
    pTRI = pTRIAddress;
  }
  const StableLPMakerV3 = await ethers.getContractFactory("StableLPMakerV3");

  const stableLPMakerV3ConstructorArgs = [
    threePoolSwapFlashLoanAddress,
    pTRI,
    usnAddress,
    usdt_eAddress,
    usdc_eAddress,
    threePoolLpTokenAddress,
    dao,
  ];
  console.log(...stableLPMakerV3ConstructorArgs);

  // const stableLPMakerV3 = await StableLPMakerV3.connect(deployer).attach(stableLPMakerV3Address);
  const stableLPMakerV3 = await StableLPMakerV3.connect(deployer).deploy(
    stableLPMakerV3ConstructorArgs[0],
    stableLPMakerV3ConstructorArgs[1],
    stableLPMakerV3ConstructorArgs[2],
    stableLPMakerV3ConstructorArgs[3],
    stableLPMakerV3ConstructorArgs[4],
    stableLPMakerV3ConstructorArgs[5],
    stableLPMakerV3ConstructorArgs[6],
  );
  await stableLPMakerV3.deployed();
  console.log(`StableLPMakerV3 deployed at: ${stableLPMakerV3.address}`);

  // addStableSwap to whitelist pools
  await (await stableLPMakerV3.addStableSwap(threePoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV3.addStableSwap(${threePoolSwapFlashLoanAddress}): threePoolSwapFlashLoanAddress`);

  await (await stableLPMakerV3.addStableSwap(twoPoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV3.addStableSwap(${twoPoolSwapFlashLoanAddress}): twoPoolSwapFlashLoanAddress`);

  // added metapool deposit address
  await (await stableLPMakerV3.addStableSwap(nusdPoolSwapDepositAddress)).wait(1);
  console.log(`StableLPMakerV3.addStableSwap(${nusdPoolSwapDepositAddress}): nusdPoolSwapDepositAddress`);

  // added metapool flashloan address
  await (await stableLPMakerV3.addStableSwap(nusdPoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV3.addStableSwap(${nusdPoolSwapFlashLoanAddress}): nusdPoolSwapFlashLoanAddress`);

  // added metapool flashloan address
  await (await stableLPMakerV3.setProtocolOwnerLiquidityPercent(20)).wait(1);
  console.log(`StableLPMakerV3.setProtocolOwnerLiquidityPercent(20): 20% protocol owner liquidity percent`);

  // Verify StableLPMakerV3 deployment for aurorascan
  await run("verify:verify", {
    address: stableLPMakerV3.address,
    constructorArguments: stableLPMakerV3ConstructorArgs,
  });

  return { stableLPMakerV3: stableLPMakerV3.address };
}

export { main };

main().catch(error => {
  console.error(error);
  process.exit(1);
});
