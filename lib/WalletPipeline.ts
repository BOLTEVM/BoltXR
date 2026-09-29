import { ethers } from 'ethers';

/** Minimal EIP-1193 provider (e.g. window.ethereum). */
export interface Eip1193Provider {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface HandtrackingTxReceipt {
    transactionHash: string;
    blockNumber: number;
    status: 'success' | 'reverted';
}

export interface HandtrackingTxRequest {
    to: string;
    from?: string;
    data?: string;
    value?: bigint | string;
    gasLimit?: bigint | string;
    chainId?: number;
    rpcUrl?: string;
    provider?: Eip1193Provider;
    confirmations?: number;
    timeoutMs?: number;
    gestureType?: 'PINCH' | 'GRAB' | 'SWIPE' | 'POINT';
}

export interface HandtrackingTxResult {
    success: boolean;
    txHash?: string;
    receipt?: HandtrackingTxReceipt;
    violations?: unknown[];
    error?: string;
}

/** An external pipeline (e.g. The Guards) that can take over execution. */
export interface HandtrackingPipelineDelegate {
    executeAndAwaitTransaction(req: HandtrackingTxRequest): Promise<HandtrackingTxResult>;
}

const errorText = (e: unknown, fallback: string) =>
    (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string')
        ? (e as { message: string }).message
        : fallback;

/**
 * Handtracking Wallet Interaction Pipeline
 * Native Web3 transaction execution pipeline for Handtracking Wallet dApp stack.
 * Operates 100% standalone if 'theguards' package is not installed.
 */
export class HandtrackingWalletPipeline {
    private static delegate: HandtrackingPipelineDelegate | null = null;

    /**
     * Register an external pipeline (e.g. The Guards) to handle execution.
     * Replaces a runtime require('../../theguards') that bundlers cannot resolve.
     */
    public static registerDelegate(delegate: HandtrackingPipelineDelegate | null) {
        this.delegate = delegate;
    }

    public static async executeAndAwaitTransaction(
        req: HandtrackingTxRequest
    ): Promise<HandtrackingTxResult> {
        console.log(`[HandtrackingWalletPipeline] Executing transaction via gesture [${req.gestureType || 'DIRECT'}] to ${req.to}...`);

        if (this.delegate) {
            return this.delegate.executeAndAwaitTransaction(req);
        }

        return this.standaloneExecuteAndAwait(req);
    }

    private static async standaloneExecuteAndAwait(req: HandtrackingTxRequest): Promise<HandtrackingTxResult> {
        if (!req.to || !ethers.isAddress(req.to)) {
            return { success: false, error: `Invalid recipient address: "${req.to}"` };
        }

        const rpcUrl = req.rpcUrl || 'http://127.0.0.1:8545';
        const timeoutMs = req.timeoutMs || 60_000;
        const provider = req.provider
            || (typeof window !== 'undefined' ? (window as unknown as { ethereum?: Eip1193Provider }).ethereum : undefined);

        if (provider && typeof provider.request === 'function') {
            if (req.chainId) {
                await this.ensureChain(provider, req.chainId, rpcUrl);
            }

            try {
                let fromAddress = req.from;
                if (!fromAddress) {
                    const accounts = await provider.request({ method: 'eth_accounts' }) as string[] | undefined;
                    fromAddress = accounts && accounts.length > 0 ? accounts[0] : undefined;
                }

                const txParams: Record<string, string | undefined> = {
                    to: req.to,
                    from: fromAddress,
                    data: req.data || '0x',
                    value: req.value ? '0x' + BigInt(req.value).toString(16) : '0x0'
                };
                if (req.gasLimit) txParams.gas = '0x' + BigInt(req.gasLimit).toString(16);

                const txHash = await provider.request({ method: 'eth_sendTransaction', params: [txParams] }) as string;
                return this.waitForReceipt(txHash, rpcUrl, timeoutMs);
            } catch (err) {
                return { success: false, error: errorText(err, 'Transaction submission failed.') };
            }
        }

        // Previously this polled a local node for the zero hash and reported a
        // misleading timeout; say what is actually wrong.
        return { success: false, error: 'No wallet provider available to submit the transaction.' };
    }

    public static async ensureChain(provider: Eip1193Provider, chainId: number, rpcUrl: string): Promise<{ success: boolean; error?: string }> {
        const hexChainId = '0x' + chainId.toString(16);
        try {
            await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
            return { success: true };
        } catch (switchError) {
            const code = (switchError as { code?: number })?.code;
            if (code === 4902 || errorText(switchError, '').includes('Unrecognized chain')) {
                try {
                    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hexChainId, chainName: `Chain ${chainId}`, rpcUrls: [rpcUrl] }] });
                    return { success: true };
                } catch (addError) {
                    return { success: false, error: errorText(addError, 'Could not add chain') };
                }
            }
            return { success: false, error: errorText(switchError, 'Could not switch chain') };
        }
    }

    public static async waitForReceipt(txHash: string, rpcUrl: string, timeoutMs: number = 60_000): Promise<HandtrackingTxResult> {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const res = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'eth_getTransactionReceipt', params: [txHash] })
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json.result && json.result.blockNumber) {
                        const isSuccess = json.result.status === '0x1' || json.result.status === 1 || json.result.status === '1';
                        return {
                            success: isSuccess,
                            txHash,
                            receipt: {
                                transactionHash: json.result.transactionHash || txHash,
                                blockNumber: parseInt(json.result.blockNumber, 16),
                                status: isSuccess ? 'success' : 'reverted'
                            },
                            error: isSuccess ? undefined : 'Transaction reverted on-chain.'
                        };
                    }
                }
            } catch { /* RPC not reachable yet — keep polling */ }
            await new Promise(r => setTimeout(r, 1000));
        }
        return { success: false, txHash, error: `Receipt confirmation timed out after ${timeoutMs / 1000}s.` };
    }
}
