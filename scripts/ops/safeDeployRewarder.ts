import { promises as fs } from "fs";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { auroraURL, chefV2Address, dao, safeServiceURL, triAddress } from "../constants";
import { ComplexRewarder } from "../../typechain";

type RewarderConfig = {
  lpToken: string;
  rewardToken: string;
};
type DeployedRewarder = {
  rewarder: ComplexRewarder;
};

const provider = new JsonRpcProvider(auroraURL);
const { safeAddress = undefined, safeSignerPK = undefined } = process.env;
if (!safeSignerPK) {
  throw new Error("*** SAFE SIGNER PK NOT FOUND IN ENV ***");
}
if (!safeAddress) {
  throw new Error("*** SAFE ADDRESS NOT FOUND IN ENV ***");
}

const deployer = new Wallet(safeSignerPK).connect(provider);

const addNewRewarderConfigToExistingJSON = async (newRewarderConfig: RewarderConfig) => {
  try {
    const rewarderConfigsJSONFile = await fs.readFile("./rewarderConfigs.json");
    const rewarderConfigsJSON: RewarderConfig[] = JSON.parse(rewarderConfigsJSONFile?.toString());

    rewarderConfigsJSON.push(newRewarderConfig);

    await fs.writeFile("./rewarderConfigs.json", JSON.stringify(rewarderConfigsJSON));
    console.info("*** Added new rewarder config to rewarderConfigs.json");

    await fs.rm("./newRewarderConfig.json");
    console.info("*** Removed newRewarderConfig.json file, no longer needed");
  } catch (err) {
    console.error(err);
  }
};

const transferRewarderOwnershipToDAO = async ({ rewarder }: DeployedRewarder) => {
  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const tx = await complexRewarder.connect(deployer).attach(rewarder.address).transferOwnership(dao);
  await tx.wait();

  console.info("*** Transferred Rewarder at: ", rewarder.address, " ownership to DAO: ", dao);
};

// TODO:
// Do we need this as a proposed safe tx? Migrating MCV2 to DAO?
const proposeAddPoolChefV2 = async (
  { rewarder }: DeployedRewarder,
  newRewarderConfig: RewarderConfig,
): Promise<void> => {
  // Config
  const { lpToken } = newRewarderConfig;
  const allocPoint = 0;

  const service = new SafeService(safeServiceURL);
  const signer = deployer;
  console.log("Setup SafeEthersSigner");
  const ethAdapter = new EthersAdapter({ ethers, signer });
  const safe = await Safe.create({ ethAdapter, safeAddress });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
  const triToken = await ethers.getContractFactory("Tri");
  const tri = triToken.attach(triAddress);
  console.info(`Tri address: ${tri.address}`);
  const chef = masterChefV2.attach(chefV2Address);
  console.info(`Chef address: ${chef.address}`);

  const poolLength = await chef.poolLength();
  let canAddPool = true;
  for (let i = 0; i < poolLength.toNumber(); i++) {
    const lpTokenAddress = await chef.lpToken(i);
    if (lpTokenAddress === lpToken) {
      canAddPool = false;
    }
  }
  if (canAddPool) {
    console.info("*** Propose adding new pool to MCV2:", lpToken);
    const tx = await chef.connect(safeSigner).add(allocPoint, lpToken, rewarder.address);
    await tx.wait();

    console.log("*** USER ACTION REQUIRED ***");
    console.log("Go to the Gnosis Safe Web App to confirm the transaction");
    console.log(`*** Please verify the proposed adding pool to MCV2 after at: ${rewarder.address}`);
  } else {
    throw new Error(`*** lpToken address already added in MCV2 Pool: ${lpToken}`);
  }
};

const deployNewRewarder = async (newRewarderConfig: RewarderConfig): Promise<DeployedRewarder> => {
  const { rewardToken, lpToken } = newRewarderConfig;
  const tokenPerBlock = "0";

  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarder = await complexRewarder.connect(deployer).deploy(rewardToken, lpToken, tokenPerBlock, chefV2Address);
  await rewarder.deployed();

  return { rewarder };
};

async function main() {
  console.info("*** Proposing adding new rewarder ***");

  if (await fs.stat("./newRewarderConfig.json")) {
    console.info("*** newRewarderConfig.json found ***");
    try {
      const newRewarderConfigJSONFile = await fs.readFile("./newRewarderConfig.json");
      const newRewarderConfig = JSON.parse(newRewarderConfigJSONFile?.toString());

      // TODO: 0xchain to verify whether this is correct process?
      const rewarder = await deployNewRewarder(newRewarderConfig);
      await transferRewarderOwnershipToDAO(rewarder);
      await proposeAddPoolChefV2(rewarder, newRewarderConfig);

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
