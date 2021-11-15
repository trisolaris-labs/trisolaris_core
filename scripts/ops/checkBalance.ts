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
    const [_, deployer] = await ethers.getSigners();
    console.log(`Adding pools contracts with ${deployer.address}`);

    const balance = await deployer.getBalance();
    console.log(`Account balance: ${balance.toString()}`)

    const triToken = await ethers.getContractFactory("Tri")

    const tri = triToken.attach("0xFa94348467f64D5A457F75F8bc40495D33c65aBB")
    console.log(`Tri address: ${tri.address}`)
    
    console.log((await tri.balanceOf(deployer.address)).toString())
    console.log((await tri.totalSupply()).toString())
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
