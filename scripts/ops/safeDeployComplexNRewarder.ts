import fs from "fs-extra";
import { ethers } from "hardhat";
import Safe from "@gnosis.pm/safe-core-sdk";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import { BigNumber, BigNumberish, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { chefV2Address, ops, triAddress, zeroAddress, SAFE_SERVICE_URL } from "../constants";
import { ComplexNRewarder } from "../../typechain";

type RewarderConfig = {
  LPToken: string;
  Rewarder?: string;
  PoolId: number;
  RewardTokens: string[];
};
type DeployedComplexNRewarder = {
  rewarder: ComplexNRewarder;
};

const { SAFE_SIGNER_MNEMONIC = undefined, AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
const provider = new JsonRpcProvider(AURORA_URL);

if (!SAFE_SIGNER_MNEMONIC) {
  throw new Error("*** SAFE_SIGNER_MNEMONIC NOT FOUND IN ENV ***");
}

const deployer = Wallet.fromMnemonic(SAFE_SIGNER_MNEMONIC).connect(provider);
const allocPoint = 0;

console.info("*** Using deployer address: ", deployer.address);
console.info("*** Using SAFE_SERVICE_URL: ", SAFE_SERVICE_URL);

const addNewComplexNRewarderConfigToExistingJSON = async (
  PoolId: number,
  deployedComplexNRewarder: DeployedComplexNRewarder,
  newComplexNRewarderConfig: RewarderConfig,
) => {
  const { rewarder: ComplexNRewarder } = deployedComplexNRewarder;
  const rewarderConfigsJSON: RewarderConfig[] = await fs.readJSON("./rewarderConfigs.json");

  const ComplexNRewarderConfig: RewarderConfig = {
    ...newComplexNRewarderConfig,
    Rewarder: ComplexNRewarder.address,
    PoolId: PoolId,
  };
  rewarderConfigsJSON.push(ComplexNRewarderConfig);

  await fs.writeJSON("./rewarderConfigs.json", rewarderConfigsJSON);
  console.info("*** Added new ComplexNRewarder config to rewarderConfigs.json");

  // NOTE - Used because fs.promises.rm is not a function error on github actions, weird
  await fs.remove("./newComplexNRewarderConfig.json");
  console.info("*** Removed newComplexNRewarderConfig.json file, no longer needed");
};

const transferRewarderOwnershipToDAO = async ({ rewarder }: DeployedComplexNRewarder) => {
  const complexNRewarder = await ethers.getContractFactory("ComplexNRewarder");
  const tx = await complexNRewarder.connect(deployer).attach(rewarder.address).transferOwnership(ops);
  await tx.wait();

  console.info("*** Transferred Complex N Rewarder at: ", rewarder.address, " ownership to ops: ", ops);
};

const proposeAddPoolChefV2 = async (
  deployedRewarder: DeployedComplexNRewarder,
  newComplexNRewarderConfig: RewarderConfig,
): Promise<{ PoolId: number }> => {
  // Config
  const { LPToken } = newComplexNRewarderConfig;

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

    const chefAddArgs = [allocPoint, LPToken, deployedRewarder?.rewarder?.address ?? zeroAddress];
    //  NOTE - No deployed rewarder address because no additional reward token to distribute
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

const deployNewComplexNRewarder = async (
  newComplexNRewarderConfig: RewarderConfig,
): Promise<DeployedComplexNRewarder> => {
  const { RewardTokens, LPToken } = newComplexNRewarderConfig;
  if (!RewardTokens || RewardTokens.length === 0) {
    throw new Error(
      "*** No Reward Tokens found, attempted to deploy new complex n rewarder without one, should have never reached here!",
    );
  }
  const tokensPerBlock: BigNumberish[] = new Array(RewardTokens.length).fill(BigNumber.from(0));

  console.info(
    `*** Deploying new Complex N Rewarder: ${JSON.stringify({
      rewardTokens: RewardTokens,
      lpToken: LPToken,
      tokensPerBlock,
      chefV2Address,
    })}`,
  );
  const complexNRewarder = await ethers.getContractFactory("ComplexNRewarder");
  const complexNRewarderConstructorArgs = [RewardTokens, LPToken, tokensPerBlock, chefV2Address];

  const rewarder = await complexNRewarder
    .connect(deployer)
    .deploy(
      complexNRewarderConstructorArgs[0] as string[],
      complexNRewarderConstructorArgs[1] as string,
      complexNRewarderConstructorArgs[2] as BigNumberish[],
      complexNRewarderConstructorArgs[3] as string,
    );
  await rewarder.deployed();
  console.info(`*** Deployed new Complex N Rewarder at: ${rewarder.address}`);

  return { rewarder };
};

async function main() {
  console.info("*** Proposing adding new Complex N Rewarder ***");

  let newComplexNRewarderConfig: RewarderConfig | undefined;
  try {
    newComplexNRewarderConfig = await fs.readJSON("./newComplexNRewarderConfig.json");
    console.info("*** newComplexNRewarderConfig.json found ***");
    console.info(JSON.stringify(newComplexNRewarderConfig));

    if (newComplexNRewarderConfig && Number(newComplexNRewarderConfig?.RewardTokens?.length) > 0) {
      const rewarder = await deployNewComplexNRewarder(newComplexNRewarderConfig);
      await transferRewarderOwnershipToDAO(rewarder);
      const { PoolId } = await proposeAddPoolChefV2(rewarder, newComplexNRewarderConfig);

      await addNewComplexNRewarderConfigToExistingJSON(PoolId, rewarder, newComplexNRewarderConfig);
    }
  } catch (err) {
    console.error(err);
    console.info("*** No newComplexNRewarderConfig.json found");
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
