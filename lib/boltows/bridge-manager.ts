import { createConfig, getQuote, ExtendedChain, LiFiStep } from '@lifi/sdk';
import { ThorchainQuery } from '@xchainjs/xchain-thorchain-query';
import { assetFromString, baseAmount, Asset, CryptoAmount } from '@xchainjs/xchain-util';

if (typeof window !== 'undefined') {
  createConfig({
    integrator: 'BoltXR',
  });
}

const thorchainQuery = new ThorchainQuery();

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
    return await getQuote({
      fromChain,
      toChain,
      fromAddress,
      fromToken,
      toToken,
      fromAmount: amount,
    });
  }

  /**
   * Get a native cross-chain quote using Thorchain
   */
  static async getThorchainQuote(
    fromAssetStr: string,
    toAssetStr: string,
    amountStr: string,
    destinationAddress: string
  ): Promise<any> {
    const fromAsset = assetFromString(fromAssetStr);
    const toAsset = assetFromString(toAssetStr);
    
    if (!fromAsset || !toAsset) throw new Error("Invalid asset format for Thorchain");

    // Convert to CryptoAmount for ThorchainQuery v2+
    // Note: Use (thorchainQuery as any) to bypass local TS issues if types are strictly checking method presence
    return await (thorchainQuery as any).quoteSwap({
      fromAsset,
      destinationAsset: toAsset,
      amount: new CryptoAmount(baseAmount(amountStr), fromAsset),
      destinationAddress,
    });
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
    };
    return mapping[chainKey] || 1;
  }
}
