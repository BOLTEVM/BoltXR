/**
 * Answers provider requests from pages in the game browser.
 *
 * Pure logic: everything it needs (vault state, approvals, signing) is injected,
 * so it runs the same in the app and in tests. The approval callback is where
 * the person decides; nothing that reveals the account, signs or spends happens
 * without it (except listing the account to an origin they already connected).
 *
 * Errors follow EIP-1193: 4001 rejected, 4100 unauthorized, 4200 unsupported,
 * 4902 unknown chain, -32602 invalid params, -32603 internal.
 */

import { getAddress, getBytes, isHexString, toUtf8String, TypedDataEncoder } from 'quais';
import {
  canonicalQuaiAddress, quaiNetworkByChainId,
  type QuaiNetwork, type QuaiNetworkKey,
} from '../boltows/quai';
import type { DappRequestMessage, DappResponseMessage } from '../desktop';

export class DappError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'DappError';
  }
}

export interface HostState {
  status: 'checking' | 'no-vault' | 'locked' | 'unlocked';
  quaiAddress: string | null;
}

export interface TypedDataRequest {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface TxDetails {
  to: string;
  value: bigint;
  data: string;
  gasLimit?: bigint;
}

export type Approval =
  | { kind: 'connect'; origin: string; network: QuaiNetwork }
  | { kind: 'sign'; origin: string; message: string; text: string | null; signInDomain: string | null; hiddenCharacters: boolean }
  | { kind: 'typed'; origin: string; typed: TypedDataRequest; shown: Record<string, unknown> }
  | { kind: 'transaction'; origin: string; network: QuaiNetwork; tx: TxDetails }
  | { kind: 'switch'; origin: string; from: QuaiNetwork; to: QuaiNetwork };

export interface HostDeps {
  state(): HostState;
  network(): QuaiNetwork;
  isConnected(origin: string): boolean;
  connect(origin: string): void;
  disconnect(origin: string): void;
  /** Ask the person. Resolves true when approved (the UI unlocks the vault first if needed). */
  approve(approval: Approval): Promise<boolean>;
  signMessage(message: string): Promise<string>;
  signTypedData(typed: TypedDataRequest): Promise<string>;
  sendTransaction(tx: TxDetails): Promise<string>;
  switchNetwork(key: QuaiNetworkKey): void;
}

const hexQuantity = (n: number | bigint) => '0x' + n.toString(16);

const parseQuantity = (value: unknown, label: string): bigint | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(0x[0-9a-fA-F]+|\d+)$/.test(value)) return BigInt(value);
  throw new DappError(-32602, `${label} must be a non-negative integer quantity`);
};

const isHexAddress = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

/** Decode a personal_sign payload for display: UTF-8 text when it is text, else null. */
export const decodeSignPayload = (message: string): string | null => {
  if (!isHexString(message)) return message;
  try {
    const text = toUtf8String(getBytes(message));
    // Reject control characters other than whitespace: that is binary, not text.
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text) ? null : text;
  } catch {
    return null;
  }
};

/** Bidi controls and invisible characters can make shown text differ from what is signed. */
export const hasHiddenCharacters = (text: string | null): boolean =>
  !!text && /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/.test(text);

/** The domain a "Sign in with Quai/Ethereum" message claims, if it is one. */
export const signInDomain = (text: string | null): string | null => {
  if (!text) return null;
  const head = /^(\S+) wants you to sign in with your (?:Quai|Ethereum) account:\n/.exec(text);
  return head ? head[1] : null;
};

export class DappHost {
  constructor(private readonly deps: HostDeps) {}

  async handle(request: DappRequestMessage): Promise<DappResponseMessage> {
    try {
      const result = await this.dispatch(request.origin, request.method, Array.isArray(request.params) ? request.params : []);
      return { result: result === undefined ? null : result };
    } catch (e) {
      if (e instanceof DappError) return { error: { code: e.code, message: e.message } };
      const message = e instanceof Error ? e.message : 'Request failed';
      return { error: { code: -32603, message } };
    }
  }

  private accountsFor(origin: string): string[] {
    const { status, quaiAddress } = this.deps.state();
    return this.deps.isConnected(origin) && status === 'unlocked' && quaiAddress ? [quaiAddress] : [];
  }

