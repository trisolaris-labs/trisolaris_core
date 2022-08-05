## Usage

### Pre Requisites

Before running any command, you need to create a `.env` file and set a BIP-39 compatible mnemonic as an environment
variable. Follow the example in `.env.example`. If you don't already have a mnemonic, use this [website](https://iancoleman.io/bip39/) to generate one.

Then, proceed with installing dependencies:

```sh
yarn install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ yarn compile
```

### TypeChain

Compile the smart contracts and generate TypeChain artifacts:

```sh
$ yarn typechain
```

### Lint Solidity

Lint the Solidity code:

```sh
$ yarn lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ yarn lint:ts
```

### Test

Run the Mocha tests:

```sh
$ yarn test
```

### Coverage

Generate the code coverage report:

```sh
$ yarn coverage
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true yarn test
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ yarn clean
```

### Deploy

Deploy the contracts to Hardhat Network:

```sh
$ yarn deploy --greeting "Bonjour, le monde!"
```

## Syntax Highlighting

If you use VSCode, you can enjoy syntax highlighting for your Solidity code via the
[vscode-solidity](https://github.com/juanfranblanco/vscode-solidity) extension. The recommended approach to set the
compiler version is to add the following fields to your VSCode user settings:

```json
{
  "solidity.compileUsingRemoteVersion": "v0.8.4+commit.c7e474f2",
  "solidity.defaultCompiler": "remote"
}
```

Where of course `v0.8.4+commit.c7e474f2` can be replaced with any other version.

## Contract verification

### Verifying ComplexNRewarder

`arguments.js` is needed because we cannot verify constructor with arrays in the CLI

```
npx hardhat verify --network aurora --constructor-args verify/argumentsNRewarder.js 0x9E5c2dC717cCAc1eB0e8d267E43538E03531503d
```

### Passing the lint Github actions

- Forked contracts have been ignored from being linted, these include `amm`, `stableswap`, `multicall` and `weth` folders.
  Run the following commands on your local to lint the files

```
yarn prettier
yarn lint
```

## Adding new rewarder

- Create new PR with rewarder/\*\* branch name
- Create newRewarderConfig.json file, fill out value keys from newRewarderConfig.sample.json
- Once proposed gnosis safe signatures are signed and contracts are verified, we will merge your PR!
- [Example PR](https://github.com/trisolaris-labs/trisolaris_core/pull/94)

## Update Pool allocation

- Create new PR with allocation/\*\* branch name
- Create allocationConfig.json file, fill out value keys from allocationConfig.sample.json
- [Example PR](https://github.com/trisolaris-labs/trisolaris_core/pull/95)
