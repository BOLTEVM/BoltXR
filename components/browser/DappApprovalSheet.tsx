'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Globe, KeyRound, Link2, PenLine, Send, Shuffle } from 'lucide-react';
import { formatQuai, id as selectorHash } from 'quais';
import Dialog from '../ui/Dialog';
import PinEntry from '../ui/PinEntry';
import VaultDialog from '../VaultDialog';
import { useWallet } from '@/hooks/useWallet';
import { useDappBridge } from '@/hooks/useDappBridge';
import { getDesktop, KNOWN_ORIGINS } from '@/lib/desktop';
import type { Approval } from '@/lib/dapp/host';

/** Function selectors Bolt XR names on the confirm screen. */
const KNOWN_CALLS: Record<string, string> = Object.fromEntries(
  [
    ['claimEarned(uint256,uint256,bytes)', 'Claim your earned METAKEY pass'],
    ['approve(address,uint256)', 'Allow a contract to spend a token'],
    ['transfer(address,uint256)', 'Send a token'],
    ['setApprovalForAll(address,bool)', 'Allow a contract to move ALL your items in a collection'],
    ['safeTransferFrom(address,address,uint256,uint256,bytes)', 'Send a game item'],
  ].map(([sig, label]) => [selectorHash(sig).slice(0, 10), label]),
);

const shortAddress = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

