import fs from "fs-extra";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ops, SAFE_SERVICE_URL } from "../constants";

type RewarderTokensPerBlockConfig = {
  Rewarder: string;
  TokensPerBlock: number;
};

const { SAFE_SIGNER_MNEMONIC = undefined, AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

if (!SAFE_SIGNER_MNEMONIC) {
  throw new Error("*** SAFE_SIGNER_MNEMONIC NOT FOUND IN ENV ***");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;

const provider = new JsonRpcProvider(AURORA_URL);

const signer = Wallet.fromMnemonic(SAFE_SIGNER_MNEMONIC).connect(provider);
const service = new SafeService(SAFE_SERVICE_URL);
console.info("Setup SafeEthersSigner");
const ethAdapter = new EthersAdapter({ ethers, signer });

console.info("*** Using signer address: ", signer.address);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

async function main() {
  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  console.info("*** Proposing updating rewarder tokens per block ***");

  let rewarderTokensPerBlockConfig: RewarderTokensPerBlockConfig | undefined;
  try {
    rewarderTokensPerBlockConfig = await fs.readJSON("./rewarderTokensPerBlockConfig.json");
    console.info("*** rewarderTokensPerBlockConfig.json found ***");
    console.info(JSON.stringify(rewarderTokensPerBlockConfig));
  } catch (err) {
    console.info("*** No rewarderTokensPerBlockConfig.json found");
  }

  if (rewarderTokensPerBlockConfig && typeof rewarderTokensPerBlockConfig?.Rewarder === "string") {
    const { Rewarder, TokensPerBlock } = rewarderTokensPerBlockConfig;
    const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
    const rewarder = complexRewarder.attach(Rewarder);

    console.info(`Rewarder address: ${rewarder.address}`);
    console.info("Tokens Per Block: " + TokensPerBlock);

    await rewarder.connect(safeSigner).setRewardRate(TokensPerBlock);

    console.info("*** USER ACTION REQUIRED ***");
    console.info("Go to the Gnosis Safe Web App to confirm the transaction");
    console.info(`https://gnosis-safe.io/app/aurora:${ops}/transactions/queue`);
    console.info(`*** Please verify the proposed rewarder tokens per block tx`);

    // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
    await fs.remove("./rewarderTokensPerBlockConfig.json");
    console.info("*** Removed rewarderTokensPerBlockConfig.json file, no longer needed");
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
