// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import Safe from "@gnosis.pm/safe-core-sdk";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import {
  ethers,
  // , run
} from "hardhat";
import { ops } from "../constants";

const { AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

const counterAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    inputs: [],
    name: "count",
    outputs: [{ internalType: "int256", name: "", type: "int256" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "decrementCounter", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "incrementCounter", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "renounceOwnership", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants

  const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
  const SAFE_SERVICE_URL = "https://safe-transaction.aurora.gnosis.io/";
  const provider = new ethers.providers.JsonRpcProvider(AURORA_URL);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const path = "m/44'/60'/1'/0/0";
  const signer = new LedgerSigner(provider as any, undefined, path);
  console.log(await signer.getAddress());
  const service = new SafeService(SAFE_SERVICE_URL);
  console.log("Setup SafeEthersSigner");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethAdapter = new EthersAdapter({ ethers, signer: signer as any });
  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const counter = new ethers.Contract("0x5388293e0287f1D1bc196c60fC2Da25D9e181130", counterAbi, safeSigner);

  console.log("Calling increment counter");
  const tx = await counter.incrementCounter();
  await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