function SiteBadge({ origin }: { origin: string }) {
  const known = KNOWN_ORIGINS[origin];
  const url = new URL(origin);
  const local = url.protocol === 'http:';
  return (
    <div className="card flex items-center gap-3 p-3">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-purple-500/15 flex items-center justify-center">
        <Globe size={18} className="text-purple-300" aria-hidden />
      </div>
      {/* The full host, wrapped, never cut: a lookalike like beam.boltevm.com.evil.io must show its real end. */}
      <div className="min-w-0">
        {known && <div className="text-sm font-semibold text-white">{known}</div>}
        <div className={`mono break-all ${known ? 'text-[11px] text-slate-400' : 'text-sm text-white'}`}>{known ? origin : url.host}</div>
        {!known && <div className="mono text-[11px] text-slate-500">{`${url.protocol}//`}</div>}
      </div>
      {local && <span className="pill pill-warning ml-auto shrink-0">Local</span>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="field-label shrink-0 !mb-0">{label}</span>
      <span className="text-right text-sm text-slate-100 min-w-0 break-all">{children}</span>
    </div>
  );
}

const TITLES: Record<Approval['kind'], string> = {
  connect: 'Connect to this site?',
  sign: 'Signature request',
  typed: 'Signature request',
  transaction: 'Confirm transaction',
  switch: 'Switch network?',
};

const ICONS: Record<Approval['kind'], React.ReactNode> = {
  connect: <Link2 className="h-5 w-5 text-purple-400" />,
  sign: <PenLine className="h-5 w-5 text-purple-400" />,
  typed: <PenLine className="h-5 w-5 text-purple-400" />,
  transaction: <Send className="h-5 w-5 text-purple-400" />,
  switch: <Shuffle className="h-5 w-5 text-purple-400" />,
};

const APPROVE_LABEL: Record<Approval['kind'], string> = {
  connect: 'Connect',
  sign: 'Sign',
  typed: 'Sign',
  transaction: 'Confirm & send',
  switch: 'Switch network',
};

function Details({ approval, account }: { approval: Approval; account: string | null }) {
  switch (approval.kind) {
    case 'connect':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-300">
            The site will see your Quai address and balance. It can ask you to sign or send — Bolt XR asks you every time.
          </p>
          <div className="card p-3">
            <Row label="Account">{account ? <span className="mono">{shortAddress(account)}</span> : '—'}</Row>
            <Row label="Network">{approval.network.shortName}</Row>
          </div>
        </div>
      );
    case 'sign': {
      const origin = new URL(approval.origin);
      const mismatch = approval.signInDomain && approval.signInDomain !== origin.host;
      return (
        <div className="flex flex-col gap-3">
          {approval.signInDomain && !mismatch && (
            <p className="text-sm text-slate-300">
              Sign in with your Quai account. This proves you own the address — it does not move funds.
            </p>
          )}
          {mismatch && (
            <div className="notice notice-danger items-start" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                This sign-in message is for <strong>{approval.signInDomain}</strong>, but the request comes from <strong>{origin.host}</strong>.
                Signing it could sign you in somewhere else. Reject unless you are sure.
              </span>
            </div>
          )}
          {approval.hiddenCharacters && (
            <div className="notice notice-danger items-start" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>This message contains invisible or direction-changing characters, so what you see may not be what you sign.</span>
            </div>
          )}
          <div className="field-label !mb-0">Message</div>
          <pre className="card p-3 mono text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-auto">
            {approval.text ?? approval.message}
          </pre>
          {approval.text === null && (
            <div className="notice notice-warning items-start">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>This message is raw data, not text. Only sign it if you trust the site.</span>
            </div>
          )}
        </div>
      );
    }
    case 'typed': {
      const d = approval.typed.domain;
      return (
        <div className="flex flex-col gap-3">
          <div className="card p-3">
            {typeof d.name === 'string' && <Row label="App">{d.name}</Row>}
            {d.verifyingContract !== undefined && <Row label="Contract"><span className="mono">{String(d.verifyingContract)}</span></Row>}
            {d.chainId !== undefined && <Row label="Chain">{String(d.chainId)}</Row>}
            <Row label="Type">{approval.typed.primaryType}</Row>
          </div>
          <pre className="card p-3 mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-auto">
            {JSON.stringify(approval.shown, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}
          </pre>
        </div>
      );
    }
    case 'transaction': {
      const { tx, network } = approval;
      const selector = tx.data.length >= 10 ? tx.data.slice(0, 10).toLowerCase() : null;
      const call = selector ? KNOWN_CALLS[selector] : null;
      const risky = selector === selectorHash('setApprovalForAll(address,bool)').slice(0, 10);
      return (
        <div className="flex flex-col gap-3">
          {call && <p className="text-sm text-slate-200 font-semibold">{call}</p>}
          {risky && (
            <div className="notice notice-danger items-start" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>This gives the contract control over every item you hold in that collection.</span>
            </div>
          )}
          <div className="card p-3">
            <Row label="From">{account ? <span className="mono">{shortAddress(account)}</span> : '—'}</Row>
            <Row label={tx.data !== '0x' ? 'Contract' : 'To'}><span className="mono">{tx.to}</span></Row>
            <Row label="Amount">{formatQuai(tx.value)} QUAI</Row>
            {tx.data !== '0x' && <Row label="Data">{selector}{tx.data.length > 10 ? ` + ${(tx.data.length - 10) / 2} bytes` : ''}</Row>}
            {tx.gasLimit !== undefined && <Row label="Gas limit">{tx.gasLimit.toString()}</Row>}
            <Row label="Network">{network.shortName}</Row>
          </div>
          <p className="text-[11px] text-slate-400">The network fee is paid in QUAI from this account.</p>
        </div>
      );
    }
    case 'switch':
      return (
        <div className="card p-4 flex items-center justify-center gap-3 text-sm">
          <span>{approval.from.shortName}</span>
          <ArrowRight size={16} className="text-slate-400" aria-hidden />
          <span className="font-semibold text-white">{approval.to.shortName}</span>
        </div>
      );
  }
}

/** Shown over everything when a site in the game browser asks for something. */
export default function DappApprovalSheet() {
  const wallet = useWallet();
  const { approval, approvalKey, queued, resolveApproval } = useDappBridge();
  // Each new request starts disarmed for a moment, so a double-click or a held
  // Enter on the previous one can never approve it.
  const [armedKey, setArmedKey] = useState(0);
  useEffect(() => {
    if (!approvalKey) return;
    const t = setTimeout(() => setArmedKey(approvalKey), 800);
    return () => clearTimeout(t);
  }, [approvalKey]);
  const armed = armedKey === approvalKey;
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  const account = wallet.status === 'unlocked' ? wallet.addresses.quai ?? null : null;
  const needsUnlock = wallet.status === 'locked';
  const noVault = wallet.status === 'no-vault';

  const decide = (approved: boolean) => {
    setPin('');
    setPinError(null);
    resolveApproval(approved);
  };

  const unlock = async () => {
    if (!pin || unlocking) return;
    setUnlocking(true);
    const result = await wallet.unlock(pin);
    setUnlocking(false);
    setPin('');
    setPinError(result.ok ? null : result.error ?? 'Incorrect PIN');
  };

  // Nothing is focused on the approve button: Enter or Escape never approves by accident.
  const domainMismatch = approval?.kind === 'sign' && !!approval.signInDomain && approval.signInDomain !== new URL(approval.origin).host;

  const footer = useMemo(() => {
    if (!approval) return null;
    return (
      <div className="flex w-full gap-3">
        <button type="button" className="btn flex-1" onClick={() => decide(false)}>Reject</button>
        {needsUnlock ? (
          <button type="button" className="btn btn-primary flex-1" onClick={unlock} disabled={!pin || unlocking}>
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        ) : (
          <button
            type="button"
            className={`btn flex-1 ${domainMismatch ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => decide(true)}
            disabled={!armed || noVault || wallet.status !== 'unlocked' || (approval.kind !== 'switch' && !account)}
          >
            {APPROVE_LABEL[approval.kind]}
          </button>
        )}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approval, needsUnlock, noVault, pin, unlocking, wallet.status, account, domainMismatch, armed]);

  return (
    <>
      <Dialog
        key={approvalKey}
        open={approval !== null && !vaultOpen}
        onClose={() => decide(false)}
        title={approval ? TITLES[approval.kind] : ''}
        icon={approval ? ICONS[approval.kind] : null}
        size="md"
        footer={footer}
      >
        {approval && (
          <div className="flex flex-col gap-4" data-testid="dapp-approval" data-kind={approval.kind}>
            <SiteBadge origin={approval.origin} />

            {noVault && (
              <div className="notice notice-warning items-start">
                <KeyRound size={16} className="shrink-0 mt-0.5" />
                <span className="flex-1">
                  Set up your Bolt XR vault first. Restoring your Pelagus recovery phrase brings the same Quai address.
                  <button type="button" className="btn btn-sm mt-2" onClick={() => setVaultOpen(true)}>Set up vault</button>
                </span>
              </div>
            )}

            {needsUnlock ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-300 text-center">Enter your PIN to unlock Bolt XR and review this request.</p>
                <PinEntry value={pin} onChange={setPin} onSubmit={unlock} disabled={unlocking} error={!!pinError} />
                {pinError && <p className="text-center text-sm text-red-400" role="alert">{pinError}</p>}
              </div>
            ) : (
              !noVault && <Details approval={approval} account={account} />
            )}

            {queued > 0 && <p className="text-[11px] text-slate-500 text-center">{queued} more request{queued > 1 ? 's' : ''} waiting</p>}
            <button
              type="button"
              className="btn btn-ghost btn-sm self-center"
              onClick={() => {
                getDesktop()?.browser.command('leave');
                decide(false);
              }}
            >
              Reject and leave this site
            </button>
          </div>
        )}
      </Dialog>
      <VaultDialog open={vaultOpen} onClose={() => setVaultOpen(false)} />
    </>
  );
}
