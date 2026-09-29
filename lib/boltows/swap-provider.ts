/**
 * SwapProvider — Production swap and bridge aggregation via LI.FI REST API.
 * 
 * This module replaces the legacy BridgeManager multi-provider architecture
 * with a unified LI.FI-backed aggregator. Supports 30+ DEXs and 20+ bridge
 * providers across all EVM chains. Bridge providers are unrestricted — all
 * available routes are surfaced for maximum user optionality.
 * 
 * For BTC cross-chain swaps, Thorchain routing is preserved as a supplementary
 * provider via LI.FI's built-in Thorchain integration.
 */

import { CHAINS } from "./chains";

// ── Typed Interfaces ─────────────────────────────────────────────

export interface TokenInfo {
  address: string;        // 0x... or "0xeeee..." for native
  symbol: string;
  decimals: number;
  chainId: number;
  name: string;
  logoURI?: string;
  priceUSD?: string;
}

export interface FeeCost {
  name: string;
  description: string;
  percentage: string;
  amount: string;
  amountUSD: string;
  token: TokenInfo;
}

export interface GasCost {
  type: string;
  estimate: string;
  limit: string;
  amount: string;
  amountUSD: string;
  token: TokenInfo;
}

export interface TransactionRequest {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice?: string;
  chainId: number;
}

export interface RouteStep {
  id: string;
  type: 'swap' | 'cross' | 'lifi';
  tool: string;
  toolDetails: { name: string; logoURI?: string };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: TokenInfo;
    toToken: TokenInfo;
    fromAmount: string;
    slippage: number;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: string;
    feeCosts: FeeCost[];
    gasCosts: GasCost[];
    executionDuration: number;
  };
  transactionRequest?: TransactionRequest;
}

export interface SwapQuote {
  id: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  rate: string;
  estimatedGasUSD: string;
  feeCosts: FeeCost[];
  gasCosts: GasCost[];
  steps: RouteStep[];
  transactionRequest: TransactionRequest;
  tool: string;
  approvalRequired: boolean;
  approvalAddress?: string;
  executionDurationSeconds: number;
}

export interface SwapQuoteParams {
  fromChainKey: string;
  toChainKey: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage: number;       // 0.005 = 0.5%
}

export interface BridgeQuoteParams {
  fromChainKey: string;
  toChainKey: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage: number;
}

// ── Error Types ──────────────────────────────────────────────────

export class SwapError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SwapError';
  }
}

export class InsufficientLiquidityError extends SwapError {
  constructor(fromToken: string, toToken: string) {
    super(
      `Insufficient liquidity for ${fromToken} → ${toToken}. Try a smaller amount or different pair.`,
      'INSUFFICIENT_LIQUIDITY'
    );
    this.name = 'InsufficientLiquidityError';
  }
}

export class RouteNotFoundError extends SwapError {
  constructor(fromChain: string, toChain: string) {
    super(
      `No route found from ${fromChain} to ${toChain}. This chain pair may not be supported.`,
      'ROUTE_NOT_FOUND'
    );
    this.name = 'RouteNotFoundError';
  }
}

export class SlippageExceededError extends SwapError {
  constructor(expected: string, actual: string) {
    super(
      `Slippage exceeded: expected ${expected}, got ${actual}. Increase slippage tolerance or try again.`,
      'SLIPPAGE_EXCEEDED'
    );
    this.name = 'SlippageExceededError';
  }
}

export class ApprovalRequiredError extends SwapError {
  constructor(public readonly tokenAddress: string, public readonly spenderAddress: string, public readonly amount: string) {
    super(
      `Token approval required for ${tokenAddress} to spender ${spenderAddress}.`,
      'APPROVAL_REQUIRED'
    );
    this.name = 'ApprovalRequiredError';
  }
}

// ── LI.FI response shapes (only the fields we read) ─────────────

interface LifiToken {
  address?: string;
  symbol?: string;
  decimals?: number;
  chainId?: number;
  name?: string;
  logoURI?: string;
  priceUSD?: string;
}

interface LifiCost {
  name?: string;
  description?: string;
  percentage?: string;
  type?: string;
  estimate?: string;
  limit?: string;
  amount?: string;
  amountUSD?: string;
  token?: LifiToken;
}

