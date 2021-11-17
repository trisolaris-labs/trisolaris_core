import { ethers } from 'hardhat';

export const decimals = ethers.BigNumber.from("1000000000000000000");
export const totalSupply = ethers.BigNumber.from("1000000").mul(500).mul(decimals);
export const triAddress = "0xFa94348467f64D5A457F75F8bc40495D33c65aBB";
export const chefAddress = "0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B";
export const zeroAddress = "0x0000000000000000000000000000000000000000";

export const babooRecepientAddress = "0x7F188C75E887454f5f47bDF76fe2Fa048985930F";
export const donRecepientAddress = "0xB1B0831466E6432843a27aF36924Df9E56E6C649";
export const chainRecepientAddress = "0x504680C453F458F2f832cf66744C211b148BA8A6";
export const dfRecepientAddress = "0x49D8B1389df580B1602Ae385D32b9c5A7Ceb2e25";
export const kRecepientAddress = "0x464bCBD80Ab3Ec89A93F1667DafB682d14634A5e";
