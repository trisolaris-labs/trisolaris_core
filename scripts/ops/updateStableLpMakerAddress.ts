// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { pTri } from ".././constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy
  const [_, deployer] = await ethers.getSigners();
  console.log(`Address: ${deployer.address}`);

  //Change this oce prod is fixed
  const stableLpMakerAddress = "0xc0FDE5dFF36CeC82a9f79e68bBdeF0F8981e64f6";

  const StableLpMaker = await ethers.getContractFactory("StableLPMaker");
  const lpMaker = StableLpMaker.attach(stableLpMakerAddress);
  console.log(`StbaleLpMaker address: ${lpMaker.address}`);

  const tx = await lpMaker.connect(deployer).setpTri(pTri);
  const receipt = await tx.wait();
  console.log(receipt);

  const newOwner = await lpMaker.pTri();
  console.log("New pTri", pTri);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
