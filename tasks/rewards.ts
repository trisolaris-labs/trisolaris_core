import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const zeroAddress = "0x0000000000000000000000000000000000000000";

interface RewardArgs {
  triToken: string;
  triPerBlock: number;
  startBlock: number;
}

task("rewards", "Deploys reward contracts")
  .addParam("triToken", "Address of TRI token", undefined, types.string)
  .addParam("triPerBlock", "Amount of TRI to emit per block", undefined, types.int)
  .addParam("startBlock", "Block number when contract starts emitting rewards", undefined, types.int)
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
    const startBlock = taskArgs.startBlock ?? (await ethers.provider.getBlockNumber());

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`);

    const masterChef = await ethers.getContractFactory("VirtualMasterChef");

    const chef = await masterChef.connect(deployer).deploy(tri.address, triPerBlock, startBlock);
    await chef.deployed();
    console.log(`Chef address: ${chef.address}`);

    // Deploy dummy ERC20 LP token (auto mints full supply to deployer)
    const dummyERC20 = await ethers.getContractFactory("ERC20Mock", deployer);
    const dummyLPSupply = "100";
    const dummyLPName = "DummyLP";
    const dummyLPSymbol = "DLP";
    const dummyLP = await dummyERC20.connect(deployer).deploy(dummyLPName, dummyLPSymbol, 18, dummyLPSupply);
    await dummyLP.deployed();
    console.log(`Dummy LP token address: ${dummyLP.address}`);

    // Add dummy token as an LP pool on Masterchef V1
    const allocPoint = 0;
    const lpAddress = dummyLP.address;
    const rewarderAddress = zeroAddress;

    const poolLength = await chef.poolLength();
    let canAddPool = true;
    for (let i = 0; i < poolLength.toNumber(); i++) {
      const poolInfo = await chef.poolInfo(i);
      if (poolInfo.lpToken === lpAddress) {
        canAddPool = false;
      }
    }
    if (canAddPool) {
      console.log("adding pool", lpAddress);
      const tx = await chef.connect(deployer).add(allocPoint, lpAddress, rewarderAddress, true);
      console.log(tx);
      const receipt = await tx.wait();
      console.log(receipt.logs);
    }
    const newPoolLength = await chef.poolLength();
    const poolId = newPoolLength.toNumber() - 1;
    console.log(`Pool ID of Dummy Token: ${poolId}`);

    // Deploy Masterchef V2 contract
    const masterChefV2 = await ethers.getContractFactory("MasterChefV2");
    const chefv2 = await masterChefV2.connect(deployer).deploy(chef.address, tri.address, poolId);
    await chefv2.deployed();
    console.log(`Masterchef V2 address: ${chefv2.address}`);

    // Approve Dummy LP to be used by Masterchef V2
    const dummyLPBalance = await dummyLP.balanceOf(deployer.address);
    console.log(`Dummy LP Balance of Deployer: ${dummyLPBalance}`);

    console.log(`Approving dummy lp token ${dummyLP.address} for spend by MasterChefV2: ${chefv2.address}`);
    const approveTx = await dummyLP.connect(deployer).approve(chefv2.address, dummyLPBalance);
    const approveReceipt = await approveTx.wait();
    console.log(approveReceipt.logs);

    const allowance = await dummyLP.connect(deployer).allowance(deployer.address, chefv2.address);
    console.log(`Allowance of Masterchef V2: ${allowance}`);

    // Init Masterchef V2
    console.log(`Calling init function on Masterchef V2`);
    const initTx = await chefv2.connect(deployer).init(dummyLP.address);
    const initReceipt = await initTx.wait();
    console.log(initReceipt.logs);

    // Check that Chef V1 got the Dummy LP tokens from Chef V2 Init
    const chefDummyLPBalance = await dummyLP.balanceOf(chef.address);
    console.log(`Chef V1 Dummy LP Token Balance: ${chefDummyLPBalance}`);

    if (network.config.chainId !== 31337) {
      await hre.run("verify:verify", {
        address: chef.address,
        constructorArguments: [tri.address, triPerBlock, startBlock],
      });
      await hre.run("verify:verify", {
        address: dummyLP.address,
        constructorArguments: [dummyLPName, dummyLPSymbol, 18, dummyLPSupply],
      });
      await hre.run("verify:verify", {
        address: chefv2.address,
        constructorArguments: [chef.address, tri.address, poolId],
      });
    }
  });
