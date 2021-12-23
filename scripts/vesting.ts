// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat';
import { triAddress, totalSupply, specialistAddress } from './constants';


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

    const vestingBegin = 1640995200; // 19th Nov 2021 00:00 UTC
    const vestingCliff = 1640995200; // 19th Dec 2021 00:00 UTC
    const vestingEnd = 1669852800; // 19th Nov 2022 00:00 UTC
    const vestingAmount = totalSupply.mul(1).div(100);
    const recepientAddress = specialistAddress;
    
    const triToken = await ethers.getContractFactory("Tri")
    const vesterContract = await ethers.getContractFactory("Vester")
    const tri = triToken.attach(triAddress)
    const triBalance = await tri.balanceOf(deployer.address)
    console.log(`Tri balance: ${triBalance.toString()}`)

    /*
    // Things to change
    const vestingOptions = [
        {
            recepient: specialistAddress,
            vestingAmount: totalSupply.mul(1).div(100), // 4% of supply
            vestingContractAddress: "0x0A0Dc69d4d6042a961E7f6D9e87B53df0C079E2b",
        }
    ]
    

    for (let i = 0; i < vestingOptions.length; i++) {
        let vestingOption = vestingOptions[i];
        console.log("Working on ", vestingOption.recepient)

        const vester = vesterContract.attach(vestingOption.vestingContractAddress)
        const onChainTriAddress = await vester.tri()
        const onChainRecepient = await vester.recipient()
        const onChainVestingAmount = await vester.vestingAmount()
        const onChainVestingBegin = await vester.vestingBegin()
        const onChainVestingCliff = await vester.vestingCliff()
        const onChainVestingEnd = await vester.vestingEnd()
        const triBalance = await tri.balanceOf(vestingOption.vestingContractAddress)

        if (
            onChainTriAddress === triAddress &&
            onChainRecepient === vestingOption.recepient &&
            onChainVestingAmount.eq(vestingOption.vestingAmount) &&
            onChainVestingBegin.toNumber() === vestingBegin &&
            onChainVestingCliff.toNumber() === vestingCliff &&
            onChainVestingEnd.toNumber() === vestingEnd &&
            triBalance.eq("0")
            ) {
            console.log("reached here")
            console.log(vestingOption.vestingAmount.div(decimals).toString())
            const tx = await tri.connect(deployer).transfer(
                vestingOption.vestingContractAddress, 
                vestingOption.vestingAmount
            );
            const receipt = await tx.wait();
            console.log(receipt.logs);
        }
    }
    */

    const treasuryVester = await vesterContract.connect(deployer).deploy(
        tri.address,
        recepientAddress,
        vestingAmount,
        vestingBegin,
        vestingCliff,
        vestingEnd,
    );
    console.log(`Vester address: ${treasuryVester.address}`)


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
