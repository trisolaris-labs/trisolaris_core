// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { triAddress, babooRecepientAddress, decimals, totalSupply } from './constants';


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

    const vestingBegin = 1637280000; // 19th Nov 2021 00:00 UTC
    const vestingCliff = 1639872000; // 19th Dec 2021 00:00 UTC
    const vestingEnd = 1668816000; // 19th Nov 2022 00:00 UTC
    
    // Things to change
    const recepient = babooRecepientAddress;
    const vestingAmount = totalSupply.mul(4).div(100) // 4% of supply
    const vestingContractAddress = "0x0A0Dc69d4d6042a961E7f6D9e87B53df0C079E2b"
    
    
    const triToken = await ethers.getContractFactory("Tri")
    const vesterContract = await ethers.getContractFactory("Vester")

    const tri = triToken.attach(triAddress)
    const vester = vesterContract.attach(vestingContractAddress)

    const triBalance = await tri.balanceOf(deployer.address)
    console.log(`Tri balance: ${triBalance.toString()}`)

    const onChainTriAddress = await vester.tri()
    const onChainRecepient = await vester.recipient()
    const onChainVestingAmount = await vester.vestingAmount()
    const onChainVestingBegin = await vester.vestingBegin()
    const onChainVestingCliff = await vester.vestingCliff()
    const onChainVestingEnd = await vester.vestingEnd()

    if (
        onChainTriAddress === triAddress &&
        onChainRecepient === recepient &&
        onChainVestingAmount === vestingAmount &&
        onChainVestingBegin.toNumber() === vestingBegin &&
        onChainVestingCliff.toNumber() === vestingCliff &&
        onChainVestingEnd.toNumber() === vestingEnd
        ) {
        console.log("reached here")
    }
    /*
    const treasuryVester = await vester.connect(deployer).deploy(
        tri.address,
        recepient,
        vestingAmount,
        vestingBegin,
        vestingCliff,
        vestingEnd,
    );
    console.log(`Vester address: ${treasuryVester.address}`)
    */

    /*
    const tx = await tri.transfer(treasuryVester.address, vestingAmount);
    const receipt = await tx.wait();
    console.log(receipt.logs);
    */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
