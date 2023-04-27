import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefAddress, ops } from "../constants";
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import { multiSigAddress } from "../constants";

const { SAFE_SIGNER_MNEMONIC = undefined, AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
const SAFE_SERVICE_URL = "https://safe-transaction.aurora.gnosis.io/";
const provider = new JsonRpcProvider(AURORA_URL);

const service = new SafeService(SAFE_SERVICE_URL);
console.log(provider);
console.info("Setup SafeEthersSigner");
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

async function main() {
  const decimals = ethers.BigNumber.from(10).pow(18);
  const newTriPerBlock = ethers.BigNumber.from(13);

  const newTriPerBlockFormatted = decimals.mul(newTriPerBlock).div(4); // 3.25

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const path = "m/44'/60'/1'/0/0";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new LedgerSigner(provider as any, undefined, path);
  console.log(await signer.getAddress());
  const ethAdapter = new EthersAdapter({ ethers, signer: signer as any });
  const safe = await Safe.create({ ethAdapter, safeAddress: multiSigAddress });
  const safeSigner = new SafeEthersSigner(safe, service, provider);
  console.info("*** Proposing updating pool allocation ***");

  const masterChef = await ethers.getContractFactory("MasterChef");

  const chef = masterChef.attach(chefAddress).connect(safeSigner);
  console.log(await chef.owner());
  console.log(await chef.triPerBlock());
  console.log(newTriPerBlockFormatted);

  await chef.updateTriPerBlock(newTriPerBlockFormatted);

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
