'use client';

/**
 * ContractManager — 2D panel for managing imported smart contracts.
 * Lists contracts, supports manual import, auto-fetch by address, QR import,
 * and an interactive method inspector for read/write calls.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ethers } from 'ethers';
import { FileCode2, Search, Plus, Trash2, QrCode, ChevronDown, ChevronUp, Play, Send, ChevronLeft, ScanLine, Lock } from 'lucide-react';
import Dialog from './ui/Dialog';
import { useContracts, ContractMethod } from '@/hooks/useContracts';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS } from '@/lib/boltows/chains';
import { parseAbiArg, formatAbiResult } from '@/lib/abi-args';
import { errorMessage, truncateAddress } from '@/lib/format';
import type { ContractData } from '@/lib/boltows/ows-core';

interface ContractManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQRScanner?: () => void;
  /** A scanned boltxr:// payload to import as soon as the manager opens. */
  pendingPayload?: string | null;
  onPendingHandled?: () => void;
  onRequestUnlock?: () => void;
}

const EVM_CHAINS = Object.keys(CHAINS).filter(key => CHAINS[key].kind === 'evm');

const methodKey = (m: ContractMethod, i: number) => `${m.name}#${i}`;

const ContractManager: React.FC<ContractManagerProps> = ({
  isOpen, onClose, onOpenQRScanner, pendingPayload, onPendingHandled, onRequestUnlock,
}) => {
  const wallet = useWallet();
  const unlocked = wallet.status === 'unlocked';
  const [chainId, setChainId] = useState('ethereum');
  const {
    contracts, selectedContract, setSelectedContract, methods,
    loading, error, clearError, importStatus,
    importManual, importByAddress, importFromQR, removeContract, exportQR, callRead, callWrite,
  } = useContracts(chainId, unlocked);

  const [view, setView] = useState<'list' | 'import' | 'inspect'>('list');
  const [fetchAddr, setFetchAddr] = useState('');
  const [importAddr, setImportAddr] = useState('');
  const [importName, setImportName] = useState('');
  const [importAbi, setImportAbi] = useState('');
  const [importDec, setImportDec] = useState('18');
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
  const [methodArgs, setMethodArgs] = useState<Record<string, string[]>>({});
  const [methodValue, setMethodValue] = useState<Record<string, string>>({});
  const [methodResults, setMethodResults] = useState<Record<string, { text: string; error?: boolean }>>({});
  const [pendingWrite, setPendingWrite] = useState<string | null>(null);
  const [busyMethod, setBusyMethod] = useState<string | null>(null);
  const [qrExport, setQrExport] = useState<{ uri: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Import a scanned contract once the vault is available.
  useEffect(() => {
    if (!isOpen || !pendingPayload || !unlocked) return;
    importFromQR(pendingPayload).finally(() => onPendingHandled?.());
  }, [isOpen, pendingPayload, unlocked, importFromQR, onPendingHandled]);

  const handleAutoFetch = useCallback(async () => {
    if (!ethers.isAddress(fetchAddr.trim())) return;
    await importByAddress(fetchAddr);
    setFetchAddr('');
    setView('list');
  }, [fetchAddr, importByAddress]);

  const handleManualImport = useCallback(async () => {
    if (!importAddr || !importName || !importAbi) return;
    await importManual(importName, importAddr, importAbi, parseInt(importDec, 10));
    setImportAddr(''); setImportName(''); setImportAbi(''); setImportDec('18');
    setView('list');
  }, [importAddr, importName, importAbi, importDec, importManual]);

  const handleSelectContract = useCallback((c: ContractData) => {
    setSelectedContract(c);
    setView('inspect');
    setExpandedMethod(null);
    setMethodResults({});
    setPendingWrite(null);
  }, [setSelectedContract]);

  const handleExportQR = useCallback(async (c: ContractData) => {
    const result = await exportQR(c.address);
    if (result) setQrExport({ uri: result.dataUri, name: c.name });
  }, [exportQR]);

  const handleCall = useCallback(async (method: ContractMethod, key: string) => {
    setBusyMethod(key);
    try {
      const args = method.inputs.map((input, i) =>
        parseAbiArg(input.type, methodArgs[key]?.[i] ?? '', input.name || `arg${i}`));
      if (method.type === 'read') {
        const result = await callRead(method.name, args);
        setMethodResults(prev => ({ ...prev, [key]: { text: formatAbiResult(result) } }));
      } else {
        if (!wallet.walletId) throw new Error('Unlock your vault to sign transactions');
        const valueText = methodValue[key]?.trim();
        const value = valueText ? ethers.parseEther(valueText).toString() : undefined;
        const txHash = await callWrite(wallet.walletId, method.name, args, value);
        setMethodResults(prev => ({ ...prev, [key]: { text: `Submitted: ${txHash}` } }));
        setPendingWrite(null);
      }
    } catch (e) {
      setMethodResults(prev => ({ ...prev, [key]: { text: errorMessage(e), error: true } }));
    } finally {
      setBusyMethod(null);
    }
  }, [methodArgs, methodValue, callRead, callWrite, wallet.walletId]);

  const updateArg = (key: string, idx: number, val: string) => {
    setMethodArgs(prev => {
      const updated = [...(prev[key] || [])];
      updated[idx] = val;
      return { ...prev, [key]: updated };
    });
  };

  const title = view === 'inspect' && selectedContract ? selectedContract.name : 'Contracts';

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={<FileCode2 className="text-emerald-400 h-5 w-5" />}
      title={title}
      footer={`${CHAINS[chainId]?.name} · Sourcify · Etherscan`}
      toolbar={(importStatus || error) ? (
        <div className={`px-5 py-2 text-[10px] font-extrabold tracking-[0.15em] border-b ${error
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`} role={error ? 'alert' : 'status'}>
          {error ? (
            <span className="flex items-center justify-between gap-3">
              <span className="normal-case tracking-normal font-semibold text-xs">{error}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearError}>Dismiss</button>
            </span>
          ) : importStatus}
        </div>
      ) : undefined}
    >
      {!unlocked ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <Lock className="text-slate-500" />
          <p className="text-sm text-slate-400 max-w-xs">Contracts are stored in your encrypted vault. Unlock it to manage and call them.</p>
          {onRequestUnlock && <button type="button" className="btn btn-primary" onClick={onRequestUnlock}>Unlock vault</button>}
        </div>
      ) : view === 'list' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className="input !w-auto !min-h-[32px] !py-1 text-[11px]" value={chainId} onChange={e => setChainId(e.target.value)} aria-label="Network">
              {EVM_CHAINS.map(key => <option key={key} value={key}>{CHAINS[key].name}</option>)}
            </select>
            <div className="flex-1" />
            <button type="button" className="btn btn-sm" onClick={() => setView('import')}><Plus size={12} /> Import</button>
            {onOpenQRScanner && <button type="button" className="btn btn-sm" onClick={onOpenQRScanner}><ScanLine size={12} /> Scan QR</button>}
          </div>

          {contracts.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-10 leading-relaxed">
              No contracts on {CHAINS[chainId]?.name} yet.<br />Import one by address, ABI, or QR code.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {contracts.map(c => (
                <li key={c.address} className="card flex items-center gap-3 px-4 py-3 hover:border-emerald-500/30 transition-colors">
                  <button type="button" className="flex-1 text-left min-w-0" onClick={() => handleSelectContract(c)}>
                    <div className="text-sm font-bold truncate">{c.name}</div>
                    <div className="mono text-[10px] text-slate-500 mt-0.5">{truncateAddress(c.address, 8, 6)}</div>
                  </button>
                  <button type="button" className="icon-btn" onClick={() => handleExportQR(c)} aria-label={`Share ${c.name} as QR`}><QrCode size={14} /></button>
                  {confirmDelete === c.address ? (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => { removeContract(c.address); setConfirmDelete(null); }}>Confirm</button>
                  ) : (
                    <button type="button" className="icon-btn hover:!text-red-400" onClick={() => setConfirmDelete(c.address)} aria-label={`Remove ${c.name}`}><Trash2 size={14} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {qrExport && (
            <div className="card flex flex-col items-center gap-3 p-4">
              <div className="text-xs font-bold">{qrExport.name}</div>
              <div className="rounded-xl bg-white p-2">
                <Image src={qrExport.uri} alt={`QR code for ${qrExport.name}`} width={200} height={200} unoptimized className="[image-rendering:pixelated]" />
              </div>
              <p className="text-[11px] text-slate-500 text-center">Scan with another Bolt XR wallet to import this contract.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQrExport(null)}>Dismiss</button>
            </div>
          )}
        </div>
      ) : view === 'import' ? (
        <div className="flex flex-col gap-4">
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setView('list')}><ChevronLeft size={14} /> Back</button>
          <div>
            <label htmlFor="cm-fetch" className="field-label">Auto-fetch verified ABI</label>
            <div className="flex gap-2">
              <input id="cm-fetch" className="input" placeholder="0x contract address" value={fetchAddr} onChange={e => setFetchAddr(e.target.value)} spellCheck={false} data-autofocus />
              <button type="button" className="btn" onClick={handleAutoFetch} disabled={loading || !ethers.isAddress(fetchAddr.trim())}>
                <Search size={14} /> {loading ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] text-slate-600">
            <span className="h-px flex-1 bg-white/10" /> OR ENTER MANUALLY <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
            <label><span className="field-label">Name</span><input className="input" value={importName} onChange={e => setImportName(e.target.value)} /></label>
            <label><span className="field-label">Decimals</span><input className="input" inputMode="numeric" value={importDec} onChange={e => setImportDec(e.target.value.replace(/\D/g, ''))} /></label>
          </div>
          <label><span className="field-label">Address</span><input className="input" placeholder="0x…" value={importAddr} onChange={e => setImportAddr(e.target.value)} spellCheck={false} aria-invalid={importAddr !== '' && !ethers.isAddress(importAddr.trim())} /></label>
          <label><span className="field-label">ABI (JSON array)</span><textarea className="input" rows={5} placeholder='[{"type":"function", …}]' value={importAbi} onChange={e => setImportAbi(e.target.value)} spellCheck={false} /></label>
          <button type="button" className="btn btn-primary self-end" onClick={handleManualImport} disabled={loading || !importName || !ethers.isAddress(importAddr.trim()) || !importAbi}>
            Import contract
          </button>
        </div>
      ) : selectedContract ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => { setView('list'); setSelectedContract(null); }}><ChevronLeft size={14} /> Back</button>
          <div className="card px-4 py-3 mono text-[11px] text-slate-400 break-all">{selectedContract.address}</div>
          {methods.length === 0 && <div className="text-center text-slate-500 text-sm py-8">No callable functions in this ABI.</div>}
          <ul className="flex flex-col gap-2">
            {methods.map((m, i) => {
              const key = methodKey(m, i);
              const expanded = expandedMethod === key;
              const result = methodResults[key];
              const payable = m.stateMutability === 'payable';
              return (
                <li key={key} className="card overflow-hidden">
                  <button type="button" className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors" onClick={() => setExpandedMethod(expanded ? null : key)} aria-expanded={expanded}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`pill ${m.type === 'read' ? 'pill-info' : 'pill-warning'}`}>{m.type === 'read' ? 'View' : payable ? 'Payable' : 'Write'}</span>
                      <span className="mono text-xs font-bold truncate">{m.name}({m.inputs.map(inp => inp.type).join(', ')})</span>
                    </span>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {expanded && (
                    <div className="border-t border-white/5 p-3 flex flex-col gap-2">
                      {m.inputs.map((inp, j) => (
                        <input
                          key={j}
                          className="input !min-h-[36px] !text-[11px]"
                          placeholder={`${inp.name || `arg${j}`} (${inp.type})`}
                          value={methodArgs[key]?.[j] || ''}
                          onChange={e => updateArg(key, j, e.target.value)}
                          spellCheck={false}
                        />
                      ))}
                      {payable && (
                        <input className="input !min-h-[36px] !text-[11px]" inputMode="decimal" placeholder={`Value (${CHAINS[chainId]?.nativeCurrency.symbol})`} value={methodValue[key] || ''} onChange={e => setMethodValue(prev => ({ ...prev, [key]: e.target.value }))} />
                      )}
                      {m.type === 'write' && pendingWrite === key ? (
                        <div className="notice notice-warning flex-col">
                          <span>This signs and broadcasts a transaction from {truncateAddress(wallet.account)} on {CHAINS[chainId]?.name}.</span>
                          <span className="flex gap-2">
                            <button type="button" className="btn btn-sm" onClick={() => setPendingWrite(null)}>Cancel</button>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => handleCall(m, key)} disabled={busyMethod === key}>
                              {busyMethod === key ? 'Signing…' : 'Confirm & sign'}
                            </button>
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn-sm self-start ${m.type === 'write' ? 'btn-primary' : ''}`}
                          disabled={busyMethod === key}
                          onClick={() => (m.type === 'read' ? handleCall(m, key) : setPendingWrite(key))}
                        >
                          {m.type === 'read' ? <><Play size={12} /> {busyMethod === key ? 'Calling…' : 'Call'}</> : <><Send size={12} /> Sign &amp; send</>}
                        </button>
                      )}
                      {result && (
                        <div className={`mono text-[11px] px-3 py-2 rounded-lg bg-black/30 break-all ${result.error ? 'text-red-400' : 'text-emerald-400'}`}>
                          {result.text}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
};

export default ContractManager;
