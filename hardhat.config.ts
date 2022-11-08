import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-watcher";

import "./tasks/accounts";
import "./tasks/clean";

import { resolve } from "path";

import { config as dotenvConfig } from "dotenv";
import "@nomiclabs/hardhat-etherscan";

dotenvConfig({ path: resolve(__dirname, "./.env") });

// Ensure that we have all the environment variables we need.
const mnemonic: string | undefined = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey: string | undefined = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

const auroraApiKey: string | undefined = process.env.AURORA_API_KEY;
if (!auroraApiKey) {
  throw new Error("Please set your AURORA_API_KEY in a .env file");
}

const etherscanKey: string | undefined = process.env.ETHERSCAN_API_KEY;
if (!etherscanKey) {
  throw new Error("Please set your ETHERSCAN_API_KEY in a .env file");
}

const config = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    ropsten: {
      url: "https://ropsten.infura.io/v3/" + infuraApiKey,
      accounts: {
        count: 10,
        initialIndex: 0,
        mnemonic: mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: 3,
    },
    polygon: {
      url: "https://rpc-mainnet.maticvigil.com",
      accounts: {
        count: 10,
        initialIndex: 0,
        mnemonic: mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: 137,
    },
    auroraTestnet: {
      url: "https://testnet.aurora.dev",
      accounts: {
        count: 10,
        initialIndex: 0,
        mnemonic: mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: 1313161555,
    },
    aurora: {
      url: "https://mainnet.aurora.dev/" + auroraApiKey,
      accounts: {
        count: 10,
        initialIndex: 0,
        mnemonic: mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: 1313161554,
    },
    optimism: {
      url: "https://mainnet.optimism.io/",
      accounts: {
        count: 10,
        initialIndex: 0,
        mnemonic: mnemonic,
        path: "m/44'/60'/0'/0",
      },
      chainId: 10,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    compilers: [
      {
        version: "0.4.18",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.7.6",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.8.4",
        settings: {
          metadata: {
            bytecodeHash: "none",
          },
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  watcher: {
    compilation: {
      tasks: ["compile"],
      files: ["./contracts"],
      ignoredFiles: ["**/.vscode"],
      verbose: true,
    },

    test: {
      tasks: [{ command: "test", params: { testFiles: ["{path}"] } }],
      files: ["./test/**/*"],
      ignoredFiles: ["**/.vscode"],
      verbose: true,
    },
  },
  etherscan: {
    apiKey: etherscanKey,
  },
};

export default config;
