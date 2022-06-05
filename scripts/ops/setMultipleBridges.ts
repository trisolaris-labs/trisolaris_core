// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { usdcMaker } from "../constants";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  const [_, deployer] = await ethers.getSigners();
  console.log(`Setting bridges with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`);

  const UsdcMaker = await ethers.getContractFactory("UsdcMaker");

  const usdcMakerInstance = UsdcMaker.attach(usdcMaker);
  console.log(`UsdcMaker attached at: ${usdcMakerInstance.address}`);

  const bridges = [
    ["0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d", "0xb12bfca5a55806aaf64e99521918a4bf0fc40802"],
    ["0xe9f226a228eb58d408fdb94c3ed5a18af6968fe1", "0xb12bfca5a55806aaf64e99521918a4bf0fc40802"],
    ["0x8bec47865ade3b172a928df8f990bc7f2a3b9f79", "0xc9bdeed33cd01541e1eed10f90519d2c06fe3feb"],
    // ["0xb12bfca5a55806aaf64e99521918a4bf0fc40802", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"], // USDC:wNEAR - Invalid bridge error
    ["0x4988a896b1227218e4a686fde5eabdcabd91571f", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0xea62791aa682d455614eaa2a12ba3d9a2fd197af", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x80a16016cc4a2e6a2caca8a4a498b1699ff0f844", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x2bf9b864cdc97b08b6d79ad4663e71b8ab65c45c", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x6ab6d61428fde76768d7b45d8bfeec19c6ef91a8", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0xdcd6d4e2b3e1d1e1e6fa8c21c8a323dcbecff970", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x68e401b61ea53889505cc1366710f733a60c2d41", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x9f1f933c660a1dc856f0e0fe058435879c5ccef0", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0xf0f3b9eee32b1f490a4b8720cf6f005d4ae9ea86", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x9d6fc90b25976e40adad5a3edd08af9ed7a21729", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
    ["0x07f9f7f963c5cd2bbffd30ccfb964be114332e30", "0xc42c30ac6cc15fac9bd938618bcaa1a1fae8501d"],
  ];

  async function execute() {
    for (const [token, bridge] of bridges) {
      const tx = await usdcMakerInstance.connect(deployer).setBridge(token, bridge);
      console.log(`Set bridge ${token} to ${bridge}`);

      await tx.wait(2);
    }
  }

  await execute();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
