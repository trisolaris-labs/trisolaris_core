// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { 
    usdtAddress,
    usdcAddress,
    usnAddress,
    threePoolSwapFlashLoanAddress,
    wethAddress
} from '.././constants';

async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy

    const [_, deployer] = await ethers.getSigners();
    console.log(`Deploying contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const StableTriMaker = await ethers.getContractFactory("StableTriMaker")
    const tempLpMaker = "0xc80d315989ff64499FA31B6389406eA5F71cAB69"


    const stableTriMaker = await StableTriMaker.connect(deployer).deploy(threePoolSwapFlashLoanAddress,tempLpMaker,usnAddress,usdcAddress,usdtAddress)
    await stableTriMaker.deployed()
    console.log(`Maker deployed at: ${stableTriMaker.address}`)

  
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
