import { ethers } from "hardhat";

export const decimals = ethers.BigNumber.from("1000000000000000000");
export const totalSupply = ethers.BigNumber.from("1000000").mul(500).mul(decimals);
export const triAddress = "0xFa94348467f64D5A457F75F8bc40495D33c65aBB";
export const chefAddress = "0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B";
export const chefV2Address = "0x3838956710bcc9D122Dd23863a0549ca8D5675D6";
export const triBarAddress = "0x802119e4e253D5C19aA06A5d567C5a41596D6803";
export const triMakerAddress = "0xe793455c9728fc91A3E5a33FAfF9eB2F228aE151";
export const factoryAddress = "0xc66F594268041dB60507F00703b152492fb176E7";
export const multiSigAddress = "0xf86119de6ee8d4447C8219eEC20E7561d09816d3";
export const opsMultiSigAddress = "0x99cbfCf7134228e12e9ED0F534C73C85A03C91E1";
export const stableLPMaker = "0xcB251907382aEB3C2edAb766561D5F4E6c78E3FF";
export const stableLPMakerV2Address = "0x2DF95Be842cd68062Ecdb7a30cA8dD400a8ab86B";
export const stableLPMakerV3Address = "0x84c1b1986766fD32cfAC340f947217bd1fB8ADed";
export const stableLPMakerV4Address = "0x5174F1F043A9C66C58f62C3b81a24fb0F31DE94A";
export const usdcMakerAddress = "0x5EBd5e963A00500B6a1234c621811c52AF0aAade";

export const wethAddress = "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB";
export const wnearAddress = "0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d";
export const auroraAddress = "0x8bec47865ade3b172a928df8f990bc7f2a3b9f79";
export const usdcAddress = "0x368EBb46ACa6b8D0787C96B2b20bD3CC3F2c45F7"; // Native USDC
export const usdtAddress = "0x80Da25Da4D783E57d2FCdA0436873A193a4BEccF"; // Native USDT
export const usdc_eAddress = "0xB12BFcA5A55806AaF64E99521918A4bf0fC40802";
export const usdt_eAddress = "0x4988a896b1227218e4A686fdE5EabdcAbd91571f";
export const flxAddress = "0xea62791aa682d455614eaA2A12Ba3d9A2fD197af";
export const empyrAddress = "0xE9F226a228Eb58d408FdB94c3ED5A18AF6968fE1";
export const avaxAddress = "0x80A16016cC4A2E6a2CACA8a4a498b1699fF0f844";
export const bnbAddress = "0x2bF9b864cdc97b08B6D79ad4663e71B8aB65c45c";
export const maticAddress = "0x6aB6d61428fde76768D7b45D8BFeec19c6eF91A8";
export const roseAddress = "0xdcD6D4e2B3e1D1E1E6Fa8C21C8A323DcbecfF970";
export const shitzuAddress = "0x68e401B61eA53889505cc1366710f733A60C2d41";
export const bstnAddress = "0x9f1F933C660a1DC856F0E0Fe058435879c5CCEf0";
export const polarAddress = "0xf0f3b9Eee32b1F490A4b8720cf6F005d4aE9eA86";
export const spolarAddress = "0x9D6fc90b25976E40adaD5A3EdD08af9ed7a21729";
export const stnearAddress = "0x07F9F7f963C5cD2BBFFd30CcfB964Be114332E30";
export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const usnAddress = "0x5183e1b1091804bc2602586919e6880ac1cf2896";
export const usdTLPAddress = "0x87BCC091d0A7F9352728100268Ac8D25729113bB";
export const pTRIAddress = "0xe559092D2e80d9B1d91a641CE25bACC3cFdCF689";
export const nusdAddress = "0x07379565cD8B0CaE7c60Dc78e7f601b34AF2A21c";
export const axlUSDCAddress = "0x4268B8F0B87b6Eae5d897996E6b845ddbD99Adf3";

export const babooRecepientAddress = "0x7F188C75E887454f5f47bDF76fe2Fa048985930F";
export const donRecepientAddress = "0xB1B0831466E6432843a27aF36924Df9E56E6C649";
export const chainRecepientAddress = "0x504680C453F458F2f832cf66744C211b148BA8A6";
export const dfRecepientAddress = "0x49D8B1389df580B1602Ae385D32b9c5A7Ceb2e25";
export const kRecepientAddress = "0x464bCBD80Ab3Ec89A93F1667DafB682d14634A5e";
export const donDeployerAddress = "0x25b9B32d875E4b1b0ec8b74ecF4f0A2aF8e96322";
export const specialistAddress = "0x7d479275bCa2795394e42e07a2EE2d27c96F69Ca";

// Stableswap core contracts
export const lPTokenBaseAddress = "0x08800d125088CfCd9b72432383397bAF680f7c3b";
export const amplificationUtilsAddress = "0x4135b66b138f281e0173550C3fb9A706Acc755ED";
export const swapUtilsAddress = "0x518B8E8338864f229f762aAFFC0A9f0c4722900B";
export const swapFlashLoanAddress = "0x13e7a001EC72AB30D66E2f386f677e25dCFF5F59";
export const lpTokenAddress = "0x5EB99863f7eFE88c447Bc9D52AA800421b1de6c9";

