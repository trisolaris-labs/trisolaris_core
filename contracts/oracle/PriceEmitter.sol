pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import { UniswapOracle } from  "./UniswapOracle.sol";
import { IUniswapV2Pair } from "../amm/interfaces/IUniswapV2Pair.sol";

contract PriceEmitter is UniswapOracle {
	event Price(uint256 price);

	function emitPrice(IUniswapV2Pair exchange, address denominationToken, uint8 minBlocksBack, uint8 maxBlocksBack, UniswapOracle.ProofData memory proofData) public returns (uint256 price, uint256 blockNumber) {
		(price, blockNumber) = getPrice(exchange, denominationToken, minBlocksBack, maxBlocksBack, proofData);
		emit Price(price);
	}
}
