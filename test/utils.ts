import { ethers } from "hardhat";
import { BigNumber, Signer } from "ethers"
import { ERC20 } from "../typechain"


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

export async function setupStableSwap(thisObject: any, owner: any) {
    
    const LpTokenFactory = await ethers.getContractFactory("LPToken", owner)
    thisObject.lpTokenBase = await LpTokenFactory.deploy()
    await thisObject.lpTokenBase.deployed()
    await thisObject.lpTokenBase.initialize("Test Token", "TEST")

    const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", owner)
    thisObject.amplificationUtils = await AmpUtilsFactory.deploy()
    await thisObject.amplificationUtils.deployed()

    const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", owner)
    thisObject.swapUtils = await SwapUtilsFactory.deploy()
    await thisObject.swapUtils.deployed()

    const SwapFlashLoanFactory = await ethers.getContractFactory(
        "SwapFlashLoan", {
            libraries: {
                SwapUtils: thisObject.swapUtils.address,
                AmplificationUtils: thisObject.amplificationUtils.address,
            },
        }
    )
    thisObject.swapFlashLoan = await SwapFlashLoanFactory.connect(owner).deploy()
    await thisObject.swapFlashLoan.deployed()
}

export async function asyncForEach<T>(
    array: Array<T>,
    callback: (item: T, index: number) => void,
  ): Promise<void> {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index)
    }
}

export async function getUserTokenBalances(
    address: string | Signer,
    tokens: ERC20[],
  ): Promise<BigNumber[]> {
    const balanceArray = []
  
    if (address instanceof Signer) {
      address = await address.getAddress()
    }
  
    for (const token of tokens) {
      balanceArray.push(await token.balanceOf(address))
    }
  
    return balanceArray
  }