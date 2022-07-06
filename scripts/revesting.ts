// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { triAddress, decimals } from "./constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [_, deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const vestingBegin = 1647993600; // 23rd Mar 2022 00:00 UTC
  const vestingCliff = 1655942400; // 23rd Jun 2022 00:00 UTC
  const vestingEnd = 1679529600; // 23rd Mar 2023 00:00 UTC

  const triToken = await ethers.getContractFactory("Tri");
  const vesterContract = await ethers.getContractFactory("Vester");
  const tri = triToken.attach(triAddress);
  const triBalance = await tri.balanceOf(deployer.address);
  console.log(`Tri balance: ${triBalance.toString()}`);

  // Things to change
  const vestingOptions = [
    {
      recepient: "Chain",
      vestingAmount: ethers.BigNumber.from("1000000").mul(475).div(100).mul(decimals),
      vestingContractAddress: "0xADBa80e0FB59B813bcb6C0c3bB1136d6C03Ee7aa",
    },
    {
      recepient: "Baboo",
      vestingAmount: ethers.BigNumber.from("1000000").mul(475).div(100).mul(decimals),
      vestingContractAddress: "0x0A0Dc69d4d6042a961E7f6D9e87B53df0C079E2b",
    },
    {
      recepient: "Don",
      vestingAmount: ethers.BigNumber.from("1000000").mul(475).div(100).mul(decimals),
      vestingContractAddress: "0xA6002C5C9628Ca3F8d1834A7ef5bB32f1Cb2C946",
    },
    {
      recepient: "Df",
      vestingAmount: ethers.BigNumber.from("1000000").mul(15).div(10).mul(decimals),
      vestingContractAddress: "0xCDB2A9aEFd4cf0b68FFe11b8c1A1A54B917a6B3E",
    },
    {
      recepient: "Specialist",
      vestingAmount: ethers.BigNumber.from("1000000").mul(875).div(1000).mul(decimals),
      vestingContractAddress: "0xCB0A382Bf9AD8ba0b76532261C17B04D902CeA9A",
    },
  ];

  for (let i = 0; i < vestingOptions.length; i++) {
    const vestingOption = vestingOptions[i];
    console.log("Working on ", vestingOption.recepient);

    const vester = vesterContract.attach(vestingOption.vestingContractAddress);
    const onChainRecepient = await vester.recipient();

    const treasuryVester = await vesterContract
      .connect(deployer)
      .deploy(tri.address, onChainRecepient, vestingOption.vestingAmount, vestingBegin, vestingCliff, vestingEnd);
    console.log(`${vestingOption.recepient}: Vester address: ${treasuryVester.address}`);
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
