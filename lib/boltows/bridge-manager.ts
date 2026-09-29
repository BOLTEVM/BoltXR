import { createConfig, getQuote, LiFiStep } from '@lifi/sdk';
import { ThorchainQuery } from '@xchainjs/xchain-thorchain-query';
import { assetFromString, baseAmount, CryptoAmount } from '@xchainjs/xchain-util';

if (typeof window !== 'undefined') {
  createConfig({
    integrator: 'BoltXR',
  });
}

const thorchainQuery = new ThorchainQuery();

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The subset of a Thorchain swap estimate this module reads. */
interface ThorchainSwapQuote {
  inboundAddress?: string;
  memo?: string;
  router?: string;
  expectedAmountOut: { baseAmount: { amount(): { toString(): string } } };
}

export interface ThorchainBridgeQuote {
  provider: 'thorchain';
  quote: ThorchainSwapQuote;
  transactionRequest: { to?: string; value: string; data?: string; from?: string };
}

export class BridgeManager {
  /**
   * Get a cross-chain quote using LI.FI
   */
  static async getLifiQuote(
    fromChain: number,
    toChain: number,
    fromAddress: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<LiFiStep> {
    try {
      return await getQuote({
        fromChain,
        toChain,
        fromAddress,
        fromToken,
        toToken,
        fromAmount: amount,
      });
    } catch (e) {
      console.error("LI.FI Quote Error:", e);
      throw new Error(`LI.FI Error: ${errorText(e)}`);
    }
  }

  /**
   * Get a native cross-chain quote using Thorchain
   */
  static async getThorchainQuote(
    fromAssetStr: string,
    toAssetStr: string,
    amountStr: string,
    destinationAddress: string
  ): Promise<ThorchainBridgeQuote> {
    try {
      const fromAsset = assetFromString(fromAssetStr);
      const toAsset = assetFromString(toAssetStr);
      
      if (!fromAsset || !toAsset) throw new Error("Invalid asset format for Thorchain");

      const query = thorchainQuery as unknown as { quoteSwap(params: unknown): Promise<ThorchainSwapQuote> };
      const quote = await query.quoteSwap({
        fromAsset,
        destinationAsset: toAsset,
        amount: new CryptoAmount(baseAmount(amountStr), fromAsset),
        destinationAddress,
      });

      // Standardize Thorchain quote to look more like a transaction request
      return {
        provider: 'thorchain',
        quote: quote,
        transactionRequest: {
          to: quote.inboundAddress,
          value: quote.expectedAmountOut.baseAmount.amount().toString(), // simplified
          data: quote.memo,
          from: quote.router || undefined
        }
      };
    } catch (e) {
      console.error("Thorchain Quote Error:", e);
      throw new Error(`Thorchain Error: ${errorText(e)}`);
    }
  }

  /**
   * Determine the best provider for a swap
   */
  static getProviderForSwap(fromChain: string, toChain: string, fromAsset: string): 'thorchain' | 'lifi' | '1inch' {
    const isNativeBtc = fromAsset.toUpperCase().includes('BTC') || fromChain === 'bitcoin';
    const isNativeEth = fromChain === 'ethereum' || fromChain === 'bsc' || fromChain === 'polygon';

    if (isNativeBtc || (fromChain !== toChain && !isNativeEth)) {
      return 'thorchain';
    }

    if (fromChain !== toChain) {
      return 'lifi';
    }

    return '1inch';
  }

  /**
   * Map Chain Key to LI.FI Chain ID
   */
  static getLifiChainId(chainKey: string): number {
    const mapping: Record<string, number> = {
      'ethereum': 1,
      'polygon': 137,
      'bsc': 56,
      'arbitrum': 42161,
      'optimism': 10,
      'base': 8453,
      'avalanche': 43114,
    };
    return mapping[chainKey.toLowerCase()] || 1;
  }
}
