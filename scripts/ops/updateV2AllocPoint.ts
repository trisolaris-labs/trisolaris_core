// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { triAddress, chefV2Address, zeroAddress } from '../constants';


async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy
    const allocPoint = 71
    const poolId = 1
    const lpAddress = "0xd1654a7713617d41A8C9530Fb9B948d00e162194"
    const rewarderAddress = zeroAddress


    const [_, deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const masterChefV2 = await ethers.getContractFactory("MasterChefV2")

    const chefv2 = masterChefV2.attach(chefV2Address)
    console.log(`Chef v2 address: ${chefv2.address}`)

    const poolInfo = await chefv2.poolInfo(poolId)
    const poolLpToken = await chefv2.lpToken(poolId)
    console.log(poolInfo)
    if (poolLpToken == lpAddress) {
        console.log("reached here")
        const tx = await chefv2.connect(deployer).set(poolId, allocPoint, rewarderAddress, false) 
        const receipt = await tx.wait()
        console.log(receipt)
    }
    //    
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
