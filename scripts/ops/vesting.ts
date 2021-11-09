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
    const vestingAmount = ethers.BigNumber.from("1000000000000000000").mul(1000000);
    const recepient = "0x1232726DA91B25D22239C5707FE85E8F078F3532";
    const vestingBegin = 1636416000; // 9th 00:00
    const vestingCliff = 1636502400; // 10th 00:00
    const vestingEnd = 1636675200; // 12th 00:00


    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const triToken = await ethers.getContractFactory("Tri")
    const vester = await ethers.getContractFactory("Vester")

    const tri = triToken.attach("0x2CB45Edb4517d5947aFdE3BEAbF95A582506858B")
    console.log(`Tri address: ${tri.address}`)

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
