const { ethers } = require("hardhat");

export async function advanceBlock() {
  return ethers.provider.send("evm_mine", []);
}

export async function advanceBlockTo(blockNumber: any) {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
}
