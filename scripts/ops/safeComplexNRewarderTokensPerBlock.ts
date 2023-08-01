import fs from "fs-extra";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ops, SAFE_SERVICE_URL } from "../constants";

type ComplexNRewarderTokensPerBlockConfig = {
  Rewarder: string;
  TokensPerBlock: number[];
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

  console.info("*** Proposing updating complex n rewarder tokens per block ***");

  let complexNRewarderTokensPerBlockConfig: ComplexNRewarderTokensPerBlockConfig | undefined;
  try {
    complexNRewarderTokensPerBlockConfig = await fs.readJSON("./complexNRewarderTokensPerBlockConfig.json");
    console.info("*** complexNRewarderTokensPerBlockConfig.json found ***");
    console.info(JSON.stringify(complexNRewarderTokensPerBlockConfig));
    if (
      complexNRewarderTokensPerBlockConfig &&
      typeof complexNRewarderTokensPerBlockConfig?.Rewarder === "string" &&
      complexNRewarderTokensPerBlockConfig?.TokensPerBlock.length > 0
    ) {
      const { Rewarder, TokensPerBlock } = complexNRewarderTokensPerBlockConfig;
      const complexNRewarder = await ethers.getContractFactory("ComplexNRewarder");
      const rewarder = complexNRewarder.attach(Rewarder);

      console.info(`Rewarder address: ${rewarder.address}`);
      for (let i = 0; i < TokensPerBlock.length; i++) {
        console.info(`Tokens Per Block ${i}: ${TokensPerBlock[i]}`);
      }

      await rewarder.connect(safeSigner).setRewardRate(TokensPerBlock);

      console.info("*** USER ACTION REQUIRED ***");
      console.info("Go to the Gnosis Safe Web App to confirm the transaction");
      console.info(`https://gnosis-safe.io/app/aurora:${ops}/transactions/queue`);
      console.info(`*** Please verify the proposed rewarder tokens per block tx`);

      // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
      await fs.remove("./complexNRewarderTokensPerBlockConfig.json");
      console.info("*** Removed complexNRewarderTokensPerBlockConfig.json file, no longer needed");
    }
  } catch (err) {
    console.error(err);
    console.info("*** No complexNRewarderTokensPerBlockConfig.json found");
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
