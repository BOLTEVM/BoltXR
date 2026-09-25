'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Send, ClipboardPaste, ScanLine, ExternalLink, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import Dialog from './ui/Dialog';
import TokenIcon from './ui/TokenIcon';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS, getExplorerTxUrl } from '@/lib/boltows/chains';
import { errorMessage, formatAmount, formatUsd, truncateAddress } from '@/lib/format';

interface SendDialogProps {
  open: boolean;
  onClose: () => void;
  initialTo?: string;
  initialChainKey?: string;
  onScanRequest?: () => void;
  onRequestUnlock?: () => void;
}

type Phase = 'form' | 'review' | 'sending' | 'done';

export default function SendDialog({ open, onClose, initialTo, initialChainKey, onScanRequest, onRequestUnlock }: SendDialogProps) {
  const wallet = useWallet();
  const { estimateFee } = wallet;
  const sendable = useMemo(() => wallet.tokens.filter(t => t.canSend), [wallet.tokens]);

  const [phase, setPhase] = useState<Phase>('form');
  const [chainKey, setChainKey] = useState(initialChainKey || 'ethereum');
  const [to, setTo] = useState(initialTo || '');
  const [amount, setAmount] = useState('');
  const [feeResult, setFeeResult] = useState<{ chainKey: string; fee: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  // Reset when (re)opened with new prefill values
  const [openKey, setOpenKey] = useState<string | null>(null);
  const nextKey = open ? `${initialTo ?? ''}|${initialChainKey ?? ''}` : null;
  if (nextKey !== openKey) {
    setOpenKey(nextKey);
    if (open) {
      setPhase('form');
      setTo(initialTo || '');
      setAmount('');
      setError(null);
      setHash(null);
      if (initialChainKey && CHAINS[initialChainKey]?.canSend) setChainKey(initialChainKey);
    }
  }

  const chain = CHAINS[chainKey];
  const token = wallet.tokens.find(t => t.chainKey === chainKey);
  const fee = feeResult?.chainKey === chainKey ? feeResult.fee : null;
  const feeState = feeResult?.chainKey !== chainKey ? 'loading' : fee ? 'ready' : 'unavailable';

  useEffect(() => {
    if (!open || !chain?.canSend) return;
    let cancelled = false;
    estimateFee(chainKey).then(f => {
      if (!cancelled) setFeeResult({ chainKey, fee: f });
    });
    return () => { cancelled = true; };
  }, [open, chainKey, chain?.canSend, estimateFee]);

  const recipientValid = to.trim() !== '' && wallet.validateAddress(to.trim(), chainKey);
  const amountError = useMemo(() => {
    if (!amount) return null;
    try {
      const value = wallet.parseAmount(amount, chainKey);
      if (token?.status === 'success' && chain && value > ethers.parseUnits(token.balance, chain.nativeCurrency.decimals)) {
        return 'Exceeds your balance';
      }
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }, [amount, chainKey, token, chain, wallet]);

  const usdValue = token?.usdPrice !== undefined && amount && !amountError ? Number(amount) * token.usdPrice : null;

  const setMax = () => {
    if (!token || token.status !== 'success' || !chain) return;
    const balance = ethers.parseUnits(token.balance, chain.nativeCurrency.decimals);
    // Keep 1.5x the estimated fee aside so the transfer can pay for gas.
    const reserve = fee ? ethers.parseUnits(fee, chain.nativeCurrency.decimals) * 3n / 2n : 0n;
    const max = balance > reserve ? balance - reserve : 0n;
    setAmount(ethers.formatUnits(max, chain.nativeCurrency.decimals));
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setTo(text);
    } catch {
      setError('Clipboard access was blocked — paste with Ctrl/Cmd+V instead.');
    }
  };

  const confirm = async () => {
    setPhase('sending');
    setError(null);
    try {
      const txHash = await wallet.send({ chainKey, to: to.trim(), amount });
      setHash(txHash);
      setPhase('done');
    } catch (e) {
      setError(errorMessage(e));
      setPhase('review');
    }
  };

  const explorerUrl = hash ? getExplorerTxUrl(chainKey, hash) : null;
  const canReview = recipientValid && !!amount && !amountError && token?.status !== 'loading';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={phase !== 'sending'}
      icon={<Send className="h-5 w-5 text-purple-400" />}
      title={phase === 'done' ? 'Sent' : phase === 'form' ? 'Send' : 'Review'}
      footer="Signed locally · Broadcast to public RPC"
    >
      {wallet.status !== 'unlocked' ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-sm text-slate-400">Unlock your vault to send funds.</p>
          {onRequestUnlock && <button type="button" className="btn btn-primary" onClick={onRequestUnlock}>Unlock vault</button>}
        </div>
      ) : phase === 'form' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={e => { e.preventDefault(); if (canReview) setPhase('review'); }}
        >
          <label>
            <span className="field-label">Network</span>
            <select className="input" value={chainKey} onChange={e => { setChainKey(e.target.value); setAmount(''); }}>
              {sendable.map(t => (
                <option key={t.chainKey} value={t.chainKey}>
                  {t.name} · {t.status === 'success' ? `${formatAmount(t.balance)} ${t.symbol}` : t.symbol}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label htmlFor="send-to" className="field-label">Recipient</label>
            <div className="flex gap-2">
              <input
                id="send-to"
                className="input"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder={chain?.kind === 'sui' ? '0x… (64 hex)' : '0x…'}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={to !== '' && !recipientValid}
                data-autofocus
              />
              <button type="button" className="icon-btn h-[42px] w-[42px] shrink-0" onClick={paste} aria-label="Paste address"><ClipboardPaste size={16} /></button>
              {onScanRequest && (
                <button type="button" className="icon-btn h-[42px] w-[42px] shrink-0" onClick={onScanRequest} aria-label="Scan QR code"><ScanLine size={16} /></button>
              )}
            </div>
            {to !== '' && !recipientValid && (
              <p className="text-[11px] text-red-400 mt-1.5">Not a valid {chain?.name} address</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="send-amount" className="field-label">Amount</label>
              {token?.status === 'success' && (
                <span className="text-[11px] text-slate-500 mb-1.5">Balance {formatAmount(token.balance)} {token.symbol}</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                id="send-amount"
                className="input"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(',', '.'))}
                placeholder="0.0"
                autoComplete="off"
                aria-invalid={!!amountError}
              />
              <button type="button" className="btn btn-sm h-[42px]" onClick={setMax} disabled={token?.status !== 'success'}>Max</button>
            </div>
            <div className="flex justify-between mt-1.5 text-[11px]">
              <span className={amountError ? 'text-red-400' : 'text-slate-500'}>{amountError || (usdValue !== null ? `≈ ${formatUsd(usdValue)}` : ' ')}</span>
              <span className="text-slate-500">
                {feeState === 'ready' && fee ? `Network fee ≈ ${formatAmount(fee, 8)} ${chain?.nativeCurrency.symbol}`
                  : feeState === 'loading' ? 'Estimating fee…' : 'Fee estimate unavailable'}
              </span>
            </div>
          </div>

          {error && <div className="notice notice-danger" role="alert">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={!canReview}>Review</button>
        </form>
      ) : phase === 'done' ? (
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <div>
            <div className="text-lg font-bold">{formatAmount(amount)} {chain?.nativeCurrency.symbol} sent</div>
            <p className="text-xs text-slate-400 mt-1">Submitted to {chain?.name}. It will confirm shortly.</p>
          </div>
          {hash && <code className="mono text-[11px] text-slate-400 break-all">{hash}</code>}
          <div className="flex gap-3">
            {explorerUrl && (
              <a className="btn" href={explorerUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Explorer</a>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>Done</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {chain && <TokenIcon symbol={chain.nativeCurrency.symbol} color={chain.color} size={40} />}
            <div>
              <div className="text-2xl font-bold">{formatAmount(amount)} {chain?.nativeCurrency.symbol}</div>
              {usdValue !== null && <div className="text-xs text-slate-400">≈ {formatUsd(usdValue)}</div>}
            </div>
          </div>
          <dl className="card divide-y divide-white/5 text-xs">
            <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Network</dt><dd>{chain?.name}</dd></div>
            <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">From</dt><dd className="mono">{truncateAddress(wallet.addresses[chainKey], 8, 6)}</dd></div>
            <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">To</dt><dd className="mono break-all text-right">{to.trim()}</dd></div>
            <div className="flex justify-between gap-4 p-3"><dt className="text-slate-500">Network fee</dt><dd>{fee ? `≈ ${formatAmount(fee, 8)} ${chain?.nativeCurrency.symbol}` : 'Estimated at signing'}</dd></div>
          </dl>
          <div className="notice notice-warning">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>Transactions can&apos;t be reversed. Double-check the recipient address.</span>
          </div>
          {error && <div className="notice notice-danger" role="alert">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn" onClick={() => { setPhase('form'); setError(null); }} disabled={phase === 'sending'}>Back</button>
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={phase === 'sending'} data-autofocus>
              {phase === 'sending' ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : 'Confirm & send'}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
