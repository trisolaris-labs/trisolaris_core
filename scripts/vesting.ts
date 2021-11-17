// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { triAddress, donRecepientAddress, decimals } from './constants';


async function main(): Promise<void> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contracts with ${deployer.address}`);

    const vestingAmount = decimals.mul(1)
    const vestingBegin = 1637280000; // 19th Nov 2021 00:00 UTC
    const vestingCliff = 1639872000; // 19th Dec 2021 00:00 UTC
    const vestingEnd = 1668816000; // 19th Nov 2022 00:00 UTC
    const recepient = donRecepientAddress;
    

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const triToken = await ethers.getContractFactory("Tri")
    const vester = await ethers.getContractFactory("Vester")

    const tri = triToken.attach(triAddress)
    console.log(`Tri address: ${tri.address}`)

    console.log(vestingAmount.toString())

    const treasuryVester = await vester.deploy(
        tri.address,
        recepient,
        vestingAmount,
        vestingBegin,
        vestingCliff,
        vestingEnd,
    );
    console.log(`Vester address: ${treasuryVester.address}`)
    
    const tx = await tri.transfer(treasuryVester.address, vestingAmount);
    const receipt = await tx.wait();
    console.log(receipt.logs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
