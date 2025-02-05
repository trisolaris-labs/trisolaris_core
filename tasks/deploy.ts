import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

interface DeployArgs {
  wethName: string;
  wethSymbol: string;
  feeTo: string;
}

task("deploy", "Deploys amm and aux contracts")
  // Optional parameters for WETH name and symbol with defaults.
  .addOptionalParam("wethName", "Name for the WETH token", "Wrapped Ether", types.string)
  .addOptionalParam("wethSymbol", "Symbol for the WETH token", "WETH", types.string)
  .addOptionalParam("feeTo", "The feeTo address for the Factory contract", undefined, types.string)
  // Required parameter for the feeTo address for the Factory contract.
  .setAction(async (taskArgs: DeployArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    console.log("Starting deployment...");
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);

    // --- Deploy WETH ---
    console.log("Deploying WETH...");
    // Assuming your WETH contract takes a name and symbol in the constructor.
    // If your version of WETH doesn't require these parameters, adjust accordingly.
    const WETHFactory = await ethers.getContractFactory("ConfigurableWETH9");
    const weth = await WETHFactory.deploy(taskArgs.wethName, taskArgs.wethSymbol);
    await weth.deployed();
    console.log(`WETH deployed at: ${weth.address}`);

    // --- Deploy Factory ---
    console.log("Deploying Factory...");
    const FactoryFactory = await ethers.getContractFactory("UniswapV2Factory");
    const feeTo = taskArgs.feeTo || deployer.address;
    const factory = await FactoryFactory.deploy(feeTo);
    await factory.deployed();
    console.log(`Factory deployed at: ${factory.address}`);

    // --- Deploy Router ---
    console.log("Deploying Router...");
    const RouterFactory = await ethers.getContractFactory("UniswapV2Router02");
    // The router typically requires the factory address and WETH address in its constructor.
    const router = await RouterFactory.deploy(factory.address, weth.address);
    await router.deployed();
    console.log(`Router deployed at: ${router.address}`);

    // --- Deploy Multicall ---
    console.log("Deploying Multicall...");
    const MulticallFactory = await ethers.getContractFactory("Multicall");
    const multicall = await MulticallFactory.deploy();
    await multicall.deployed();
    console.log(`Multicall deployed at: ${multicall.address}`);

    // --- Serialize deployment addresses ---
    const deploymentInfo = {
      factory: factory.address,
      router: router.address,
      weth: weth.address,
      multicall: multicall.address,
    };

    // Ensure the deployments folder exists (create if not)
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }

    // Create a file name based on the network name (or you could use the chain ID)
    const filePath = path.join(deploymentsDir, `${network.config.chainId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`Deployment information saved to ${filePath}`);

    if (network.config.chainId !== 31337) {
      await hre.run("verify:verify", {
        address: weth.address,
        constructorArguments: [taskArgs.wethName, taskArgs.wethSymbol],
      });
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [feeTo],
      });
      await hre.run("verify:verify", {
        address: router.address,
        constructorArguments: [factory.address, weth.address],
      });
      await hre.run("verify:verify", {
        address: multicall.address,
        constructorArguments: [],
      });
    }
  });
