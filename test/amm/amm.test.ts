import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConfigurableWETH9, UniswapV2Factory, UniswapV2Router02, UniswapV2Pair, ERC20Mock } from "../../typechain";

chai.use(solidity);
const { expect } = chai;

describe("AMM", () => {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let weth: ConfigurableWETH9;
  let token: ERC20Mock;
  let factory: UniswapV2Factory;
  let router: UniswapV2Router02;
  let pair: UniswapV2Pair;

  // Define an initial supply for the test token (ERC20)
  const initialTokenSupply = ethers.utils.parseEther("10000");

  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

    // Deploy the ConfigurableWETH9 contract.
    const wethFactory = await ethers.getContractFactory("ConfigurableWETH9");
    weth = await wethFactory.deploy("Wrapped Ether", "WETH");

    // Deploy a simple ERC20 token for testing liquidity (TestToken).
    // Make sure your TestToken contract has a constructor like: constructor(string name, string symbol, uint256 initialSupply)
    const tokenFactory = await ethers.getContractFactory("ERC20Mock");
    token = await tokenFactory.deploy("Test Token", "TTK", 18, initialTokenSupply);
    await token.deployed();

    // Deploy the Uniswap V2 Factory with a feeTo address (using deployer for simplicity)
    const factoryFactory = await ethers.getContractFactory("UniswapV2Factory");
    factory = await factoryFactory.deploy(deployer.address);
    await factory.deployed();

    // Deploy the Uniswap V2 Router; its constructor expects the factory address and the WETH address.
    const routerFactory = await ethers.getContractFactory("UniswapV2Router02");
    router = await routerFactory.deploy(factory.address, weth.address);
    await router.deployed();

    // Approve the router to spend our TestToken on behalf of deployer
    await token.approve(router.address, initialTokenSupply);
  });

  it("addLiquidityETH", async () => {
    // Define liquidity amounts.
    const tokenAmount = ethers.utils.parseEther("1000");
    const ethAmount = ethers.utils.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    // Add liquidity using addLiquidityETH. The router will automatically wrap the ETH.
    const tx = await router.addLiquidityETH(
      token.address,
      tokenAmount,
      0, // min tokens
      0, // min ETH
      deployer.address,
      deadline,
      { value: ethAmount },
    );
    await tx.wait();

    // Retrieve the pair address from the factory.
    const pairAddress = await factory.getPair(token.address, weth.address);
    expect(pairAddress).to.properAddress;

    // Attach the UniswapV2Pair contract interface to the pair address.
    const pairFactory = await ethers.getContractFactory("UniswapV2Pair");
    pair = pairFactory.attach(pairAddress);

    // Check that the pair's reserves reflect the liquidity just added.
    const reserves = await pair.getReserves();
    // Note: Tokens are sorted in the pair by address, so check which reserve corresponds to which token.
    const token0 = await pair.token0();
    let reserveWETH, reserveToken;
    if (token0.toLowerCase() === token.address.toLowerCase()) {
      reserveToken = reserves._reserve0;
      reserveWETH = reserves._reserve1;
    } else {
      reserveToken = reserves._reserve1;
      reserveWETH = reserves._reserve0;
    }

    expect(reserveToken).to.be.gte(tokenAmount);
    expect(reserveWETH).to.be.gte(ethAmount);
  });

  it("swapExactETHForTokens", async () => {
    // First, add liquidity to ensure an active pool.
    const tokenAmount = ethers.utils.parseEther("1000");
    const ethAmount = ethers.utils.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    await router.addLiquidityETH(token.address, tokenAmount, 0, 0, deployer.address, deadline, { value: ethAmount });

    // Perform a swap: user sends 1 ETH and expects to receive some TestToken.
    const swapEthAmount = ethers.utils.parseEther("1");
    const path = [weth.address, token.address];
    const amountsOutMin = 0; // For testing, we can set minimum output to 0
    const swapDeadline = Math.floor(Date.now() / 1000) + 60 * 20;

    // Get user's token balance before the swap.
    const userTokenBefore = await token.balanceOf(user.address);

    const swapTx = await router.connect(user).swapExactETHForTokens(amountsOutMin, path, user.address, swapDeadline, {
      value: swapEthAmount,
    });
    await swapTx.wait();

    // Verify that the user's token balance increased.
    const userTokenAfter = await token.balanceOf(user.address);
    expect(userTokenAfter).to.be.gt(userTokenBefore);
  });

  it("removeLiquidityETH", async () => {
    // Add liquidity first.
    const tokenAmount = ethers.utils.parseEther("1000");
    const ethAmount = ethers.utils.parseEther("10");
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const addTx = await router.addLiquidityETH(token.address, tokenAmount, 0, 0, deployer.address, deadline, {
      value: ethAmount,
    });
    await addTx.wait();

    // Retrieve the pair address and the LP token balance.
    const pairAddress = await factory.getPair(token.address, weth.address);
    const pairFactory = await ethers.getContractFactory("UniswapV2Pair");
    pair = pairFactory.attach(pairAddress);
    const lpBalance = await pair.balanceOf(deployer.address);
    expect(lpBalance).to.be.gt(0);

    // Approve the router to spend the LP tokens.
    await pair.approve(router.address, lpBalance);

    // Remove liquidity using removeLiquidityETH.
    const removeTx = await router.removeLiquidityETH(
      token.address,
      lpBalance,
      0, // min tokens
      0, // min ETH
      deployer.address,
      deadline,
    );
    await removeTx.wait();

    // After removal, the deployer's LP token balance should be zero.
    const lpBalanceAfter = await pair.balanceOf(deployer.address);
    expect(lpBalanceAfter).to.equal(0);
  });
});
