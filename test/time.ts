import { ethers } from "hardhat";

export async function advanceBlock(): Promise<void> {
  return ethers.provider.send("evm_mine", []);
}

export async function advanceBlockTo(blockNumber: any): Promise<void> {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) { 
    await advanceBlock();
  }
}

export async function advanceBlockBy(blocks: number = 0): Promise<void> {
  await advanceBlockTo((await ethers.provider.getBlockNumber()) + blocks);
}
