import { writeFileSync, existsSync, readFileSync } from "fs";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { auroraURL, chefV2Address, safeServiceURL } from "../constants";

type RewarderConfig = {
  lpToken: string;
  rewardToken: string;
};
const addNewRewarderConfigToExistingJSON = async (newRewarderConfig: RewarderConfig) => {
  try {
    const rewarderConfigsJSONFile = readFileSync("./rewarderConfigs.json");
    const rewarderConfigsJSON: RewarderConfig[] = JSON.parse(rewarderConfigsJSONFile?.toString());

    rewarderConfigsJSON.push(newRewarderConfig);

    writeFileSync("./rewarderConfigs.json", JSON.stringify(rewarderConfigsJSON));
    console.info("*** Added new rewarder config to rewarderConfigs.json");
  } catch (err) {
    console.error(err);
  }
};

const _proposeAddingNewRewarderToSafe = async (newRewarderConfig: RewarderConfig) => {
  const safeAddress = process.env.SAFE_ADDRESS;
  const safeSignerPK = process.env.SAFE_SIGNER_PK;
  if (!safeSignerPK) {
    console.error(new Error("*** SAFE SIGNER PK NOT FOUND IN ENV ***"));
    return;
  }
  if (!safeAddress) {
    console.error(new Error("*** SAFE ADDRESS NOT FOUND IN ENV ***"));
    return;
  }

  const { rewardToken, lpToken } = newRewarderConfig;
  const tokenPerBlock = "0";

  const provider = new JsonRpcProvider(auroraURL);
  const service = new SafeService(safeServiceURL);
  const signer = new Wallet(safeSignerPK, provider);
  console.log("Setup SafeEthersSigner");

  const ethAdapter = new EthersAdapter({ ethers, signer });
  const safe = await Safe.create({ ethAdapter, safeAddress });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(safeSigner).deploy(rewardToken, lpToken, tokenPerBlock, chefV2Address);
  await rewarder.deployed();
  console.log("*** USER ACTION REQUIRED ***");
  console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  console.log(`*** Please verify the new rewarder contract post confirmation after at: ${rewarder.address}`);
};

async function main() {
  console.info("*** Proposing adding new rewarder ***");

  if (existsSync("./newRewarderConfig.json")) {
    console.info("*** newRewarderConfig.json found ***");
    try {
      const newRewarderConfigJSONFile = readFileSync("./newRewarderConfig.json");
      const newRewarderConfig = JSON.parse(newRewarderConfigJSONFile?.toString());
      console.log(newRewarderConfig);

      // TODO: 0xchain to add combined scripts here
      // Add Rewarder to MCV2 etc.
      // await proposeAddingNewRewarderToSafe(newRewarderConfig);
      //

      await addNewRewarderConfigToExistingJSON(newRewarderConfig);
    } catch (err) {
      console.error(err);
    }
  } else {
    console.info("*** No newRewarderConfig.json found, not proposing to add a new one");
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
