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
  twoPoolLpTokenAddress,
  threePoolSwapFlashLoanAddress,
  twoPoolSwapFlashLoanAddress,
  usdc_eAddress,
  usdt_eAddress,
  opsMultiSigAddress,
} from "../constants";

type DeployedContracts = {
  stableLPMakerV4: string;
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
  const StableLPMakerV4 = await ethers.getContractFactory("StableLPMakerV4");

  const stableLPMakerV4ConstructorArgs = [
    twoPoolSwapFlashLoanAddress,
    pTRI,
    usdt_eAddress,
    usdc_eAddress,
    twoPoolLpTokenAddress,
    dao,
  ];
  console.log(...stableLPMakerV4ConstructorArgs);

  // const stableLPMakerV4 = await StableLPMakerV4.connect(deployer).attach(stableLPMakerV4Address);
  const stableLPMakerV4 = await StableLPMakerV4.connect(deployer).deploy(
    stableLPMakerV4ConstructorArgs[0],
    stableLPMakerV4ConstructorArgs[1],
    stableLPMakerV4ConstructorArgs[2],
    stableLPMakerV4ConstructorArgs[3],
    stableLPMakerV4ConstructorArgs[4],
    stableLPMakerV4ConstructorArgs[5],
  );
  await stableLPMakerV4.deployed();
  console.log(`StableLPMakerV4 deployed at: ${stableLPMakerV4.address}`);

  // addStableSwap to whitelist pools
  await (await stableLPMakerV4.addStableSwap(threePoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV4.addStableSwap(${threePoolSwapFlashLoanAddress}): threePoolSwapFlashLoanAddress`);

  await (await stableLPMakerV4.addStableSwap(twoPoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV4.addStableSwap(${twoPoolSwapFlashLoanAddress}): twoPoolSwapFlashLoanAddress`);

  // added metapool deposit address
  await (await stableLPMakerV4.addStableSwap(nusdPoolSwapDepositAddress)).wait(1);
  console.log(`StableLPMakerV4.addStableSwap(${nusdPoolSwapDepositAddress}): nusdPoolSwapDepositAddress`);

  // added metapool flashloan address
  await (await stableLPMakerV4.addStableSwap(nusdPoolSwapFlashLoanAddress)).wait(1);
  console.log(`StableLPMakerV4.addStableSwap(${nusdPoolSwapFlashLoanAddress}): nusdPoolSwapFlashLoanAddress`);

  // added metapool flashloan address
  await (await stableLPMakerV4.setProtocolOwnerLiquidityPercent(20)).wait(1);
  console.log(`StableLPMakerV4.setProtocolOwnerLiquidityPercent(20): 20% protocol owner liquidity percent`);

  // added metapool flashloan address
  await (await stableLPMakerV4.transferOwnership(opsMultiSigAddress)).wait(1);
  console.log(`stableLPMakerV4.transferOwnership(${opsMultiSigAddress}): opsMultiSigAddress`);

  // Verify StableLPMakerV4 deployment for aurorascan
  await run("verify:verify", {
    address: stableLPMakerV4.address,
    constructorArguments: stableLPMakerV4ConstructorArgs,
  });

  return { stableLPMakerV4: stableLPMakerV4.address };
}

export { main };

main().catch(error => {
  console.error(error);
  process.exit(1);
});
