import { ethers } from "hardhat";

export async function advanceBlock(): Promise<void> {
  return ethers.provider.send("evm_mine", []);
}

// eslint-disable-next-line
export async function advanceBlockTo(blockNumber: any): Promise<void> {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
}
