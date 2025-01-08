import { Wallet, utils } from "ethers";
import { task } from "hardhat/config";

task("generate", "Generate a mnemonic phrase", async (_taskArgs, hre) => {
  const wallet = Wallet.fromMnemonic(utils.entropyToMnemonic(utils.randomBytes(32)));

  console.log("wallet.address:", wallet.address);
  console.log("wallet.mnemonic.phrase:", wallet.mnemonic.phrase);
  console.log("wallet.privateKey:", wallet.privateKey);
});
