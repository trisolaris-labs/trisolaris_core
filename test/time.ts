import { ethers } from "hardhat";

export async function advanceBlock(): Promise<void> {
  return ethers.provider.send("evm_mine", []);
}

export async function advanceBlockTo(blockNumber: number): Promise<void> {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
}
