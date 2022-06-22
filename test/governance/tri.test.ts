import { ethers, waffle } from "hardhat";
import { Contract, BigNumber, utils, constants, Wallet } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { Tri__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { fromRpcSig, ecrecover, Address, ecsign } from "ethereumjs-util";

chai.use(solidity);
const { expect } = chai;

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
);

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
);

describe("Tri", () => {
  let tri: Contract;
  let deployer: SignerWithAddress;
  let wallet0: SignerWithAddress;
  let wallet1: SignerWithAddress;
  beforeEach(async () => {
    [deployer, wallet0, wallet1] = await ethers.getSigners();
    ethers.provider.listAccounts();
    const triFactory = new Tri__factory(deployer);
    tri = await triFactory.deploy(deployer.address);
  });

  it("Should have the correct constants", async () => {
    // ERC20 constants
    expect(await tri.name()).to.equal("Trisolaris");
    expect(await tri.symbol()).to.equal("TRI");
    expect(await tri.totalSupply()).to.equal(0);
    expect(await tri.minter()).to.equal(deployer.address);
  });

  it("mints", async () => {
    await expect(tri.connect(wallet0).mint(wallet1.address, 1)).to.be.revertedWith(
      "Tri::mint: only the minter can mint",
    );
    await expect(tri.mint("0x0000000000000000000000000000000000000000", 1)).to.be.revertedWith(
      "Tri::mint: cannot transfer to the zero address",
    );

    // can mint from minter
    expect(await tri.totalSupply()).to.equal(0);
    await tri.mint(wallet1.address, 1);
    expect(await tri.totalSupply()).to.equal(1);
    expect(await tri.balanceOf(wallet1.address)).to.equal(1);
  });

  it("nested delegation", async () => {
    const wallet0Tokens = BigNumber.from(1).mul(BigNumber.from(10).pow(18));
    const wallet1Tokens = BigNumber.from(2).mul(BigNumber.from(10).pow(18));
    await tri.mint(wallet0.address, wallet0Tokens);
    await tri.mint(wallet1.address, wallet1Tokens);

    // No votes delegated so no current votes
    expect(await tri.getCurrentVotes(wallet0.address)).to.equal(0);
    expect(await tri.getCurrentVotes(wallet1.address)).to.equal(0);

    // Delegating votes increases the currentVotes
    await tri.connect(wallet0).delegate(wallet1.address);
    expect(await tri.getCurrentVotes(wallet1.address)).to.equal(wallet0Tokens);
    await tri.connect(wallet1).delegate(wallet1.address);
    expect(await tri.getCurrentVotes(wallet1.address)).to.equal(wallet0Tokens.add(wallet1Tokens));

    // Transfering tokens out of wallet0 will remove wallet0's votes form wallet1
    await tri.connect(wallet0).transfer(deployer.address, wallet0Tokens);
    expect(await tri.balanceOf(deployer.address)).to.equal(wallet0Tokens);
    expect(await tri.getCurrentVotes(wallet1.address)).to.equal(wallet1Tokens);

    await tri.connect(deployer).transfer(wallet0.address, wallet0Tokens);
    await tri.connect(wallet0).delegate(wallet1.address);
    // delegating will only delegate UNI which is held by the delegator
    await tri.connect(wallet1).delegate(deployer.address);
    expect(await tri.getCurrentVotes(deployer.address)).to.equal(wallet1Tokens);
    expect(await tri.getCurrentVotes(wallet1.address)).to.equal(wallet0Tokens);
  });

  it("permit", async () => {
    const [wallet] = waffle.provider.getWallets();
    const network = await ethers.provider.getNetwork();

    expect(await tri.DOMAIN_TYPEHASH()).equals(DOMAIN_TYPEHASH);
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "uint256", "address"],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes("Trisolaris")), network.chainId, tri.address],
      ),
    );
    const owner = wallet.address;
    const spender = wallet0.address;
    const value = 123;
    const nonce = await tri.nonces(wallet.address);
    const deadline = constants.MaxUint256;
    const digest = utils.keccak256(
      utils.solidityPack(
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        [
          "0x19",
          "0x01",
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
              [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline],
            ),
          ),
        ],
      ),
    );

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(wallet.privateKey.slice(2), "hex"));

    await tri.mint(wallet.address, value);
    await tri.permit(owner, spender, value, deadline, v, utils.hexlify(r), utils.hexlify(s));
    expect(await tri.allowance(owner, spender)).to.eq(value);
    expect(await tri.nonces(owner)).to.eq(1);

    await tri.connect(wallet0).transferFrom(owner, spender, value);
  });
});
