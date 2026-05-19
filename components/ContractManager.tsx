'use client';

/**
 * ContractManager — 2D drawer-style panel for managing imported smart contracts.
 * Lists contracts, supports manual import, auto-fetch by address, QR import,
 * and an interactive method inspector for read/write calls.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileCode2, Search, Plus, Trash2, Download, ChevronDown, ChevronUp, Play, Send } from 'lucide-react';
import { useContracts, ContractMethod } from '@/hooks/useContracts';

interface ContractManagerProps {
  chainId: string;
  walletId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenQRScanner?: () => void;
}

const ContractManager: React.FC<ContractManagerProps> = ({
  chainId, walletId, isOpen, onClose, onOpenQRScanner,
}) => {
  const {
    contracts, selectedContract, setSelectedContract, methods,
    loading, error, importStatus,
    importManual, importByAddress, removeContract, exportQR, callRead, callWrite,
  } = useContracts(chainId);

  const [view, setView] = useState<'list' | 'import' | 'inspect'>('list');
  const [importAddr, setImportAddr] = useState('');
  const [importName, setImportName] = useState('');
  const [importAbi, setImportAbi] = useState('');
  const [importDec, setImportDec] = useState('18');
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);
  const [methodArgs, setMethodArgs] = useState<Record<string, string[]>>({});
  const [methodResults, setMethodResults] = useState<Record<string, string>>({});
  const [qrExportUri, setQrExportUri] = useState<string | null>(null);

  const handleAutoFetch = useCallback(async () => {
    if (!importAddr) return;
    await importByAddress(importAddr);
    setImportAddr('');
    setView('list');
  }, [importAddr, importByAddress]);

  const handleManualImport = useCallback(async () => {
    if (!importAddr || !importName || !importAbi) return;
    await importManual(importName, importAddr, importAbi, parseInt(importDec));
    setImportAddr(''); setImportName(''); setImportAbi(''); setImportDec('18');
    setView('list');
  }, [importAddr, importName, importAbi, importDec, importManual]);

  const handleSelectContract = useCallback((c: any) => {
    setSelectedContract(c);
    setView('inspect');
    setExpandedMethod(null);
    setMethodResults({});
  }, [setSelectedContract]);

  const handleExportQR = useCallback(async (addr: string) => {
    const result = await exportQR(addr);
    if (result) setQrExportUri(result.dataUri);
  }, [exportQR]);

  const handleCallRead = useCallback(async (method: ContractMethod) => {
    try {
      const args = (methodArgs[method.name] || []).map((a, i) => {
        if (method.inputs[i]?.type.includes('uint') || method.inputs[i]?.type.includes('int')) return BigInt(a);
        if (method.inputs[i]?.type === 'bool') return a === 'true';
        return a;
      });
      const result = await callRead(method.name, args);
      setMethodResults(prev => ({ ...prev, [method.name]: String(result) }));
    } catch (e: any) {
      setMethodResults(prev => ({ ...prev, [method.name]: `ERROR: ${e.message}` }));
    }
  }, [methodArgs, callRead]);

  const handleCallWrite = useCallback(async (method: ContractMethod) => {
    if (!walletId) return;
    try {
      const args = (methodArgs[method.name] || []).map((a, i) => {
        if (method.inputs[i]?.type.includes('uint') || method.inputs[i]?.type.includes('int')) return BigInt(a);
        if (method.inputs[i]?.type === 'bool') return a === 'true';
        return a;
      });
      const txHash = await callWrite(walletId, method.name, args);
      setMethodResults(prev => ({ ...prev, [method.name]: `TX: ${txHash}` }));
    } catch (e: any) {
      setMethodResults(prev => ({ ...prev, [method.name]: `ERROR: ${e.message}` }));
    }
  }, [methodArgs, walletId, callWrite]);

  const updateArg = (methodName: string, idx: number, val: string) => {
    setMethodArgs(prev => {
      const current = prev[methodName] || [];
      const updated = [...current];
      updated[idx] = val;
      return { ...prev, [methodName]: updated };
    });
  };

  const truncAddr = (a: string) => `${a.substring(0, 8)}...${a.substring(a.length - 6)}`;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div className="cm-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="cm-card" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}>
          <div className="cm-header">
            <div className="flex items-center gap-3">
              <FileCode2 className="text-emerald-400 h-5 w-5" />
              <span className="text-xl font-bold tracking-tight">CONTRACTS</span>
            </div>
            <button onClick={onClose} className="cm-close"><X size={20} /></button>
          </div>

          {/* Status bar */}
          {(importStatus || error) && (
            <div className={`cm-status ${error ? 'error' : ''}`}>
              {error || importStatus}
            </div>
          )}

          <div className="cm-body">
            {/* LIST VIEW */}
            {view === 'list' && (
              <>
                <div className="cm-actions">
                  <button className="cm-action-btn" onClick={() => setView('import')}><Plus size={12} /> IMPORT</button>
                  {onOpenQRScanner && <button className="cm-action-btn" onClick={onOpenQRScanner}><Search size={12} /> SCAN QR</button>}
                </div>
                {contracts.length === 0 ? (
                  <div className="cm-empty">No contracts imported for this chain.<br />Use IMPORT or SCAN QR to add one.</div>
                ) : (
                  <div className="cm-list">
                    {contracts.map((c: any, i: number) => (
                      <div key={i} className="cm-item" onClick={() => handleSelectContract(c)}>
                        <div className="cm-item-info">
                          <div className="cm-item-name">{c.name}</div>
                          <div className="cm-item-addr">{truncAddr(c.address)}</div>
                        </div>
                        <div className="cm-item-actions">
                          <button onClick={(e) => { e.stopPropagation(); handleExportQR(c.address); }} title="Export QR"><Download size={12} /></button>
                          <button onClick={(e) => { e.stopPropagation(); removeContract(c.address); }} title="Delete" className="cm-delete"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {qrExportUri && (
                  <div className="cm-qr-export">
                    <img src={qrExportUri} alt="Contract QR" style={{ width: 180, height: 180, imageRendering: 'pixelated' as any }} />
                    <button className="cm-qr-dismiss" onClick={() => setQrExportUri(null)}>DISMISS</button>
                  </div>
                )}
              </>
            )}

            {/* IMPORT VIEW */}
            {view === 'import' && (
              <div className="cm-import">
                <div className="cm-section-title">AUTO-FETCH BY ADDRESS</div>
                <div className="cm-input-row">
                  <input className="cm-input" placeholder="0x contract address..." value={importAddr} onChange={e => setImportAddr(e.target.value)} />
                  <button className="cm-fetch-btn" onClick={handleAutoFetch} disabled={loading || !importAddr}>
                    {loading ? '...' : <><Search size={12} /> FETCH</>}
                  </button>
                </div>
                <div className="cm-divider"><span>OR MANUAL ENTRY</span></div>
                <input className="cm-input" placeholder="Contract Name" value={importName} onChange={e => setImportName(e.target.value)} />
                <input className="cm-input" placeholder="Contract Address (0x...)" value={importAddr} onChange={e => setImportAddr(e.target.value)} />
                <textarea className="cm-textarea" placeholder="ABI JSON Array..." value={importAbi} onChange={e => setImportAbi(e.target.value)} rows={4} />
                <input className="cm-input" placeholder="Decimals (default: 18)" value={importDec} onChange={e => setImportDec(e.target.value)} />
                <div className="cm-import-actions">
                  <button className="cm-action-btn" onClick={() => setView('list')}>CANCEL</button>
                  <button className="cm-action-btn primary" onClick={handleManualImport} disabled={loading}>IMPORT</button>
                </div>
              </div>
            )}

            {/* INSPECT VIEW */}
            {view === 'inspect' && selectedContract && (
              <div className="cm-inspect">
                <button className="cm-back-btn" onClick={() => { setView('list'); setSelectedContract(null); }}>← BACK</button>
                <div className="cm-inspect-header">
                  <div className="cm-inspect-name">{selectedContract.name}</div>
                  <div className="cm-inspect-addr">{truncAddr(selectedContract.address)}</div>
                </div>
                <div className="cm-methods">
                  {methods.length === 0 && <div className="cm-empty">No callable methods found in ABI.</div>}
                  {methods.map((m, i) => (
                    <div key={i} className="cm-method">
                      <div className="cm-method-header" onClick={() => setExpandedMethod(expandedMethod === m.name ? null : m.name)}>
                        <div className="cm-method-info">
                          <span className={`cm-method-badge ${m.type}`}>{m.type === 'read' ? 'VIEW' : 'WRITE'}</span>
                          <span className="cm-method-name">{m.name}</span>
                        </div>
                        {expandedMethod === m.name ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                      {expandedMethod === m.name && (
                        <div className="cm-method-body">
                          {m.inputs.map((inp, j) => (
                            <input key={j} className="cm-input small" placeholder={`${inp.name || `arg${j}`} (${inp.type})`} value={methodArgs[m.name]?.[j] || ''} onChange={e => updateArg(m.name, j, e.target.value)} />
                          ))}
                          <button className={`cm-call-btn ${m.type}`} onClick={() => m.type === 'read' ? handleCallRead(m) : handleCallWrite(m)}>
                            {m.type === 'read' ? <><Play size={12} /> CALL</> : <><Send size={12} /> SIGN & SEND</>}
                          </button>
                          {methodResults[m.name] && (
                            <div className={`cm-method-result ${methodResults[m.name].startsWith('ERROR') ? 'error' : ''}`}>
                              {methodResults[m.name]}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="cm-footer">BOLT XR · CONTRACT TERMINAL · v1.0</div>
        </motion.div>

        <style jsx>{`
          .cm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:1000;display:flex;align-items:center;justify-content:center}
          .cm-card{width:440px;max-height:80vh;background:rgba(15,15,20,0.95);border:1px solid rgba(255,255,255,0.1);box-shadow:0 40px 100px rgba(0,0,0,0.8),0 0 40px rgba(16,185,129,0.1);border-radius:24px;overflow:hidden;color:white;display:flex;flex-direction:column}
          .cm-header{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between}
          .cm-close{color:rgba(255,255,255,0.4);transition:color 0.2s}.cm-close:hover{color:white}
          .cm-status{padding:8px 24px;font-size:9px;font-weight:800;letter-spacing:0.15em;background:rgba(16,185,129,0.1);color:#10b981;border-bottom:1px solid rgba(16,185,129,0.2)}
          .cm-status.error{background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.2)}
          .cm-body{padding:20px 24px;overflow-y:auto;flex:1}
          .cm-actions{display:flex;gap:8px;margin-bottom:16px}
          .cm-action-btn{display:flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:rgba(255,255,255,0.6);font-size:9px;font-weight:800;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s}
          .cm-action-btn:hover{background:rgba(255,255,255,0.1);color:white}.cm-action-btn.primary{background:rgba(16,185,129,0.2);border-color:rgba(16,185,129,0.4);color:#10b981}
          .cm-empty{text-align:center;color:rgba(255,255,255,0.3);font-size:11px;padding:40px 0;line-height:1.8}
          .cm-list{display:flex;flex-direction:column;gap:8px}
          .cm-item{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer;transition:all 0.2s}.cm-item:hover{background:rgba(255,255,255,0.06);border-color:rgba(16,185,129,0.3)}
          .cm-item-info{flex:1}.cm-item-name{font-size:12px;font-weight:700}.cm-item-addr{font-size:9px;color:rgba(255,255,255,0.4);font-family:'Space Mono',monospace;margin-top:2px}
          .cm-item-actions{display:flex;gap:8px}.cm-item-actions button{color:rgba(255,255,255,0.3);transition:color 0.2s}.cm-item-actions button:hover{color:white}.cm-delete:hover{color:#ef4444!important}
          .cm-qr-export{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:16px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px}
          .cm-qr-dismiss{font-size:9px;font-weight:800;color:rgba(255,255,255,0.4);letter-spacing:0.1em;cursor:pointer}
          .cm-import{display:flex;flex-direction:column;gap:12px}
          .cm-section-title{font-size:9px;font-weight:800;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase}
          .cm-input-row{display:flex;gap:8px}
          .cm-input{flex:1;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:white;font-size:11px;font-family:'Space Mono',monospace;outline:none;transition:border-color 0.2s}.cm-input:focus{border-color:rgba(16,185,129,0.5)}.cm-input.small{padding:6px 10px;font-size:10px}
          .cm-textarea{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:white;font-size:10px;font-family:'Space Mono',monospace;outline:none;resize:vertical;transition:border-color 0.2s}.cm-textarea:focus{border-color:rgba(16,185,129,0.5)}
          .cm-fetch-btn{display:flex;align-items:center;gap:4px;padding:10px 16px;background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.4);border-radius:8px;color:#60a5fa;font-size:9px;font-weight:800;cursor:pointer;transition:all 0.2s;white-space:nowrap}.cm-fetch-btn:hover{background:rgba(96,165,250,0.3)}.cm-fetch-btn:disabled{opacity:0.5;cursor:not-allowed}
          .cm-divider{text-align:center;padding:8px 0;font-size:8px;color:rgba(255,255,255,0.2);letter-spacing:0.2em;border-top:1px solid rgba(255,255,255,0.05);margin-top:4px}
          .cm-import-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
          .cm-inspect{display:flex;flex-direction:column;gap:12px}
          .cm-back-btn{font-size:9px;font-weight:800;color:rgba(255,255,255,0.4);letter-spacing:0.1em;cursor:pointer;align-self:flex-start;transition:color 0.2s}.cm-back-btn:hover{color:white}
          .cm-inspect-header{padding:12px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06)}
          .cm-inspect-name{font-size:14px;font-weight:800}.cm-inspect-addr{font-size:9px;color:rgba(255,255,255,0.4);font-family:'Space Mono',monospace;margin-top:4px}
          .cm-methods{display:flex;flex-direction:column;gap:6px}
          .cm-method{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden}
          .cm-method-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;transition:background 0.2s;color:rgba(255,255,255,0.5)}.cm-method-header:hover{background:rgba(255,255,255,0.04)}
          .cm-method-info{display:flex;align-items:center;gap:8px}
          .cm-method-badge{font-size:7px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:0.1em}
          .cm-method-badge.read{background:rgba(96,165,250,0.15);color:#60a5fa}.cm-method-badge.write{background:rgba(251,146,60,0.15);color:#fb923c}
          .cm-method-name{font-size:11px;font-weight:700;color:white;font-family:'Space Mono',monospace}
          .cm-method-body{padding:10px 12px;border-top:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;gap:8px}
          .cm-call-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:9px;font-weight:800;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s;align-self:flex-start}
          .cm-call-btn.read{background:rgba(96,165,250,0.2);border:1px solid rgba(96,165,250,0.4);color:#60a5fa}.cm-call-btn.read:hover{background:rgba(96,165,250,0.3)}
          .cm-call-btn.write{background:rgba(251,146,60,0.2);border:1px solid rgba(251,146,60,0.4);color:#fb923c}.cm-call-btn.write:hover{background:rgba(251,146,60,0.3)}
          .cm-method-result{font-size:10px;font-family:'Space Mono',monospace;padding:8px 10px;background:rgba(0,0,0,0.3);border-radius:6px;color:#10b981;word-break:break-all}
          .cm-method-result.error{color:#ef4444}
          .cm-footer{padding:12px 24px;background:rgba(0,0,0,0.3);font-size:8px;letter-spacing:0.3em;color:rgba(255,255,255,0.15);text-align:center}
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};

export default ContractManager;
