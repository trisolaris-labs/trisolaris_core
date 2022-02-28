// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { chefAddress } from '../constants';


async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy
    const [_, deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const masterChef = await ethers.getContractFactory("MasterChef")

    const chef = masterChef.attach(chefAddress)
    console.log(`Chef address: ${chef.address}`)

    console.log((await chef.connect(deployer).triPerBlock()).toString());

    const tx = await chef
        .connect(deployer)
        .updateTriPerBlock("4750000000000000000");
    console.log(tx);
    const receipt = await tx.wait();
    console.log(receipt.logs);
    
    console.log((await chef.connect(deployer).triPerBlock()).toString());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
