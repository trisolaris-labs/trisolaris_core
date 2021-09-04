import { run, ethers } from "hardhat";

async function main() {
  await run("compile");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`Account balance: ${balance.toString()}`)

  // wrapped matic address
  const WETH_ADDRESS = 0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270;

  // const FactoryContract = await ethers.getContractFactory("UniswapV2Factory")
  console.log(deployer.address)

//   const factory = await FactoryContract.deploy(deployer.address)
//   console.log(`Facotry address: ${factory.address}`)

//   const RouterContract = await ethers.getContractFactory("UniswapV2Router02")
//   const router = await RouterContract.deploy(factory.address,WETH_ADDRESS)
//   console.log(`Router address: ${router.address}`)
// }

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });