import { ethers } from "hardhat";
import { Contract, BigNumber } from 'ethers'
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Vester, Vester__factory, TestERC20, TestERC20__factory } from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
const { expect } = chai;

describe('scenario:TreasuryVester', () => {

	let vester: Contract
	let erc20: Contract
	let deployer: SignerWithAddress
	let recepient: SignerWithAddress
	let vestingAmount: BigNumber
	let vestingBegin: number
	let vestingCliff: number
	let vestingEnd: number
	beforeEach('deploy treasury vesting contract', async () => {
		[deployer, recepient] = await ethers.getSigners();
		const { timestamp: now } = await ethers.provider.getBlock("latest")
		vestingAmount = ethers.BigNumber.from("100000000000000000000");
		const initialSupply = ethers.BigNumber.from("100000000000000000000");
		vestingBegin = now + 60
		vestingCliff = vestingBegin + 60
		vestingEnd = vestingBegin + 60 * 60 * 24 * 365
		const testERC20 = new TestERC20__factory(deployer);
		erc20 = await testERC20.deploy(initialSupply);
		const vesterFactory = new Vester__factory(deployer);
		vester = await vesterFactory.deploy(erc20.address, recepient.address, vestingAmount,
			vestingBegin,
			vestingCliff,
			vestingEnd)
		
		// fund the treasury
		await erc20.transfer(vester.address, vestingAmount)
	})

	it('setRecipient:fail', async () => {
		await expect(vester.setRecipient(deployer.address)).to.be.revertedWith(
			'Vester::setRecipient: unauthorized'
		)
	})

	it('claim:fail', async () => {
		await expect(vester.claim()).to.be.revertedWith('Vester::claim: not time yet')
		await ethers.provider.send('evm_mine', [vestingBegin + 1])
		await expect(vester.claim()).to.be.revertedWith('Vester::claim: not time yet')
	})

	it('claim:~half', async () => {
		await ethers.provider.send('evm_mine', [vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2)])
		await vester.claim()
		const balance = await erc20.balanceOf(recepient.address)
		expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
	})
	  it('claim:all', async () => {
		await ethers.provider.send('evm_mine', [vestingEnd])
		await vester.claim()
		const balance = await erc20.balanceOf(recepient.address)
		expect(balance).to.be.eq(vestingAmount)
	  })
	
})