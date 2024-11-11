import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefAddress, dao } from "../constants";
import { multiSigAddress } from "../constants";

const { AURORA_API_KEY, SAFE_PROPOSER_PRIVATE_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}
if (!SAFE_PROPOSER_PRIVATE_KEY) {
  throw new Error("*** SAFE_PROPOSER_PRIVATE_KEY NOT FOUND IN ENV");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
const SAFE_SERVICE_URL = "https://safe-transaction-aurora.safe.global";
const provider = new JsonRpcProvider(AURORA_URL);

const service = new SafeService(SAFE_SERVICE_URL);
console.log(provider);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

async function main() {
  const decimals = ethers.BigNumber.from(10).pow(18);
  const newTriPerBlock = decimals.mul(6).div(4); // 1.5

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new ethers.Wallet(SAFE_PROPOSER_PRIVATE_KEY as any, provider);
  const signerPK = await signer.getAddress();
  console.log(`Signer: ${signerPK}`);
  const ethAdapter = new EthersAdapter({ ethers, signer });
  const safe = await Safe.create({ ethAdapter, safeAddress: multiSigAddress });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const factory = await ethers.getContractFactory("MasterChef");

  const masterchef = factory.attach(chefAddress).connect(safeSigner);
  const owner = await masterchef.owner();
  const currentTriPerBlock = await masterchef.triPerBlock();
  console.log(`Owner: ${owner}`);
  console.log(`Current: ${currentTriPerBlock.mul(100).div(decimals).toNumber() / 100}`);
  console.log(`Updated: ${newTriPerBlock.mul(100).div(decimals).toNumber() / 100}`);

  console.info("*** Proposing updateTriPerBlock ***");
  // await masterchef.updateTriPerBlock(newTriPerBlock);
  const proposedTx = await masterchef.functions.updateTriPerBlock(newTriPerBlock);

  console.info("*** USER ACTION REQUIRED ***");
  console.info("Go to the Gnosis Safe Web App to confirm the transaction");
  console.info(`https://gnosis-safe.io/app/aurora:${dao}/transactions/queue`);
  console.info(`*** Please verify the proposed changing the tri per block on MCV1`);
  await proposedTx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