interface LifiTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  gas?: string;
  gasPrice?: string;
  chainId?: number;
}

interface LifiStep {
  id?: string;
  type?: RouteStep['type'];
  tool?: string;
  toolDetails?: { name?: string; logoURI?: string };
  action?: {
    fromChainId?: number;
    toChainId?: number;
    fromToken?: LifiToken;
    toToken?: LifiToken;
    fromAmount?: string;
    slippage?: number;
  };
  estimate?: {
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    approvalAddress?: string;
    feeCosts?: LifiCost[];
    gasCosts?: LifiCost[];
    executionDuration?: number;
  };
  transactionRequest?: LifiTransactionRequest;
  includedSteps?: LifiStep[];
}

const toTokenInfo = (t: LifiToken | undefined, fallback?: TokenInfo): TokenInfo => ({
  address: t?.address || fallback?.address || '',
  symbol: t?.symbol || fallback?.symbol || '',
  decimals: t?.decimals ?? fallback?.decimals ?? 18,
  chainId: t?.chainId || fallback?.chainId || 0,
  name: t?.name || fallback?.name || '',
  logoURI: t?.logoURI,
  priceUSD: t?.priceUSD,
});

const toFeeCost = (f: LifiCost): FeeCost => ({
  name: f.name || '',
  description: f.description || '',
  percentage: f.percentage || '0',
  amount: f.amount || '0',
  amountUSD: f.amountUSD || '0',
  token: toTokenInfo(f.token),
});

const toGasCost = (g: LifiCost): GasCost => ({
  type: g.type || '',
  estimate: g.estimate || '0',
  limit: g.limit || '0',
  amount: g.amount || '0',
  amountUSD: g.amountUSD || '0',
  token: toTokenInfo(g.token),
});

// ── Native Token Address Constant ────────────────────────────────
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ── LI.FI API Base ───────────────────────────────────────────────
const LIFI_API_BASE = "https://li.quest/v1";
const LIFI_TIMEOUT_MS = 15_000;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── SwapProvider Class ───────────────────────────────────────────

export class SwapProvider {
  
  /**
   * Resolve a chain key (e.g., "ethereum") to its numeric chain ID.
   * Returns 0 for non-EVM chains (Bitcoin, Sui) which are not routable via LI.FI.
   */
  private resolveChainId(chainKey: string): number {
    const chain = CHAINS[chainKey];
    if (!chain) throw new SwapError(`Unknown chain: ${chainKey}`, 'UNKNOWN_CHAIN');
    if (chain.kind !== 'evm' || chain.chainId === 0) {
      throw new SwapError(`${chain.name} is not supported for swaps/bridges yet.`, 'NON_EVM_CHAIN');
    }
    return chain.chainId;
  }

  /**
   * Resolve a token symbol or address to a LI.FI-compatible token address.
   * "native" or the chain's native currency symbol resolves to the canonical native address.
   */
  private resolveTokenAddress(token: string, chainKey: string): string {
    if (token === 'native' || token === '' || token === '0x0') {
      return NATIVE_TOKEN_ADDRESS;
    }
    const chain = CHAINS[chainKey];
    if (chain && token.toUpperCase() === chain.nativeCurrency.symbol.toUpperCase()) {
      return NATIVE_TOKEN_ADDRESS;
    }
    // If it looks like an address, return as-is
    if (token.startsWith('0x') && token.length === 42) {
      return token;
    }
    // For symbol-only lookups, let LI.FI resolve via the quote endpoint
    return token;
  }

  /**
   * Fetch a swap or same-chain DEX quote from LI.FI.
   * All bridge providers are unrestricted — the API returns the optimal route.
   */
  async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    // LI.FI expects an integer amount in the token's smallest unit.
    if (!/^\d+$/.test(params.fromAmount) || BigInt(params.fromAmount) === 0n) {
      throw new SwapError('Swap amount must be a positive integer in base units.', 'INVALID_AMOUNT');
    }
    if (!(params.slippage > 0 && params.slippage < 0.5)) {
      throw new SwapError('Slippage must be between 0% and 50%.', 'INVALID_SLIPPAGE');
    }
    const fromChainId = this.resolveChainId(params.fromChainKey);
    const toChainId = this.resolveChainId(params.toChainKey);
    const fromToken = this.resolveTokenAddress(params.fromToken, params.fromChainKey);
    const toToken = this.resolveTokenAddress(params.toToken, params.toChainKey);