  /** The connected, unlocked account, after any approval has run. */
  private requireAccount(origin: string): string {
    const [account] = this.accountsFor(origin);
    if (!account) throw new DappError(4100, 'Connect Bolt XR to this site first');
    return account;
  }

  private requireConnected(origin: string) {
    if (!this.deps.isConnected(origin)) throw new DappError(4100, 'Connect Bolt XR to this site first');
  }

  /**
   * When the page names an account, it must be the connected one. Checked
   * before asking (when the account is known) and again after the approval.
   */
  private checkNamedAccount(origin: string, named: unknown, label: string) {
    if (named === undefined || named === null) return;
    const [account] = this.accountsFor(origin);
    if (!account) return; // locked: re-checked after the approval unlocks
    if (!isHexAddress(named) || getAddress(named.toLowerCase()) !== account) {
      throw new DappError(4100, `${label} is not the account connected to this site`);
    }
  }

  private async ask(approval: Approval) {
    const ok = await this.deps.approve(approval);
    if (!ok) throw new DappError(4001, 'You rejected the request in Bolt XR');
  }

  private async dispatch(origin: string, method: string, params: unknown[]): Promise<unknown> {
    const network = this.deps.network();
    switch (method) {
      case 'quai_chainId':
      case 'eth_chainId':
        return hexQuantity(network.chainId);
      case 'net_version':
        return String(network.chainId);

      case 'quai_accounts':
      case 'eth_accounts':
        return this.accountsFor(origin);

      case 'quai_requestAccounts':
      case 'eth_requestAccounts':
        return this.requestAccounts(origin, network);

      case 'wallet_requestPermissions':
        await this.requestAccounts(origin, network);
        return [{ parentCapability: 'eth_accounts', caveats: [] }];
      case 'wallet_getPermissions':
        return this.deps.isConnected(origin) ? [{ parentCapability: 'eth_accounts', caveats: [] }] : [];
      case 'wallet_revokePermissions':
        this.deps.disconnect(origin);
        return null;

      case 'personal_sign':
        return this.personalSign(origin, params);

      case 'quai_signTypedData_v4':
      case 'eth_signTypedData_v4':
        return this.signTypedData(origin, params);

      case 'quai_sendTransaction':
      case 'eth_sendTransaction':
        return this.sendTransaction(origin, network, params);

      case 'wallet_switchEthereumChain':
      case 'wallet_switchQuaiChain':
      case 'wallet_addEthereumChain':
        return this.switchChain(origin, network, params, method === 'wallet_addEthereumChain');

      default:
        throw new DappError(4200, `${method} is not supported by Bolt XR`);
    }
  }

  private async requestAccounts(origin: string, network: QuaiNetwork): Promise<string[]> {
    const existing = this.accountsFor(origin);
    if (existing.length) return existing;
    await this.ask({ kind: 'connect', origin, network });
    this.deps.connect(origin);
    const accounts = this.accountsFor(origin);
    if (!accounts.length) throw new DappError(4100, 'Unlock Bolt XR to connect');
    return accounts;
  }

  private async personalSign(origin: string, params: unknown[]): Promise<string> {
    this.requireConnected(origin);
    let [message, address] = params;
    // Some dapps send [address, message].
    if (isHexAddress(message) && !isHexAddress(address)) [message, address] = [address, message];
    if (typeof message !== 'string') throw new DappError(-32602, 'personal_sign expects a message');
    const text = decodeSignPayload(message);
    this.checkNamedAccount(origin, address, 'That address');
    await this.ask({ kind: 'sign', origin, message, text, signInDomain: signInDomain(text), hiddenCharacters: hasHiddenCharacters(text) });
    this.requireAccount(origin);
    this.checkNamedAccount(origin, address, 'That address');
    return this.deps.signMessage(message);
  }

