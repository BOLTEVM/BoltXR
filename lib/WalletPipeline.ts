export interface HandtrackingTxRequest {
    to: string;
    from?: string;
    data?: string;
    value?: bigint | string;
    gasLimit?: bigint | string;
    chainId?: number;
    rpcUrl?: string;
    provider?: any;
    confirmations?: number;
    timeoutMs?: number;
    gestureType?: 'PINCH' | 'GRAB' | 'SWIPE' | 'POINT';
}

export interface HandtrackingTxResult {
    success: boolean;
    txHash?: string;
    receipt?: any;
    violations?: any[];
    error?: string;
}

/**
 * Handtracking Wallet Interaction Pipeline
 * Native Web3 transaction execution pipeline for Handtracking Wallet dApp stack.
 * Operates 100% standalone if 'theguards' package is not installed.
 */
export class HandtrackingWalletPipeline {
    public static async executeAndAwaitTransaction(
        req: HandtrackingTxRequest
    ): Promise<HandtrackingTxResult> {
        console.log(`[HandtrackingWalletPipeline] Executing transaction via gesture [${req.gestureType || 'DIRECT'}] to ${req.to}...`);

        // Try delegating to The Guards if present
        try {
            const guards = require('../../theguards');
            if (guards && guards.TheGuardsWalletPipeline) {
                return guards.TheGuardsWalletPipeline.executeAndAwaitTransaction(req);
            }
        } catch {
            // Standalone mode: theguards not installed
        }

        return this.standaloneExecuteAndAwait(req);
    }

    private static async standaloneExecuteAndAwait(req: HandtrackingTxRequest): Promise<HandtrackingTxResult> {
        if (!req.to || !req.to.startsWith('0x') || req.to.length !== 42) {
            return { success: false, error: `Invalid recipient address: "${req.to}"` };
        }

        const rpcUrl = req.rpcUrl || 'http://127.0.0.1:8545';
        const timeoutMs = req.timeoutMs || 60_000;
        const provider = req.provider || (typeof window !== 'undefined' ? (window as any).ethereum : undefined);

        if (provider && typeof provider.request === 'function') {
            if (req.chainId) {
                await this.ensureChain(provider, req.chainId, rpcUrl);
            }

            try {
                let fromAddress = req.from;
                if (!fromAddress) {
                    const accounts = await provider.request({ method: 'eth_accounts' });
                    fromAddress = accounts && accounts.length > 0 ? accounts[0] : undefined;
                }

                const txParams: any = {
                    to: req.to,
                    from: fromAddress,
                    data: req.data || '0x',
                    value: req.value ? '0x' + BigInt(req.value).toString(16) : '0x0'
                };
                if (req.gasLimit) txParams.gas = '0x' + BigInt(req.gasLimit).toString(16);

                const txHash = await provider.request({ method: 'eth_sendTransaction', params: [txParams] });
                return this.waitForReceipt(txHash, rpcUrl, timeoutMs);
            } catch (err: any) {
                return { success: false, error: err.message || 'Transaction submission failed.' };
            }
        }

        return this.waitForReceipt('0x0000000000000000000000000000000000000000000000000000000000000000', rpcUrl, 500);
    }

    public static async ensureChain(provider: any, chainId: number, rpcUrl: string): Promise<{ success: boolean; error?: string }> {
        const hexChainId = '0x' + chainId.toString(16);
        try {
            await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
            return { success: true };
        } catch (switchError: any) {
            if (switchError.code === 4902 || switchError.message?.includes('Unrecognized chain')) {
                try {
                    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hexChainId, chainName: `Chain ${chainId}`, rpcUrls: [rpcUrl] }] });
                    return { success: true };
                } catch (addError: any) {
                    return { success: false, error: addError.message };
                }
            }
            return { success: false, error: switchError.message };
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
            } catch {}
            await new Promise(r => setTimeout(r, 1000));
        }
        return { success: false, txHash, error: `Receipt confirmation timed out after ${timeoutMs / 1000}s.` };
    }
}
