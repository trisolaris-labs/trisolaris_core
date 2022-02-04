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
    
    // deploying mock tokens
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", owner)
    thisObject.dai = await ERC20Mock.connect(owner).deploy("DAI", "DAI",  6, getBigNumber("100", 6))
    await thisObject.dai.deployed()
    thisObject.usdc = await ERC20Mock.connect(owner).deploy("USDC", "USDC",  18, getBigNumber("100"))
    await thisObject.usdc.deployed()
    
    // Constructor arguments
    const TOKEN_ADDRESSES = [
        thisObject.dai.address,
        thisObject.usdc.address,
      ]
    const TOKEN_DECIMALS = [6, 18]
    const LP_TOKEN_NAME = "Saddle DAI/USDC"
    const LP_TOKEN_SYMBOL = "saddleTestUSD"
    const INITIAL_A = 400
    const SWAP_FEE = 4e6 // 4bps
    const ADMIN_FEE = 1e6 //1bps

    await thisObject.swapFlashLoan.connect(owner).initialize(
        TOKEN_ADDRESSES,
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A,
        SWAP_FEE,
        ADMIN_FEE,
        thisObject.lpTokenBase.address,
    )
    const swapStorage = await thisObject.swapFlashLoan.swapStorage()
    thisObject.lpToken = LpTokenFactory.attach(swapStorage.lpToken)
  }