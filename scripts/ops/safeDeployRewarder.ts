import { ethers, run } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Contract, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { auroraAddress, chefV2Address } from "../constants";

async function main() {
  const safeServiceURL = "https://safe-transaction.aurora.gnosis.io/";
  const safeSignerPK = "0x";
  const lpAddress = "0xd1654a7713617d41A8C9530Fb9B948d00e162194"; //wnear-ETH LP Address
  const safeAddress = "0xf86119de6ee8d4447C8219eEC20E7561d09816d3";

  console.log("Setup provider");
  const provider = new JsonRpcProvider(process.env.JSON_RPC);
  console.log("Setup SafeService");
  const service = new SafeService(safeServiceURL);
  console.log("Setup Signer");
  const signer = new Wallet(safeSignerPK, provider);
  console.log("Setup SafeEthersSigner");
  const ethAdapter = new EthersAdapter({ ethers, signer });
  const safe = await Safe.create({ ethAdapter, safeAddress });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(safeSigner).deploy(auroraAddress, lpAddress, "0", chefV2Address);
  await rewarder.deployed();
  console.log("USER ACTION REQUIRED");
  console.log("Go to the Gnosis Safe Web App to confirm the transaction");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
