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
    const lpAddress = "0xb0c5eFFD0eA4D4d274971374d696Fa08860Ea709"
    const zeroAddress = "0x0000000000000000000000000000000000000000"

    const [deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const masterChef = await ethers.getContractFactory("MasterChef")
    const triToken = await ethers.getContractFactory("Tri")

    const tri = triToken.attach("0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B")
    console.log(`Tri address: ${tri.address}`)
    const chef = masterChef.attach("0x43A1dD21a5237C6F5eEC94747C28aa3f5C8fa1c7")
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
        const tx = await chef.add(allocPoint, lpAddress, zeroAddress, true);
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