  private async signTypedData(origin: string, params: unknown[]): Promise<string> {
    this.requireConnected(origin);
    const [address, raw] = params;
    let typed: TypedDataRequest;
    try {
      typed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as TypedDataRequest;
    } catch {
      throw new DappError(-32602, 'Typed data must be JSON');
    }
    if (!typed || typeof typed !== 'object' || !typed.types || !typed.domain || !typed.message || typeof typed.primaryType !== 'string') {
      throw new DappError(-32602, 'Typed data must have domain, types, primaryType and message');
    }
    const network = this.deps.network();
    const domainChain = typed.domain.chainId;
    if (domainChain !== undefined && Number(domainChain) !== network.chainId) {
      throw new DappError(-32602, `This signature is for chain ${String(domainChain)}, but Bolt XR is on ${network.shortName}`);
    }
    if (!isHexAddress(address)) throw new DappError(-32602, 'Typed data signing needs the account address');
    this.checkNamedAccount(origin, address, 'That address');
    // Show exactly what gets signed: the primary type quais derives from `types`
    // (not the page's label) and only the fields that are encoded.
    const types = Object.fromEntries(Object.entries(typed.types).filter(([name]) => name !== 'EIP712Domain'));
    let shown: Record<string, unknown>;
    try {
      const encoder = TypedDataEncoder.from(types);
      if (encoder.primaryType !== typed.primaryType) {
        throw new DappError(-32602, `primaryType "${typed.primaryType}" does not match the types (${encoder.primaryType})`);
      }
      TypedDataEncoder.hash(typed.domain as never, types, typed.message);
      const fields = new Set((types[encoder.primaryType] ?? []).map(f => f.name));
      shown = Object.fromEntries(Object.entries(typed.message).filter(([k]) => fields.has(k)));
    } catch (e) {
      if (e instanceof DappError) throw e;
      throw new DappError(-32602, `Typed data does not encode: ${e instanceof Error ? e.message : 'invalid'}`);
    }
    await this.ask({ kind: 'typed', origin, typed, shown });
    this.requireAccount(origin);
    this.checkNamedAccount(origin, address, 'That address');
    return this.deps.signTypedData(typed);
  }

  private async sendTransaction(origin: string, network: QuaiNetwork, params: unknown[]): Promise<string> {
    this.requireConnected(origin);
    const raw = params[0] as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') throw new DappError(-32602, 'Expected a transaction object');
    if (raw.to === undefined || raw.to === null || raw.to === '') {
      throw new DappError(-32602, 'Contract deployment from a website is not supported');
    }
    let to: string;
    try {
      to = canonicalQuaiAddress(String(raw.to));
    } catch (e) {
      throw new DappError(-32602, e instanceof Error ? e.message : 'Invalid recipient');
    }
    if (raw.chainId !== undefined && raw.chainId !== null && Number(parseQuantity(raw.chainId, 'chainId')) !== network.chainId) {
      throw new DappError(-32602, `This transaction is for another network; Bolt XR is on ${network.shortName}`);
    }
    const data = raw.data ?? raw.input ?? '0x';
    if (typeof data !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new DappError(-32602, 'Transaction data must be hex');
    const tx: TxDetails = {
      to,
      value: parseQuantity(raw.value, 'value') ?? 0n,
      data,
      gasLimit: parseQuantity(raw.gasLimit ?? raw.gas, 'gasLimit'),
    };

    this.checkNamedAccount(origin, raw.from, 'The sending account');
    await this.ask({ kind: 'transaction', origin, network, tx });
    this.requireAccount(origin);
    this.checkNamedAccount(origin, raw.from, 'The sending account');
    // The network must not have changed under the approval.
    if (this.deps.network().chainId !== network.chainId) throw new DappError(4901, 'The network changed; send again');
    return this.deps.sendTransaction(tx);
  }

  private async switchChain(origin: string, current: QuaiNetwork, params: unknown[], isAdd: boolean): Promise<null> {
    const arg = params[0] as { chainId?: unknown } | undefined;
    let id: bigint | undefined;
    try {
      id = parseQuantity(arg?.chainId, 'chainId');
    } catch {
      id = undefined;
    }
    const target = id !== undefined ? quaiNetworkByChainId(Number(id)) : null;
    if (!target) throw new DappError(isAdd ? 4200 : 4902, 'Bolt XR only supports Quai mainnet (9) and Orchard (15000)');
    if (target.chainId === current.chainId) return null;
    await this.ask({ kind: 'switch', origin, from: current, to: target });
    this.deps.switchNetwork(target.key);
    return null;
  }
}
