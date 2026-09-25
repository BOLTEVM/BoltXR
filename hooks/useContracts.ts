'use client';

/**
 * useContracts — React hook for contract CRUD, interaction, and QR operations.
 *
 * Wraps BoltwalletCore's contract methods with React state management.
 * Contracts live inside the encrypted vault, so the list is only available
 * while the vault is unlocked.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ContractData } from '@/lib/boltows/ows-core';
import { walletCore as core } from '@/lib/boltows/core-instance';
import { parseABIMethods } from '@/lib/abi-fetcher';
import { errorMessage } from '@/lib/format';

export interface ContractMethod {
  name: string;
  type: 'read' | 'write';
  stateMutability: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}

export function useContracts(chainId: string, enabled: boolean = true) {
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Load contracts for the active chain
  const refreshContracts = useCallback(async () => {
    try {
      setContracts(enabled ? await core.listContracts(chainId) : []);
    } catch (e) {
      console.error('Failed to load contracts:', e);
    }
  }, [chainId, enabled]);

  useEffect(() => {
    let cancelled = false;
    (enabled ? core.listContracts(chainId) : Promise.resolve([] as ContractData[]))
      .then(list => { if (!cancelled) setContracts(list); })
      .catch(e => console.error('Failed to load contracts:', e));
    return () => { cancelled = true; };
  }, [chainId, enabled]);

  const methods: ContractMethod[] = useMemo(
    () => (selectedContract?.abi ? parseABIMethods(selectedContract.abi) : []),
    [selectedContract]
  );

  const flash = useCallback((message: string) => {
    setImportStatus(message);
    setTimeout(() => setImportStatus(current => (current === message ? null : current)), 3000);
  }, []);

  const run = useCallback(async (status: string, task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    setImportStatus(status);
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
      setImportStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Import a contract manually
  const importManual = useCallback((name: string, address: string, abi: string, decimals: number) =>
    run('IMPORTING…', async () => {
      await core.importContract(name, address, abi, decimals, chainId);
      await refreshContracts();
      flash('IMPORTED SUCCESSFULLY');
    }), [chainId, refreshContracts, run, flash]);

  // Import via auto-fetch (by address only)
  const importByAddress = useCallback((address: string) =>
    run('FETCHING ABI…', async () => {
      const result = await core.fetchContractABI(address.trim(), chainId);
      if (!('abi' in result)) throw new Error(result.message);
      setImportStatus('ABI FOUND — IMPORTING…');
      let decimals = 18;
      if (parseABIMethods(result.abi).some(m => m.name === 'decimals' && m.inputs.length === 0)) {
        try {
          decimals = Number(await core.callContractRead(address.trim(), result.abi, 'decimals', [], chainId));
        } catch { /* default 18 */ }
      }
      await core.importContract(result.name, address, result.abi, decimals, chainId);
      await refreshContracts();
      flash(`IMPORTED: ${result.name}`);
    }), [chainId, refreshContracts, run, flash]);

  // Import from QR scan payload
  const importFromQR = useCallback((rawPayload: string) =>
    run('IMPORTING FROM QR…', async () => {
      const contract = await core.importContractFromQR(rawPayload);
      if (!contract) throw new Error('Could not import this contract — its ABI was not embedded and is not verified on-chain.');
      await refreshContracts();
      flash(`IMPORTED: ${contract.name}`);
    }), [refreshContracts, run, flash]);

  // Delete a contract
  const removeContract = useCallback(async (address: string) => {
    try {
      await core.deleteContract(address, chainId);
      setSelectedContract(current => (current?.address === address ? null : current));
      await refreshContracts();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [chainId, refreshContracts]);

  // Export a contract as QR
  const exportQR = useCallback(async (address: string) => {
    try {
      return await core.exportContractQR(address, chainId);
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }, [chainId]);

  // Call a read method
  const callRead = useCallback(async (method: string, args: unknown[]): Promise<unknown> => {
    if (!selectedContract) throw new Error('No contract selected');
    return core.callContractRead(selectedContract.address, selectedContract.abi, method, args, chainId);
  }, [selectedContract, chainId]);

  // Call a write method (value in wei)
  const callWrite = useCallback(async (walletId: string, method: string, args: unknown[], value?: string): Promise<string> => {
    if (!selectedContract) throw new Error('No contract selected');
    return core.callContractWrite(walletId, selectedContract.address, selectedContract.abi, method, args, chainId, value);
  }, [selectedContract, chainId]);

  return {
    contracts,
    selectedContract,
    setSelectedContract,
    methods,
    loading,
    error,
    clearError: () => setError(null),
    importStatus,
    importManual,
    importByAddress,
    importFromQR,
    removeContract,
    exportQR,
    callRead,
    callWrite,
    refreshContracts,
  };
}
