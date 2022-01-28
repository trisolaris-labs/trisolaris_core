import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";

// import { LPToken__factory, SwapFlashLoan__factory, ERC20Mock__factory } from "../../typechain"
// import { Contract, BigNumber, ContractFactory, Signer } from 'ethers'
// import { asyncForEach, MAX_UINT256 } from "./testUtils"

chai.use(solidity);
const { expect } = chai;

describe("LPToken", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    
    this.MAX_UINT256 = ethers.constants.MaxUint256
    this.LpTokenFactory = await ethers.getContractFactory("LPToken")
    
  })

  it("Reverts when minting 0", async function () {
    // Deploy dummy tokens
    const firstToken = await this.LpTokenFactory.deploy()
    firstToken.initialize("Test Token", "TEST")
    await expect(
      firstToken.mint(await this.owner.getAddress(), 0),
    ).to.be.revertedWith("LPToken: cannot mint 0")
  })

  it("Reverts when transferring the token to itself", async () => {
    const swap = (await ethers.getContractAt(
      "SwapFlashLoan",
      (
        await get("SaddleUSDPool")
      ).address,
    )) as SwapFlashLoan
    const lpToken = (await ethers.getContractAt(
      "LPToken",
      (
        await get("SaddleUSDPoolLPToken")
      ).address,
    )) as LPToken

    const ownerAddress = await owner.getAddress()

    await asyncForEach(["DAI", "USDC", "USDT"], async (tokenName) => {
      const token = (await ethers.getContractAt(
        "GenericERC20",
        (
          await get(tokenName)
        ).address,
      )) as GenericERC20
      await token.mint(
        ownerAddress,
        BigNumber.from(10)
          .pow(await token.decimals())
          .mul(1000),
      )
      await token.approve(swap.address, MAX_UINT256)
    })

    await swap.addLiquidity(
      [String(100e18), String(100e6), String(100e6)],
      0,
      MAX_UINT256,
    )

    // Verify current balance
    expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(300e18))

    // Transferring LPToken to itself should revert
    await expect(
      lpToken.transfer(lpToken.address, String(100e18)),
    ).to.be.revertedWith("LPToken: cannot send to itself")
  })

})
