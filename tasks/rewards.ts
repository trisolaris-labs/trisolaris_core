import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface RewardArgs {
  startBlock: string;
  triToken: string;
  triPerBlock: number;
}

task("rewards", "Deploys reward contracts")
  .addParam("startBlock", "Start block for rewards", undefined, types.string)
  .addParam("triToken", "Address of TRI token", undefined, types.string)
  .addOptionalParam("triPerBlock", "Amount of TRI to emit per block", 0, types.int)
  // Required parameter for the feeTo address for the Factory contract.
  .setAction(async (taskArgs: RewardArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    console.log("Starting deployment...");
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    const triToken = await ethers.getContractFactory("Tri");

    const tri = triToken.connect(deployer).attach(taskArgs.triToken);
    console.log(`Tri address: ${tri.address}`);

    // NOTE: read supply from contract in case it doesn't exist
    await tri.totalSupply();

    const triPerBlock = taskArgs.triPerBlock;
    const startBlock = taskArgs.startBlock;

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`);

    const masterChef = await ethers.getContractFactory("MasterChef");

    const chef = await masterChef.connect(deployer).deploy(tri.address, triPerBlock, startBlock);
    await chef.deployed();
    console.log(`Chef address: ${chef.address}`);

    await tri.connect(deployer).setMinter(chef.address);

    if (network.config.chainId !== 31337) {
      await hre.run("verify:verify", {
        address: chef.address,
        constructorArguments: [tri.address, triPerBlock, startBlock],
      });
    }
  });
