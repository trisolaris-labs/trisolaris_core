// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { zeroAddress } from 'ethereumjs-util';
import { ethers } from 'hardhat';


async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy
    const allocPoint = 0
    const poolId = 5
    const lpAddress = "0x84b123875F0F36B966d0B6Ca14b31121bd9676AD"
    const rewarderAddress = "0x0000000000000000000000000000000000000000"


    const [_, deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const masterChef = await ethers.getContractFactory("MasterChef")

    const chef = masterChef.attach("0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B")
    console.log(`Chef address: ${chef.address}`)

    const poolInfo = await chef.poolInfo(poolId)
    console.log(poolInfo)
    if (poolInfo.lpToken == lpAddress) {
        console.log("reached here")
        const tx = await chef.connect(deployer).set(poolId, allocPoint, false, rewarderAddress, false) 
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
