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
    const allocPoint = 1
    const lpAddress = "0x2F41AF687164062f118297cA10751F4b55478ae1"
    const rewarderAddress = "0x0000000000000000000000000000000000000000"

    const [deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const masterChef = await ethers.getContractFactory("MasterChef")
    const triToken = await ethers.getContractFactory("Tri")

    const tri = triToken.attach("0x0029050f71704940D77Cfe71D0F1FB868DeeFa03")
    console.log(`Tri address: ${tri.address}`)
    const chef = masterChef.attach("0x474b825a605c45836Ac50398473059D4c4c6d3Db")
    console.log(`Chef address: ${chef.address}`)

    const poolLength = await chef.poolLength();
    let canAddPool = true;
    for(let i = 0; i < poolLength.toNumber(); i++) {
        let poolInfo = await chef.poolInfo(i);
        if (poolInfo.lpToken === lpAddress) {
            canAddPool = false
        }
    }
    if (canAddPool) {
        console.log("adding pool", lpAddress)
        const tx = await chef.add(allocPoint, lpAddress, rewarderAddress, true);
        console.log(tx)
        const receipt = await tx.wait()
        console.log(receipt.logs)
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
