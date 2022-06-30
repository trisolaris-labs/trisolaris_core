import { promises as fs } from "fs";
import { ethers, run } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefV2Address, ops, triAddress } from "../constants";
import { ComplexRewarder } from "../../typechain";

type RewarderConfig = {
  LPToken: string;
  RewardToken: string;
  Rewarder: string;
  PoolId: number;
  RewarderTokenDecimals: number;
  CoingeckoRewarderTokenName?: string;
  RewarderPriceLP?: string;
};
type DeployedRewarder = {
  rewarder: ComplexRewarder;
};

const { SAFE_SIGNER_MNEMONIC = undefined, AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
const SAFE_SERVICE_URL = "https://safe-transaction.aurora.gnosis.io/";
const provider = new JsonRpcProvider(AURORA_URL);

if (!SAFE_SIGNER_MNEMONIC) {
  throw new Error("*** SAFE_SIGNER_MNEMONIC NOT FOUND IN ENV ***");
}

const deployer = Wallet.fromMnemonic(SAFE_SIGNER_MNEMONIC).connect(provider);
const allocPoint = 0;

console.info("*** Using deployer address: ", deployer.address);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

const addNewRewarderConfigToExistingJSON = async (
  PoolId: number,
  { rewarder }: DeployedRewarder,
  newRewarderConfig: RewarderConfig,
) => {
  try {
    const rewarderConfigsJSONFile = await fs.readFile("./rewarderConfigs.json");
    const rewarderConfigsJSON: RewarderConfig[] = JSON.parse(rewarderConfigsJSONFile?.toString());

    const rewarderConfig: RewarderConfig = { ...newRewarderConfig, Rewarder: rewarder.address, PoolId: PoolId };
    rewarderConfigsJSON.push(rewarderConfig);

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
  const tx = await complexRewarder.connect(deployer).attach(rewarder.address).transferOwnership(ops);
  await tx.wait();

  console.info("*** Transferred Rewarder at: ", rewarder.address, " ownership to ops: ", ops);
};

const proposeAddPoolChefV2 = async (
  { rewarder }: DeployedRewarder,
  newRewarderConfig: RewarderConfig,
): Promise<{ PoolId: number }> => {
  // Config
  const { LPToken } = newRewarderConfig;

  const service = new SafeService(SAFE_SERVICE_URL);
  const signer = deployer;
  console.log("Setup SafeEthersSigner");
  const ethAdapter = new EthersAdapter({ ethers, signer });
  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);

  const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
  const triToken = await ethers.getContractFactory("Tri");
  const tri = triToken.attach(triAddress);
  console.info(`Tri address: ${tri.address}`);
  const chef = masterChefV2.attach(chefV2Address);
  console.info(`Chef address: ${chef.address}`);

  const poolLength = await chef.poolLength();
  let canAddPool = true;
  let PoolId = 0;
  for (let i = 0; i < poolLength.toNumber(); i++) {
    const lpTokenAddress = await chef.lpToken(i);
    if (lpTokenAddress === LPToken) {
      canAddPool = false;
    }

    PoolId = i;
  }
  if (canAddPool) {
    console.info("*** Propose adding new pool to MCV2:", LPToken);
    const chefAddArgs = [allocPoint, LPToken, rewarder.address];
    console.info(JSON.stringify(chefAddArgs));

    await chef.connect(safeSigner).add(chefAddArgs[0], chefAddArgs[1]?.toString(), chefAddArgs[2]?.toString());

    console.info("*** USER ACTION REQUIRED ***");
    console.info("Go to the Gnosis Safe Web App to confirm the transaction");
    console.info(`*** Please verify the proposed adding pool to MCV2 after at: ${rewarder.address}`);

    return { PoolId };
  } else {
    throw new Error(`*** lpToken address already added in MCV2 Pool: ${LPToken}`);
  }
};

const deployNewRewarder = async (newRewarderConfig: RewarderConfig): Promise<DeployedRewarder> => {
  const { RewardToken, LPToken } = newRewarderConfig;
  const tokenPerBlock = "0";

  console.info(
    `*** Deploying new rewarder: ${JSON.stringify({
      rewardToken: RewardToken,
      lpToken: LPToken,
      tokenPerBlock,
      chefV2Address,
    })}`,
  );
  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const rewarderConstructorArgs = [RewardToken, LPToken, tokenPerBlock, chefV2Address];

  const rewarder = await complexRewarder
    .connect(deployer)
    .deploy(
      rewarderConstructorArgs[0],
      rewarderConstructorArgs[1],
      rewarderConstructorArgs[2],
      rewarderConstructorArgs[3],
    );
  await rewarder.deployed();
  console.info(`*** Deployed new rewarder at: ${rewarder.address}`);

  console.info(`*** Verifying new rewarder `);
  await run("verify:verify", {
    address: rewarder.address,
    constructorArguments: rewarderConstructorArgs,
  });

  return { rewarder };
};

async function main() {
  console.info("*** Proposing adding new rewarder ***");

  let newRewarderConfig;
  try {
    const newRewarderConfigJSONFile = await fs.readFile("./newRewarderConfig.json");
    newRewarderConfig = JSON.parse(newRewarderConfigJSONFile?.toString());
    console.info("*** newRewarderConfig.json found ***");
    console.info(JSON.stringify(newRewarderConfig));
  } catch (err) {
    console.info("*** No newRewarderConfig.json found");
  }

  if (newRewarderConfig) {
    // TODO: 0xchain to verify whether this is correct process?
    const rewarder = await deployNewRewarder(newRewarderConfig);
    await transferRewarderOwnershipToDAO(rewarder);
    const { PoolId } = await proposeAddPoolChefV2(rewarder, newRewarderConfig);

    await addNewRewarderConfigToExistingJSON(PoolId, rewarder, newRewarderConfig);
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
