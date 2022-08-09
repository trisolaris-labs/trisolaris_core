// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { LedgerSigner } from "@ethersproject/hardware-wallets";
import Safe from "@gnosis.pm/safe-core-sdk";
import { SafeEthersSigner, SafeService } from "@gnosis.pm/safe-ethers-adapters";
import EthersAdapter from "@gnosis.pm/safe-ethers-lib";
import {
  ethers,
  // , run
} from "hardhat";
import { ops } from "../constants";

const { AURORA_API_KEY } = process.env;
if (!AURORA_API_KEY) {
  throw new Error("*** AURORA_API_KEY NOT FOUND IN ENV");
}

const complexRewarderAbi = [
  {
    "inputs": [
      {
        "internalType": "contract IERC20",
        "name": "_rewardToken",
        "type": "address"
      },
      {
        "internalType": "contract IERC20",
        "name": "_lpToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_tokenPerBlock",
        "type": "uint256"
      },
      {
        "internalType": "contract IMasterChefV2",
        "name": "_mcv2",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldAllocPoint",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newAllocPoint",
        "type": "uint256"
      }
    ],
    "name": "AllocPointUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "OnReward",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newRate",
        "type": "uint256"
      }
    ],
    "name": "RewardRateUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MCV2",
    "outputs": [
      {
        "internalType": "contract IMasterChefV2",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lpToken",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_user",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_lpAmount",
        "type": "uint256"
      }
    ],
    "name": "onTriReward",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_user",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "pendingTokens",
    "outputs": [
      {
        "internalType": "contract IERC20[]",
        "name": "rewardTokens",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "rewardAmounts",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "accTokenPerShare",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastRewardBlock",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "address payable",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "reclaimTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardToken",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_tokenPerBlock",
        "type": "uint256"
      }
    ],
    "name": "setRewardRate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tokenPerBlock",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "updatePool",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "accTokenPerShare",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastRewardBlock",
            "type": "uint256"
          }
        ],
        "internalType": "struct ComplexRewarder.PoolInfo",
        "name": "pool",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "userInfo",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "rewardDebt",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");
  // We get the contract to deploy

  // Constants

  const AURORA_URL = "https://mainnet.aurora.dev/" + AURORA_API_KEY;
  const SAFE_SERVICE_URL = "https://safe-transaction.aurora.gnosis.io/";
  const provider = new ethers.providers.JsonRpcProvider(AURORA_URL);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const path = "m/44'/60'/1'/0/0";
  const signer = new LedgerSigner(provider as any, undefined, path);
  console.log("singer",signer)
  console.log(await signer.getAddress());
  const service = new SafeService(SAFE_SERVICE_URL);
  console.log("Setup SafeEthersSigner");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethAdapter = new EthersAdapter({ ethers, signer: signer as any });
  const safe = await Safe.create({ ethAdapter, safeAddress: ops });
  const safeSigner = new SafeEthersSigner(safe, service, provider);


//"270061728395060000000000"
  // const allocPoint = 0;
  // const poolId = 22;
  // const lpAddress = "0xbceA13f9125b0E3B66e979FedBCbf7A4AfBa6fd1";
  // const rewarderAddress = "0x0000000000000000000000000000000000000000";

  const rewarderAddress = "0xD61a0095E287b899D5A3ADf40e51d97237BBaB6B";
  const tokensPerBlock = "5254629629600000";
  const updater = new ethers.Contract(rewarderAddress, complexRewarderAbi, safeSigner);

  console.log("setting rewarder allocation");
  const tx = await updater.setRewardRate(tokensPerBlock);
  await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
