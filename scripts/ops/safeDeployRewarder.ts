import fs from "fs-extra";
import { ethers, run } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefV2Address, ops, triAddress, zeroAddress } from "../constants";
import { ComplexRewarder } from "../../typechain";

type RewarderConfig = {
  LPToken: string;
  RewardToken?: string;
  Rewarder?: string;
  PoolId: number;
  RewardTokenDecimals: number;
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
  deployedRewarder: DeployedRewarder | undefined,
  RewardTokenDecimals: number,
  newRewarderConfig: RewarderConfig,
) => {
  if (deployedRewarder) {
    const { rewarder } = deployedRewarder;
    const rewarderConfigsJSON: RewarderConfig[] = await fs.readJSON("./rewarderConfigs.json");

    const rewarderConfig: RewarderConfig = {
      ...newRewarderConfig,
      Rewarder: rewarder.address,
      PoolId: PoolId,
      RewardTokenDecimals,
    };
    rewarderConfigsJSON.push(rewarderConfig);

    await fs.writeJSON("./rewarderConfigs.json", rewarderConfigsJSON);
    console.info("*** Added new rewarder config to rewarderConfigs.json");

    // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
    await fs.remove("./newRewarderConfig.json");
    console.info("*** Removed newRewarderConfig.json file, no longer needed");
  } else {
    const rewarderConfigsJSON: RewarderConfig[] = await fs.readJSON("./rewarderConfigs.json");

    const rewarderConfig: RewarderConfig = {
      ...newRewarderConfig,
      PoolId: PoolId,
      RewardTokenDecimals,
    };
    rewarderConfigsJSON.push(rewarderConfig);

    await fs.writeJSON("./rewarderConfigs.json", rewarderConfigsJSON);
    console.info(
      "*** Added new rewarder config to rewarderConfigs.json - (Did not deploy new rewarder contract as no RewardToken)",
    );

    // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
    await fs.remove("./newRewarderConfig.json");
    console.info("*** Removed newRewarderConfig.json file, no longer needed");
  }
};

const getRewarderERC20Decimals = async (
  newRewarderConfig: RewarderConfig,
): Promise<{ RewardTokenDecimals: number }> => {
  const rewardToken = await ethers.getContractFactory("ERC20");
  if (newRewarderConfig?.RewardToken) {
    const RewardTokenDecimals = await rewardToken.connect(deployer).attach(newRewarderConfig.RewardToken).decimals();

    console.info("*** RewardTokenDecimals found as: ", RewardTokenDecimals);

    return { RewardTokenDecimals };
  } else {
    // NOTE - $TRI is the reward token decimals used here so we default to 18
    return { RewardTokenDecimals: 18 };
  }
};

const transferRewarderOwnershipToDAO = async ({ rewarder }: DeployedRewarder) => {
  const complexRewarder = await ethers.getContractFactory("ComplexRewarder");
  const tx = await complexRewarder.connect(deployer).attach(rewarder.address).transferOwnership(ops);
  await tx.wait();

  console.info("*** Transferred Rewarder at: ", rewarder.address, " ownership to ops: ", ops);
};

const proposeAddPoolChefV2 = async (
  deployedRewarder: DeployedRewarder | undefined,
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

    PoolId = i + 1; // NOTE - iteration started from zero so we add one
  }
  if (canAddPool) {
    console.info("*** Propose adding new pool to MCV2:", LPToken);

    let chefAddArgs;
    if (deployedRewarder) {
      const { rewarder } = deployedRewarder;
      chefAddArgs = [allocPoint, LPToken, rewarder.address];
    }
    //  NOTE - No deployed rewarder address because no additional reward token to distribute
    else {
      chefAddArgs = [allocPoint, LPToken, zeroAddress];
    }
    console.info(JSON.stringify(chefAddArgs));

    await chef.connect(safeSigner).add(chefAddArgs[0], chefAddArgs[1]?.toString(), chefAddArgs[2]?.toString());

    console.info("*** USER ACTION REQUIRED ***");
    console.info("Go to the Gnosis Safe Web App to confirm the transaction");
    console.info(`*** Please verify the proposed adding pool to MCV2`);

    return { PoolId };
  } else {
    throw new Error(`*** lpToken address already added in MCV2 Pool: ${LPToken}`);
  }
};

const deployNewRewarder = async (newRewarderConfig: RewarderConfig): Promise<DeployedRewarder> => {
  const { RewardToken, LPToken } = newRewarderConfig;
  if (!RewardToken) {
    throw new Error(
      "*** No Reward Token found, attempted to deploy new rewarder without one, should have never reached here!",
    );
  }
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

  let newRewarderConfig: RewarderConfig | undefined;
  try {
    newRewarderConfig = await fs.readJSON("./newRewarderConfig.json");
    console.info("*** newRewarderConfig.json found ***");
    console.info(JSON.stringify(newRewarderConfig));
  } catch (err) {
    console.info("*** No newRewarderConfig.json found");
  }

  if (newRewarderConfig) {
    if (typeof newRewarderConfig?.RewardToken === "string") {
      const rewarder = await deployNewRewarder(newRewarderConfig);
      await transferRewarderOwnershipToDAO(rewarder);
      const { PoolId } = await proposeAddPoolChefV2(rewarder, newRewarderConfig);

      const { RewardTokenDecimals } = await getRewarderERC20Decimals(newRewarderConfig);
      await addNewRewarderConfigToExistingJSON(PoolId, rewarder, RewardTokenDecimals, newRewarderConfig);
    }
    // NOTE - No rewarder to deploy because no reward token so we add to MCV2 with zero address for the rewarder param
    else {
      const { PoolId } = await proposeAddPoolChefV2(undefined, newRewarderConfig);

      const { RewardTokenDecimals } = await getRewarderERC20Decimals(newRewarderConfig);
      await addNewRewarderConfigToExistingJSON(PoolId, undefined, RewardTokenDecimals, newRewarderConfig);
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
