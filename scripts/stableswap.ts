// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';


async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy
    
    // Constants
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contracts with ${deployer.address}`);

    const LpTokenFactory = await ethers.getContractFactory("LPToken", deployer)
    const lpTokenBase = await LpTokenFactory.deploy()
    await lpTokenBase.deployed()
    await lpTokenBase.initialize("Test Token", "TEST")
    console.log(`LPToken Base deployed at ${lpTokenBase.address}`);

    const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", deployer)
    const amplificationUtils = await AmpUtilsFactory.deploy()
    await amplificationUtils.deployed()
    console.log(`amplificationUtils deployed at ${amplificationUtils.address}`);

    const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", deployer)
    const swapUtils = await SwapUtilsFactory.deploy()
    await swapUtils.deployed()
    console.log(`swapUtils deployed at ${swapUtils.address}`);

    const SwapFlashLoanFactory = await ethers.getContractFactory(
        "SwapFlashLoan", {
            libraries: {
                SwapUtils: swapUtils.address,
                AmplificationUtils: amplificationUtils.address,
            },
        }
    )
    const swapFlashLoan = await SwapFlashLoanFactory.connect(deployer).deploy()
    await swapFlashLoan.deployed()
    console.log(`swapFlashLoan deployed at ${swapFlashLoan.address}`);
    
    const usdtAddress = "0x4988a896b1227218e4a686fde5eabdcabd91571f";
    const usdcAddress = "0xb12bfca5a55806aaf64e99521918a4bf0fc40802";

    const erc20Factory = await ethers.getContractFactory("ERC20Mock");
    const usdc = erc20Factory.attach(usdcAddress);
    const usdt = erc20Factory.attach(usdtAddress);

    const usdcDecimals = await usdc.decimals();
    const usdtDecimals = await usdt.decimals();

    // Constructor arguments
    const TOKEN_ADDRESSES = [
        usdc.address,
        usdt.address,
      ]
    const TOKEN_DECIMALS = [usdcDecimals, usdtDecimals]
    const LP_TOKEN_NAME = "Trisolaris USDT/USDC"
    const LP_TOKEN_SYMBOL = "triTestUSD"
    const INITIAL_A = 400
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 1e6 //1bps

    await swapFlashLoan.connect(deployer).initialize(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A,
        SWAP_FEE,
        ADMIN_FEE,
        lpTokenBase.address,
    )
    const swapStorage = await swapFlashLoan.swapStorage()
    const lpToken = LpTokenFactory.attach(swapStorage.lpToken)
    console.log(`lpToken deployed at ${lpToken.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });