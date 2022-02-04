import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { setupStableSwap, getBigNumber } from "../utils"


// import { Contract, BigNumber, ContractFactory, Signer } from 'ethers'
// import { asyncForEach, MAX_UINT256 } from "./testUtils"

chai.use(solidity);
const { expect } = chai;

describe("LPToken", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.owner = this.signers[0]
    
    this.MAX_UINT256 = ethers.constants.MaxUint256
  })

  it("Reverts when minting 0", async function () {
    // Deploy dummy tokens
    await setupStableSwap(this, this.owner)
    await expect(
      this.lpTokenBase.mint(await this.owner.getAddress(), 0),
    ).to.be.revertedWith("LPToken: cannot mint 0")
  })

  it("Reverts when transferring the token to itself", async function () {
    await setupStableSwap(this, this.owner)

    await this.dai.approve(this.swapFlashLoan.address, this.MAX_UINT256)
    await this.usdc.approve(this.swapFlashLoan.address, this.MAX_UINT256)

    const tx = await this.swapFlashLoan.addLiquidity(
      [getBigNumber(100, 6), getBigNumber(100)],
      1,
      this.MAX_UINT256,
    )

    // Verify current balance
    expect(await this.lpToken.balanceOf(this.owner.address)).to.eq(String(200e18))

    // Transferring LPToken to itself should revert
    await expect(
      this.lpToken.transfer(this.lpToken.address, String(100e18)),
    ).to.be.revertedWith("LPToken: cannot send to itself")
  })

})
