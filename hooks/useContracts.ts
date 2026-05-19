'use client';

/**
 * useContracts — React hook for contract CRUD, interaction, and QR operations.
 *
 * Wraps BoltwalletCore's contract methods with React state management.
 * Supports listing, importing (manual + QR + auto-fetch), deleting,
 * and calling read/write contract methods.
 */

import { useState, useEffect, useCallback } from 'react';
import { BoltwalletCore, ContractData } from '@/lib/boltows/ows-core';
import { parseABIMethods } from '@/lib/abi-fetcher';

const core = new BoltwalletCore();

export interface ContractMethod {
  name: string;
  type: 'read' | 'write';
  stateMutability: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}

export function useContracts(chainId: string) {
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractData | null>(null);
  const [methods, setMethods] = useState<ContractMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Load contracts for the active chain
  const refreshContracts = useCallback(async () => {
    try {
      const list = await core.listContracts(chainId);
      setContracts(list);
    } catch (e: any) {
      console.error('Failed to load contracts:', e);
    }
  }, [chainId]);

  useEffect(() => {
    refreshContracts();
  }, [refreshContracts]);

  // Parse methods when a contract is selected
  useEffect(() => {
    if (selectedContract?.abi) {
      const parsed = parseABIMethods(selectedContract.abi);
      setMethods(parsed);
    } else {
      setMethods([]);
    }
  }, [selectedContract]);

  // Import a contract manually
  const importManual = useCallback(async (
    name: string,
    address: string,
    abi: string,
    decimals: number
  ) => {
    setLoading(true);
    setError(null);
    setImportStatus('IMPORTING...');
    try {
      await core.importContract(name, address, abi, decimals, chainId);
      await refreshContracts();
      setImportStatus('IMPORTED SUCCESSFULLY');
      setTimeout(() => setImportStatus(null), 3000);
    } catch (e: any) {
      setError(e.message);
      setImportStatus(null);
    } finally {
      setLoading(false);
    }
  }, [chainId, refreshContracts]);

  // Import via auto-fetch (by address only)
  const importByAddress = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    setImportStatus('FETCHING ABI...');
    try {
      const result = await core.fetchContractABI(address, chainId);
      if ('abi' in result) {
        setImportStatus('ABI FOUND — IMPORTING...');
        // Detect decimals for ERC-20 tokens
        let decimals = 18;
        try {
          const methods = parseABIMethods(result.abi);
          const hasDecimals = methods.find(m => m.name === 'decimals');
          if (hasDecimals) {
            const decResult = await core.callContractRead(address, result.abi, 'decimals', [], chainId);
            decimals = Number(decResult);
          }
        } catch {
          // Default to 18 if decimals call fails
        }

        await core.importContract(result.name, address, result.abi, decimals, chainId);
        await refreshContracts();
        setImportStatus(`IMPORTED: ${result.name}`);
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setError(result.message);
        setImportStatus(null);
      }
    } catch (e: any) {
      setError(e.message);
      setImportStatus(null);
    } finally {
      setLoading(false);
    }
  }, [chainId, refreshContracts]);

  // Import from QR scan payload
  const importFromQR = useCallback(async (rawPayload: string) => {
    setLoading(true);
    setError(null);
    setImportStatus('PARSING QR...');
    try {
      const contract = await core.importContractFromQR(rawPayload);
      if (contract) {
        await refreshContracts();
        setImportStatus(`IMPORTED: ${contract.name}`);
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setError('Failed to import contract from QR code');
        setImportStatus(null);
      }
    } catch (e: any) {
      setError(e.message);
      setImportStatus(null);
    } finally {
      setLoading(false);
    }
  }, [refreshContracts]);

  // Delete a contract
  const removeContract = useCallback(async (address: string) => {
    try {
      await core.deleteContract(address, chainId);
      if (selectedContract?.address === address) {
        setSelectedContract(null);
      }
      await refreshContracts();
    } catch (e: any) {
      setError(e.message);
    }
  }, [chainId, selectedContract, refreshContracts]);

  // Export a contract as QR
  const exportQR = useCallback(async (address: string) => {
    try {
      setImportStatus('GENERATING QR...');
      const result = await core.exportContractQR(address, chainId);
      setImportStatus(null);
      return result;
    } catch (e: any) {
      setError(e.message);
      setImportStatus(null);
      return null;
    }
  }, [chainId]);

  // Call a read method
  const callRead = useCallback(async (
    method: string,
    args: any[]
  ): Promise<any> => {
    if (!selectedContract) throw new Error('No contract selected');
    return core.callContractRead(
      selectedContract.address,
      selectedContract.abi,
      method,
      args,
      chainId
    );
  }, [selectedContract, chainId]);

  // Call a write method
  const callWrite = useCallback(async (
    walletId: string,
    method: string,
    args: any[],
    value?: string
  ): Promise<string> => {
    if (!selectedContract) throw new Error('No contract selected');
    return core.callContractWrite(
      walletId,
      selectedContract.address,
      selectedContract.abi,
      method,
      args,
      chainId,
      value
    );
  }, [selectedContract, chainId]);

  return {
    contracts,
    selectedContract,
    setSelectedContract,
    methods,
    loading,
    error,
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
