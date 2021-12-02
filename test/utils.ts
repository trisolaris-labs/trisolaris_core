import { ethers } from "hardhat";

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: any, decimals = 18) {
    const BASE_TEN = 10
    return ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(BASE_TEN).pow(decimals))
}

export async function createSLP(thisObject: any, name: string, tokenA: any, tokenB: any, amount: any, minter: any) {
    
    const createPairTx = await thisObject.factory.createPair(tokenA.address, tokenB.address)
  
    const _pair = (await createPairTx.wait()).events[0].args.pair
  
    thisObject[name] = await thisObject.UniswapV2Pair.attach(_pair)
  
    await tokenA.transfer(thisObject[name].address, amount)
    await tokenB.transfer(thisObject[name].address, amount)
  
    await thisObject[name].mint(minter.address)
  }