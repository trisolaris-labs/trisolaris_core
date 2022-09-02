import { fetchJson } from "ethers/lib/utils";
import { auroraChainId, ops } from "../constants";

type TransactionResult = {
  type?: "TRANSACTION";
  transaction?: {
    executionInfo?: {
      nonce: number;
    };
  };
  conflictType: "None";
};

type SafeClientApiResponse = {
  results: [TransactionResult];
};

const safeGetNextNonce = async (chainId: number = auroraChainId, safeAddress: string = ops): Promise<number> => {
  const safeClientApiRequestUrl = `https://safe-client.gnosis.io/v1/chains/${chainId}/safes/${safeAddress}/transactions/queued`;
  const response: SafeClientApiResponse = await fetchJson(safeClientApiRequestUrl);
  const { results } = response;
  const queuedTxNonces = results.map(transactionResult => transactionResult?.transaction?.executionInfo?.nonce ?? 0);
  console.log({ queuedTxNonces });
  if (queuedTxNonces.length === 0) {
    // First transaction on fresh safe so nonce is zero
    return 0;
  }
  const latestQueuedNonce = Math.max(...queuedTxNonces);
  return latestQueuedNonce + 1;
};

export { safeGetNextNonce };