// USDT/USDT.e Stableswap core contracts
export const usdtPoolLPTokenBaseAddress = "0xEf802fE735774144709581D705183F9B5bb0F87D";
export const usdtPoolAmplificationUtilsAddress = "0x6d28B0C6adF9B34584e451ae931f8E7f43dA5e5c";
export const usdtPoolSwapUtilsAddress = "0x8740b52419Ea52FB02c48F3C28246a1D491bB3E1";
export const usdtPoolSwapFlashLoanAddress = "0x3e8795F95B6D0B063A054f40e3D50178fc463763";
export const usdtPoolLpTokenAddress = "0x261ed544822455101F5D2Baa66ED5C7A004A42C7";

// USDC/USDC.e Stableswap core contracts
export const usdcPoolLPTokenBaseAddress = "0xa6d6501dEeDeEAb1a068b6b1e029a19307b1AA4C";
export const usdcPoolAmplificationUtilsAddress = "0x9F5104881F9e62Ff6f41E4322856D124D11359bE";
export const usdcPoolSwapUtilsAddress = "0xadaE81541e337180d14F36f910B56e2AF6deA8E6";
export const usdcPoolSwapFlashLoanAddress = "0x35529BbDd64a561D8A29004C7eFcb1a5D0F6eA4a";
export const usdcPoolLpTokenAddress = "0x19e91C9b155D2A8B47B74e9e100f28355AC13879";

// 5Pool Stableswap core contracts
export const fivePoolLPTokenBaseAddress = "0x1D9CB2F554cE7BE1dbAC6f69A1070694A3337a40";
export const fivePoolAmplificationUtilsAddress = "0xA141dE86B7f671B4bb1ce64631bE804d4d740c83";
export const fivePoolSwapUtilsAddress = "0x2A8b7df1F72bE3b78097149b4eF4976fFeb079Fc";
export const fivePoolSwapFlashLoanAddress = "0xdd407884589b23d2155923b8178bAA0c5725ad9c";
export const fivePoolLpTokenAddress = "0x467171053355Da79409bf2F931D21ab1f24Fe0A6";

// 3Pool Stableswap core contracts
export const threePoolLPTokenBaseAddress = "0xB77190A4fD2528d2Bb778B409FB5224f7ffaCB24";
export const threePoolAmplificationUtilsAddress = "0x114ECaa70256aFAd393f733aA4B4bF61c8959fc2";
export const threePoolSwapUtilsAddress = "0x0564d68404608599e8c567A0bD74F90a942A69A0";
export const threePoolSwapFlashLoanAddress = "0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970";
export const threePoolLpTokenAddress = "0x87BCC091d0A7F9352728100268Ac8D25729113bB";

// 2Pool Stableswap core contracts
export const twoPoolLPTokenBaseAddress = "0xcDDc83E58F9C1d6E9916b6Cfa7143B35D125FF74";
export const twoPoolAmplificationUtilsAddress = "0xA5782838b39cD618584236614E36F9c9a1b8E50e";
export const twoPoolSwapUtilsAddress = "0x931E03d5A01dB8Cb0C68B3118E502AD1B3163066";
export const twoPoolSwapFlashLoanAddress = "0x51d96EF6960cC7b4C884E1215564f926011A4064";
export const twoPoolLpTokenAddress = "0x3fADE6094373f7A91A91D4607b226791fB3BCEAf";

// nUSD Metapool Stableswap core contracts
export const nusdPoolLPTokenBaseAddress = "0xffb69779f14E851A8c550Bf5bB1933c44BBDE129";
export const nusdPoolAmplificationUtilsAddress = "0xA5782838b39cD618584236614E36F9c9a1b8E50e";
export const nusdPoolSwapUtilsAddress = "0xedbc9d412854585F71c3765697167b462e51B9C6";
export const nusdPoolSwapDepositAddress = "0xCCd87854f58773fe75CdDa542457aC48E46c2D65";
export const nusdPoolSwapFlashLoanAddress = "0x3CE7AAD78B9eb47Fd2b487c463A17AAeD038B7EC";

// axlUSDC-2pool Metapool Stableswap core contracts
export const axlUSDCLPTokenAddress = "0x4F13347Fa5eCC4D6a12e7f4F2803616cC0c60E25";
export const axlUSDCPoolMetaSwapUtilsAddress = "0xac4272228d17d23b759cDBfAdA8C0cF33FF7c4C0";
export const axlUSDCPoolSwapDepositAddress = "0x85D2cA6C45f15DF8cA07e6481dD2162628Bb314d";
export const axlUSDCPoolSwapFlashLoanAddress = "0xa2887F7F9CEbD438c679A105d31ABbe94dF72cc0";

export const dao = "0xf86119de6ee8d4447C8219eEC20E7561d09816d3";
export const ops = "0x99cbfCf7134228e12e9ED0F534C73C85A03C91E1";

export const auroraChainId = 1313161554;

export const SAFE_SERVICE_URL = "https://safe-transaction-aurora.safe.global/";

// TODO: change to multisig address
export const opsTurboAddress = "0x881A5B1BAf05df52EB201D1BF4808ee6bcdb5314";
export const feeManagerTurboAddress = "0x9cc4b98ba2c9a842c4c6c5582EF7E688Aa0a59AF";

export const wturboTurboAddress = "0x21Cc007d2b777BBaB55d51e62F5C3F31DEaa7E5d";
export const mockTriTurboAddress = "0xb14e7F8D5C307495AD24256A2FDa0C56Ae953CA1";
export const mockUsdcTurboAddress = "0x91A3AE29a6F269ef5d992Af15F5892410c4Ed0c7";
export const factoryTurboAddress = "0xf0BE0075F8De10044a7115FdCf7feC3afB3B8FE0";
