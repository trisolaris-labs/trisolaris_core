import fs from "fs-extra";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefV2Address, ops } from "../constants";

type AllocationConfig = {
  PoolId: number;
  Allocation: number;
  Rewarder: string;
  LpToken: string;
};

const { SAFE_SIGNER_MNEMONIC = undefined, AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

if (!SAFE_SIGNER_MNEMONIC) {
  throw new Error("*** SAFE_SIGNER_MNEMONIC NOT FOUND IN ENV ***");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
const SAFE_SERVICE_URL = "https://safe-transaction.aurora.gnosis.io/";
const provider = new JsonRpcProvider(AURORA_URL);

const signer = Wallet.fromMnemonic(SAFE_SIGNER_MNEMONIC).connect(provider);
const service = new SafeService(SAFE_SERVICE_URL);
console.info("Setup SafeEthersSigner");
const ethAdapter = new EthersAdapter({ ethers, signer });

const allocPoint = 0;

console.info("*** Using signer address: ", signer.address);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

async function main() {
  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  console.info("*** Proposing updating pool allocation ***");

  let allocationConfig: AllocationConfig | undefined;
  try {
    allocationConfig = await fs.readJSON("./allocationConfig.json");
    console.info("*** allocationConfig.json found ***");
    console.info(JSON.stringify(allocationConfig));
  } catch (err) {
    console.info("*** No allocationConfig.json found");
  }

  if (allocationConfig && typeof allocationConfig?.Rewarder === "string") {
    const masterChefV2 = await ethers.getContractFactory("MasterChefV2");

    const chefv2 = masterChefV2.attach(chefV2Address);

    const { LpToken: lpTokenAddress, PoolId: poolId, Rewarder: rewarder } = allocationConfig;

    const [poolInfo, poolLpToken] = await Promise.all([chefv2.poolInfo(poolId), chefv2.lpToken(poolId)]);

    console.info(`Chef v2 address: ${chefv2.address}`);
    console.info("poolId: " + poolId);
    console.info("lpTokenAddress: " + lpTokenAddress);
    console.info("rewarder: " + rewarder);
    console.info("poolInfo: " + poolInfo);
    console.info("poolLpToken: " + poolLpToken);

    if (poolLpToken === lpTokenAddress) {
      await chefv2.connect(safeSigner).set(poolId, allocPoint, rewarder, false);

      console.info("*** USER ACTION REQUIRED ***");
      console.info("Go to the Gnosis Safe Web App to confirm the transaction");
      console.info(`https://gnosis-safe.io/app/aurora:${ops}/transactions/queue`);
      console.info(`*** Please verify the proposed adding pool to MCV2`);

      // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
      await fs.remove("./allocationConfig.json");
      console.info("*** Removed allocationConfig.json file, no longer needed");
    }
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
