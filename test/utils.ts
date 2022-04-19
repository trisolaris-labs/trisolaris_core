import { ethers } from "hardhat";
import { BigNumber, Signer } from "ethers";
import { ERC20 } from "../typechain";

export enum TIME {
  SECONDS = 1,
  DAYS = 86400,
  WEEKS = 604800,
}

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: any, decimals = 18) {
  const BASE_TEN = 10;
  return ethers.BigNumber.from(amount).mul(ethers.BigNumber.from(BASE_TEN).pow(decimals));
}

export async function asyncForEach<T>(array: Array<T>, callback: (item: T, index: number) => void): Promise<void> {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index);
  }
}

export async function createSLP(thisObject: any, name: string, tokenA: any, tokenB: any, amount: any, minter: any) {
  const createPairTx = await thisObject.factory.createPair(tokenA.address, tokenB.address);

  const _pair = (await createPairTx.wait()).events[0].args.pair;

  thisObject[name] = await thisObject.UniswapV2Pair.attach(_pair);

  await tokenA.transfer(thisObject[name].address, amount);
  await tokenB.transfer(thisObject[name].address, amount);

  await thisObject[name].mint(minter.address);
}

export async function setupStableSwap(thisObject: any, owner: any) {
  const LpTokenFactory = await ethers.getContractFactory("LPToken", owner);
  thisObject.lpTokenBase = await LpTokenFactory.deploy();
  await thisObject.lpTokenBase.deployed();
  await thisObject.lpTokenBase.initialize("Test Token", "TEST");

  const AmpUtilsFactory = await ethers.getContractFactory("AmplificationUtils", owner);
  thisObject.amplificationUtils = await AmpUtilsFactory.deploy();
  await thisObject.amplificationUtils.deployed();

  const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", owner);
  thisObject.swapUtils = await SwapUtilsFactory.deploy();
  await thisObject.swapUtils.deployed();

  const SwapFlashLoanFactory = await ethers.getContractFactory("SwapFlashLoan", {
    libraries: {
      SwapUtils: thisObject.swapUtils.address,
      AmplificationUtils: thisObject.amplificationUtils.address,
    },
  });
  thisObject.swapFlashLoan = await SwapFlashLoanFactory.connect(owner).deploy();
  await thisObject.swapFlashLoan.deployed();
}

export async function setupMetaSwap(thisObject: any, owner: any) {
  await setupStableSwap(thisObject, owner);

  // deploying mock tokens
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock", thisObject.owner);
  if (!thisObject.dai) {
    thisObject.dai = await ERC20Mock.connect(thisObject.owner).deploy("DAI", "DAI", 18, getBigNumber("1000"));
    await thisObject.dai.deployed();
  }
  thisObject.usdt = await ERC20Mock.connect(thisObject.owner).deploy("USDT", "USDT", 18, getBigNumber("1000"));
  await thisObject.usdt.deployed();
  thisObject.ust = await ERC20Mock.connect(thisObject.owner).deploy("UST", "UST", 18, getBigNumber("1000"));
  await thisObject.ust.deployed();

  // Constructor arguments
  const TOKEN_ADDRESSES = [thisObject.dai.address, thisObject.usdt.address];
  const TOKEN_DECIMALS = [18, 18];
  thisObject.LP_TOKEN_NAME = "Saddle DAI/USDT";
  thisObject.LP_TOKEN_SYMBOL = "saddleTestUSD";
  thisObject.INITIAL_A = 50;
  thisObject.SWAP_FEE = 1e6; // 1bps
  thisObject.ADMIN_FEE = 0;

  await thisObject.swapFlashLoan
    .connect(thisObject.owner)
    .initialize(
      TOKEN_ADDRESSES,
      TOKEN_DECIMALS,
      thisObject.LP_TOKEN_NAME,
      thisObject.LP_TOKEN_SYMBOL,
      thisObject.INITIAL_A,
      thisObject.SWAP_FEE,
      thisObject.ADMIN_FEE,
      thisObject.lpTokenBase.address,
    );
  const swapStorage = await thisObject.swapFlashLoan.swapStorage();
  let LpTokenFactory = await ethers.getContractFactory("LPToken", thisObject.owner);
  thisObject.swapLPToken = LpTokenFactory.attach(swapStorage.lpToken);

  await asyncForEach([thisObject.owner, thisObject.user1, thisObject.user2], async signer => {
    await thisObject.dai.connect(signer).approve(thisObject.swapFlashLoan.address, thisObject.MAX_UINT256);
    await thisObject.usdt.connect(signer).approve(thisObject.swapFlashLoan.address, thisObject.MAX_UINT256);
    await thisObject.ust.connect(signer).approve(thisObject.swapFlashLoan.address, thisObject.MAX_UINT256);
    await thisObject.swapLPToken.connect(signer).approve(thisObject.swapFlashLoan.address, thisObject.MAX_UINT256);
    await thisObject.dai.transfer(signer.address, getBigNumber("300"));
    await thisObject.usdt.transfer(signer.address, getBigNumber("300"));
    await thisObject.ust.transfer(signer.address, getBigNumber("300"));
  });

  const MetaSwapUtilsFactory = await ethers.getContractFactory("MetaSwapUtils", owner);
  thisObject.metaSwapUtils = await MetaSwapUtilsFactory.deploy();
  await thisObject.metaSwapUtils.deployed();

  const MetaSwapFactory = await ethers.getContractFactory("MetaSwap", {
    libraries: {
      SwapUtils: thisObject.swapUtils.address,
      AmplificationUtils: thisObject.amplificationUtils.address,
      MetaSwapUtils: thisObject.metaSwapUtils.address,
    },
  });
  thisObject.metaSwap = await MetaSwapFactory.connect(owner).deploy();
  await thisObject.metaSwap.deployed();

  // Set approvals
  await asyncForEach([thisObject.owner, thisObject.user1, thisObject.user2], async signer => {
    await thisObject.dai.connect(signer).approve(thisObject.metaSwap.address, thisObject.MAX_UINT256);
    await thisObject.usdt.connect(signer).approve(thisObject.metaSwap.address, thisObject.MAX_UINT256);
    await thisObject.ust.connect(signer).approve(thisObject.metaSwap.address, thisObject.MAX_UINT256);
    await thisObject.swapLPToken.connect(signer).approve(thisObject.metaSwap.address, thisObject.MAX_UINT256);

    // Add some liquidity to the base pool
    await thisObject.swapFlashLoan
      .connect(signer)
      .addLiquidity([String(1e20), String(1e20)], 0, thisObject.MAX_UINT256);
  });
}

export async function getUserTokenBalances(address: string | Signer, tokens: ERC20[]): Promise<BigNumber[]> {
  const balanceArray = [];

  if (address instanceof Signer) {
    address = await address.getAddress();
  }

  for (const token of tokens) {
    balanceArray.push(await token.balanceOf(address));
  }

  return balanceArray;
}

export async function getUserTokenBalance(address: string | Signer, token: ERC20): Promise<BigNumber> {
  if (address instanceof Signer) {
    address = await address.getAddress();
  }
  return token.balanceOf(address);
}

export async function getCurrentBlockTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

export async function forceAdvanceOneBlock(timestamp?: number): Promise<any> {
  const params = timestamp ? [timestamp] : [];
  return ethers.provider.send("evm_mine", params);
}

export async function setTimestamp(timestamp: number): Promise<any> {
  return forceAdvanceOneBlock(timestamp);
}
