// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { lpTokenAddress, lPTokenBaseAddress, amplificationUtilsAddress, swapUtilsAddress, swapFlashLoanAddress } from './constants';

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
    const lpTokenBase = LpTokenFactory.attach(lPTokenBaseAddress)

    const SwapFlashLoanFactory = await ethers.getContractFactory(
        "SwapFlashLoan", {
            libraries: {
                SwapUtils: swapUtilsAddress,
                AmplificationUtils: amplificationUtilsAddress,
            },
        }
    )
    const swapFlashLoan = SwapFlashLoanFactory.attach(swapFlashLoanAddress)

    const swapStorage = await swapFlashLoan.swapStorage()
    const swapLPToken = LpTokenFactory.attach(swapStorage.lpToken)
    const swapLPTokenDecimals = await swapLPToken.decimals();
    
    const atUstAddress = "0x5ce9F0B6AFb36135b5ddBF11705cEB65E634A9dC";

    const erc20Factory = await ethers.getContractFactory("ERC20Mock");
    const ust = erc20Factory.attach(atUstAddress);
    const ustDecimals = await ust.decimals();

    const MetaSwapUtilsFactory = await ethers.getContractFactory("MetaSwapUtils", deployer)
    const metaSwapUtils = await MetaSwapUtilsFactory.deploy()
    await metaSwapUtils.deployed()
    console.log(`metaSwapUtils deployed at ${metaSwapUtils.address}`);

    const MetaSwapFactory = await ethers.getContractFactory(
      "MetaSwap", {
          libraries: {
            SwapUtils: swapUtilsAddress,
            AmplificationUtils: amplificationUtilsAddress,
              MetaSwapUtils: metaSwapUtils.address,
          },
      }
    )
    const metaSwap = await MetaSwapFactory.connect(deployer).deploy()
    await metaSwap.deployed()
    console.log(`metaSwap deployed at ${metaSwap.address}`);
    
    // Constructor arguments
    const TOKEN_ADDRESSES = [
        ust.address, swapLPToken.address,
      ]
    const TOKEN_DECIMALS = [ustDecimals, swapLPTokenDecimals]
    const LP_TOKEN_NAME = "TEST Meta UST"
    const LP_TOKEN_SYMBOL = "UST TLP"
    const INITIAL_A = 400
    const SWAP_FEE = 10e6 // 10bps
    const ADMIN_FEE = 5*10e8 // 50 %

    await metaSwap.initializeMetaSwap(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A,
        SWAP_FEE,
        ADMIN_FEE,
        lpTokenBase.address,
        swapFlashLoan.address,
      )
      const metaSwapStorage = await metaSwap.swapStorage()
      const metaSwapLPToken = LpTokenFactory.attach(metaSwapStorage.lpToken)
      console.log(`metaswap lpToken deployed at ${metaSwapLPToken.address}`);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });