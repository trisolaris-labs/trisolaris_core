import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefAddress, ops } from "../constants";

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

console.info("*** Using signer address: ", signer.address);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

async function main() {
  const decimals = ethers.BigNumber.from(10).pow(18);
  const newTriPerBlock = 3.25;

  const newTriPerBlockFormatted = decimals.mul(newTriPerBlock);

  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  console.info("*** Proposing updating pool allocation ***");

  const masterChef = await ethers.getContractFactory("MasterChef");

  const chef = masterChef.attach(chefAddress);

  await chef.connect(safeSigner).updateTriPerBlock(newTriPerBlockFormatted);

  console.info("*** USER ACTION REQUIRED ***");
  console.info("Go to the Gnosis Safe Web App to confirm the transaction");
  console.info(`https://gnosis-safe.io/app/aurora:${ops}/transactions/queue`);
  console.info(`*** Please verify the proposed changing the tri per block on MCV1`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