    const queryParams = new URLSearchParams({
      fromChain: fromChainId.toString(),
      toChain: toChainId.toString(),
      fromToken,
      toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage.toString(),
      // Do not restrict bridge/DEX providers — expose all routes
      integrator: 'boltwallet',
    });

    const url = `${LIFI_API_BASE}/quote?${queryParams.toString()}`;
    
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(LIFI_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SwapError(`Network error fetching quote: ${errorMessage(err)}`, 'NETWORK_ERROR');
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      if (response.status === 404 || errorBody.includes('No available quotes')) {
        throw new RouteNotFoundError(params.fromChainKey, params.toChainKey);
      }
      if (response.status === 400 && errorBody.includes('insufficient')) {
        throw new InsufficientLiquidityError(params.fromToken, params.toToken);
      }
      throw new SwapError(
        `LI.FI API error (${response.status}): ${errorBody}`,
        'API_ERROR'
      );
    }

    const data = await response.json();
    return this.mapQuoteResponse(data);
  }

  /**
   * Fetch a dedicated bridge quote (cross-chain only).
   * Uses the same LI.FI quote endpoint but ensures fromChain !== toChain.
   */
  async getBridgeQuote(params: BridgeQuoteParams): Promise<SwapQuote> {
    const fromChainId = this.resolveChainId(params.fromChainKey);
    const toChainId = this.resolveChainId(params.toChainKey);

    if (fromChainId === toChainId) {
      throw new SwapError('Bridge requires different source and destination chains.', 'SAME_CHAIN_BRIDGE');
    }

    return this.getQuote({
      ...params,
    });
  }

  /**
   * Check if a token approval is required before executing a swap.
   * Returns the approval transaction data if needed, or null if not.
   */
  async checkApproval(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    amount: string,
    chainKey: string
  ): Promise<TransactionRequest | null> {
    const chainId = this.resolveChainId(chainKey);

    // Native token never needs approval
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) return null;

    const queryParams = new URLSearchParams({
      chain: chainId.toString(),
      token: tokenAddress,
      owner: ownerAddress,
      spender: spenderAddress,
      amount,
    });

    const url = `${LIFI_API_BASE}/approval?${queryParams.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(LIFI_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      // If allowance is sufficient, no approval needed
      if (data.approved) return null;

      // Return the approval transaction
      return {
        to: data.transactionRequest?.to || tokenAddress,
        data: data.transactionRequest?.data || '',
        value: '0',
        gasLimit: data.transactionRequest?.gasLimit || '60000',
        chainId,
      };
    } catch (err) {
      // Never report "no approval needed" when we could not actually check.
      throw new SwapError(`Could not verify token allowance: ${errorMessage(err)}`, 'APPROVAL_CHECK_FAILED');
    }
  }

  /**
   * Fetch supported tokens for a given chain.
   */
  async getSupportedTokens(chainKey: string): Promise<TokenInfo[]> {
    const chainId = this.resolveChainId(chainKey);
    const url = `${LIFI_API_BASE}/tokens?chains=${chainId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(LIFI_TIMEOUT_MS),
      });

      if (!response.ok) return [];
      const data = await response.json();
      const tokens: LifiToken[] = data.tokens?.[chainId.toString()] || [];

      return tokens.map(t => toTokenInfo(t));
    } catch {
      return [];
    }
  }

  // ── Internal Mapping ─────────────────────────────────────────

  private mapQuoteResponse(data: LifiStep): SwapQuote {
    const action = data.action || {};
    const estimate = data.estimate || {};
    const transactionRequest = data.transactionRequest || {};

    const fromToken: TokenInfo = {
      address: action.fromToken?.address || '',
      symbol: action.fromToken?.symbol || '',
      decimals: action.fromToken?.decimals || 18,
      chainId: action.fromChainId || 0,
      name: action.fromToken?.name || '',
      logoURI: action.fromToken?.logoURI,
      priceUSD: action.fromToken?.priceUSD,
    };

    const toToken: TokenInfo = {
      address: action.toToken?.address || '',
      symbol: action.toToken?.symbol || '',
      decimals: action.toToken?.decimals || 18,
      chainId: action.toChainId || 0,
      name: action.toToken?.name || '',
      logoURI: action.toToken?.logoURI,
      priceUSD: action.toToken?.priceUSD,
    };

    const fromAmount = estimate.fromAmount || action.fromAmount || '0';
    const toAmount = estimate.toAmount || '0';
    const toAmountMin = estimate.toAmountMin || toAmount;

    // Calculate rate
    const fromAmountNum = parseFloat(fromAmount) / Math.pow(10, fromToken.decimals);
    const toAmountNum = parseFloat(toAmount) / Math.pow(10, toToken.decimals);
    const rate = fromAmountNum > 0 ? (toAmountNum / fromAmountNum).toFixed(6) : '0';

    // Aggregate fee and gas costs
    const feeCosts = (estimate.feeCosts || []).map(toFeeCost);
    const gasCosts = (estimate.gasCosts || []).map(toGasCost);

    const estimatedGasUSD = gasCosts.reduce(
      (sum, g) => sum + parseFloat(g.amountUSD || '0'), 0
    ).toFixed(2);

    // Map route steps
    const steps: RouteStep[] = (data.includedSteps || [data]).map((step: LifiStep) => ({
      id: step.id || data.id || '',
      type: step.type || 'swap',
      tool: step.tool || data.tool || '',
      toolDetails: {
        name: step.toolDetails?.name || step.tool || '',
        logoURI: step.toolDetails?.logoURI,
      },
      action: {
        fromChainId: step.action?.fromChainId || action.fromChainId || 0,
        toChainId: step.action?.toChainId || action.toChainId || 0,
        fromToken: toTokenInfo(step.action?.fromToken, fromToken),
        toToken: toTokenInfo(step.action?.toToken, toToken),
        fromAmount: step.action?.fromAmount || fromAmount,
        slippage: step.action?.slippage || action.slippage || 0.005,
      },
      estimate: {
        fromAmount: step.estimate?.fromAmount || fromAmount,
        toAmount: step.estimate?.toAmount || toAmount,
        toAmountMin: step.estimate?.toAmountMin || toAmountMin,
        approvalAddress: step.estimate?.approvalAddress,
        feeCosts: (step.estimate?.feeCosts || []).map(toFeeCost),
        gasCosts: (step.estimate?.gasCosts || []).map(toGasCost),
        executionDuration: step.estimate?.executionDuration || 0,
      },
      transactionRequest: step.transactionRequest ? {
        to: step.transactionRequest.to || '',
        data: step.transactionRequest.data || '',
        value: step.transactionRequest.value || '0',
        gasLimit: step.transactionRequest.gasLimit || step.transactionRequest.gas || '0',
        gasPrice: step.transactionRequest.gasPrice,
        chainId: step.transactionRequest.chainId || 0,
      } : undefined,
    }));

    // Determine if approval is required
    const approvalAddress = estimate.approvalAddress || steps[0]?.estimate?.approvalAddress;
    const approvalRequired = !!approvalAddress && fromToken.address !== NATIVE_TOKEN_ADDRESS;

    return {
      id: data.id || `quote-${Date.now()}`,
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      toAmountMin,
      rate,
      estimatedGasUSD,
      feeCosts,
      gasCosts,
      steps,
      transactionRequest: {
        to: transactionRequest.to || '',
        data: transactionRequest.data || '',
        value: transactionRequest.value || '0',
        gasLimit: transactionRequest.gasLimit || transactionRequest.gas || '300000',
        gasPrice: transactionRequest.gasPrice,
        chainId: transactionRequest.chainId || 0,
      },
      tool: data.tool || steps[0]?.tool || 'unknown',
      approvalRequired,
      approvalAddress,
      executionDurationSeconds: estimate.executionDuration || 0,
    };
  }
}
