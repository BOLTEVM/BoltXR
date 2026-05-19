'use client';

/**
 * ContractClipboard3D — Spatial VR/AR clipboard for importing, browsing,
 * and interacting with custom smart contracts.
 *
 * Three tabs: IMPORT (paste/fetch/scan), BROWSE (contract list), INTERACT (method calls).
 */

import { useState, useCallback, useEffect } from 'react';
import { Text, RoundedBox, Float } from '@react-three/drei';
import { Interactive } from '@react-three/xr';
import { BoltwalletCore, ContractData } from '@/lib/boltows/ows-core';
import { parseABIMethods } from '@/lib/abi-fetcher';

const core = new BoltwalletCore();

type ClipboardTab = 'import' | 'browse' | 'interact';

interface ContractClipboard3DProps {
  chainId: string;
  walletId: string | null;
  onClose: () => void;
  onOpenQRScanner?: () => void;
}

// Reusable 3D button
function Btn3D({ label, onClick, position, color = "#444", w = 0.55 }: {
  label: string; onClick: () => void; position: [number, number, number]; color?: string; w?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Interactive onSelect={onClick}>
      <group position={position} onPointerDown={onClick} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <RoundedBox args={[w, 0.12, 0.02]} radius={0.02} smoothness={4} scale={hovered ? 1.05 : 1}>
          <meshStandardMaterial color={hovered ? "#fff" : color} emissive={hovered ? "#fff" : color} emissiveIntensity={hovered ? 0.5 : 0.15} metalness={0.8} roughness={0.2} />
        </RoundedBox>
        <Text position={[0, 0, 0.02]} fontSize={0.03} color={hovered ? "black" : "white"} anchorX="center" anchorY="middle">
          {label}
        </Text>
      </group>
    </Interactive>
  );
}

// Tab button
function TabBtn({ label, active, onClick, position }: {
  label: string; active: boolean; onClick: () => void; position: [number, number, number];
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Interactive onSelect={onClick}>
      <group position={position} onPointerDown={onClick} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <RoundedBox args={[0.32, 0.1, 0.01]} radius={0.02} smoothness={4}>
          <meshStandardMaterial
            color={active ? "#10b981" : "#1e293b"}
            emissive={active ? "#10b981" : "#334155"}
            emissiveIntensity={active ? 0.4 : (hovered ? 0.2 : 0.05)}
            metalness={0.8} roughness={0.2}
          />
        </RoundedBox>
        <Text position={[0, 0, 0.01]} fontSize={0.025} color={active ? "white" : "#94a3b8"} anchorX="center">
          {label}
        </Text>
      </group>
    </Interactive>
  );
}

export default function ContractClipboard3D({ chainId, walletId, onClose, onOpenQRScanner }: ContractClipboard3DProps) {
  const [tab, setTab] = useState<ClipboardTab>('browse');
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [selected, setSelected] = useState<ContractData | null>(null);
  const [methods, setMethods] = useState<ReturnType<typeof parseABIMethods>>([]);
  const [status, setStatus] = useState<string>('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [methodResults, setMethodResults] = useState<Record<string, string>>({});

  // Load contracts
  const refresh = useCallback(async () => {
    const list = await core.listContracts(chainId);
    setContracts(list);
  }, [chainId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (selected?.abi) setMethods(parseABIMethods(selected.abi));
    else setMethods([]);
  }, [selected]);

  // Clipboard paste handler
  const handlePaste = useCallback(async () => {
    try {
      setStatus('READING CLIPBOARD...');
      const text = await navigator.clipboard.readText();
      if (!text) { setStatus('CLIPBOARD EMPTY'); return; }

      // Try as boltxr:// URI first
      const contract = await core.importContractFromQR(text);
      if (contract) {
        await refresh();
        setStatus(`IMPORTED: ${contract.name}`);
        setTimeout(() => setStatus(''), 3000);
        return;
      }

      // Try as contract address for auto-fetch
      if (text.startsWith('0x') && text.length === 42) {
        setStatus('FETCHING ABI...');
        const result = await core.fetchContractABI(text, chainId);
        if ('abi' in result) {
          await core.importContract(result.name, text, result.abi, 18, chainId);
          await refresh();
          setStatus(`IMPORTED: ${result.name}`);
          setTimeout(() => setStatus(''), 3000);
        } else {
          setStatus('NOT VERIFIED');
          setTimeout(() => setStatus(''), 3000);
        }
        return;
      }

      setStatus('UNRECOGNIZED FORMAT');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: any) {
      setStatus('CLIPBOARD ERROR');
      setTimeout(() => setStatus(''), 3000);
    }
  }, [chainId, refresh]);

  // Auto-fetch by address (simulated VR input)
  const handleAutoFetch = useCallback(async (address: string) => {
    setStatus('FETCHING ABI...');
    const result = await core.fetchContractABI(address, chainId);
    if ('abi' in result) {
      let decimals = 18;
      try {
        const m = parseABIMethods(result.abi);
        if (m.find(x => x.name === 'decimals')) {
          const d = await core.callContractRead(address, result.abi, 'decimals', [], chainId);
          decimals = Number(d);
        }
      } catch { /* default 18 */ }
      await core.importContract(result.name, address, result.abi, decimals, chainId);
      await refresh();
      setStatus(`IMPORTED: ${result.name}`);
    } else {
      setStatus('NOT VERIFIED');
    }
    setTimeout(() => setStatus(''), 3000);
  }, [chainId, refresh]);

  // Call a read method
  const handleCallRead = useCallback(async (methodName: string) => {
    if (!selected) return;
    try {
      const result = await core.callContractRead(selected.address, selected.abi, methodName, [], chainId);
      setMethodResults(prev => ({ ...prev, [methodName]: String(result) }));
    } catch (e: any) {
      setMethodResults(prev => ({ ...prev, [methodName]: `ERR: ${e.message.substring(0, 30)}` }));
    }
  }, [selected, chainId]);

  // Delete contract
  const handleDelete = useCallback(async (addr: string) => {
    await core.deleteContract(addr, chainId);
    if (selected?.address === addr) { setSelected(null); setTab('browse'); }
    await refresh();
  }, [chainId, selected, refresh]);

  const truncAddr = (a: string) => `${a.substring(0, 6)}...${a.substring(a.length - 4)}`;
  const visibleContracts = contracts.slice(scrollOffset, scrollOffset + 4);
  const readMethods = methods.filter(m => m.type === 'read').slice(0, 6);
  const writeMethods = methods.filter(m => m.type === 'write').slice(0, 4);

  return (
    <group>
      <Float speed={1.5} rotationIntensity={0.03} floatIntensity={0.1}>
        {/* Main Background */}
        <RoundedBox args={[1.3, 1.8, 0.06]} radius={0.06} smoothness={4} position={[0, 0, -0.04]}>
          <meshStandardMaterial color="#0f172a" transparent opacity={0.93} metalness={0.9} roughness={0.1} />
        </RoundedBox>
        <RoundedBox args={[1.32, 1.82, 0.04]} radius={0.06} smoothness={4} position={[0, 0, -0.07]}>
          <meshStandardMaterial color="#10b981" transparent opacity={0.25} emissive="#10b981" emissiveIntensity={0.3} />
        </RoundedBox>

        {/* Title */}
        <Text position={[0, 0.78, 0.04]} fontSize={0.06} color="#10b981" anchorX="center" fontWeight="bold">
          CONTRACT CLIPBOARD
        </Text>
        <mesh position={[0, 0.72, 0.04]}>
          <planeGeometry args={[0.7, 0.003]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1} />
        </mesh>

        {/* Status Bar */}
        {status && (
          <group position={[0, 0.65, 0.04]}>
            <RoundedBox args={[1.0, 0.08, 0.01]} radius={0.01} smoothness={4}>
              <meshStandardMaterial color="#065f46" emissive="#10b981" emissiveIntensity={0.3} />
            </RoundedBox>
            <Text position={[0, 0, 0.01]} fontSize={0.025} color="#10b981" anchorX="center">
              {status}
            </Text>
          </group>
        )}

        {/* Tabs */}
        <group position={[0, status ? 0.54 : 0.60, 0.04]}>
          <TabBtn label="IMPORT" active={tab === 'import'} onClick={() => setTab('import')} position={[-0.36, 0, 0]} />
          <TabBtn label="BROWSE" active={tab === 'browse'} onClick={() => setTab('browse')} position={[0, 0, 0]} />
          <TabBtn label="INTERACT" active={tab === 'interact'} onClick={() => { if (selected) setTab('interact'); }} position={[0.36, 0, 0]} />
        </group>

        {/* Content Area */}
        <group position={[0, -0.05, 0.04]}>

          {/* IMPORT TAB */}
          {tab === 'import' && (
            <group>
              <Text position={[0, 0.38, 0]} fontSize={0.03} color="#94a3b8" anchorX="center">
                IMPORT A SMART CONTRACT
              </Text>
              <Btn3D label="PASTE FROM CLIPBOARD" onClick={handlePaste} position={[0, 0.22, 0]} color="#3b82f6" w={0.7} />
              {onOpenQRScanner && (
                <Btn3D label="SCAN QR CODE" onClick={onOpenQRScanner} position={[0, 0.06, 0]} color="#8b5cf6" w={0.7} />
              )}
              <Btn3D label="FETCH BY ADDRESS" onClick={() => {
                const addr = prompt('Enter contract address (0x...):');
                if (addr) handleAutoFetch(addr);
              }} position={[0, -0.10, 0]} color="#10b981" w={0.7} />
              <Text position={[0, -0.28, 0]} fontSize={0.022} color="#64748b" anchorX="center" maxWidth={0.9}>
                Paste a boltxr:// URI, contract address, or ABI JSON from your clipboard. 
                Auto-fetch pulls verified ABIs from Sourcify and Etherscan.
              </Text>
            </group>
          )}

          {/* BROWSE TAB */}
          {tab === 'browse' && (
            <group>
              {contracts.length === 0 ? (
                <Text position={[0, 0.1, 0]} fontSize={0.03} color="#64748b" anchorX="center" maxWidth={0.8}>
                  No contracts imported.{'\n'}Use the IMPORT tab to add one.
                </Text>
              ) : (
                <group>
                  {visibleContracts.map((c, i) => {
                    const yPos = 0.32 - i * 0.18;
                    const isSelected = selected?.address === c.address;
                    return (
                      <group key={c.address + i} position={[0, yPos, 0]}>
                        <Interactive onSelect={() => { setSelected(c); setTab('interact'); }}>
                          <group onPointerDown={() => { setSelected(c); setTab('interact'); }}>
                            <RoundedBox args={[1.0, 0.14, 0.01]} radius={0.02} smoothness={4}>
                              <meshStandardMaterial
                                color={isSelected ? "#064e3b" : "#1e293b"}
                                emissive={isSelected ? "#10b981" : "#334155"}
                                emissiveIntensity={isSelected ? 0.3 : 0.05}
                                metalness={0.7} roughness={0.3}
                              />
                            </RoundedBox>
                            <Text position={[-0.4, 0.015, 0.01]} fontSize={0.03} color="white" anchorX="left">
                              {c.name.length > 18 ? c.name.substring(0, 18) + '...' : c.name}
                            </Text>
                            <Text position={[-0.4, -0.025, 0.01]} fontSize={0.02} color="#64748b" anchorX="left">
                              {truncAddr(c.address)} · {c.chainId}
                            </Text>
                          </group>
                        </Interactive>
                        <Btn3D label="✕" onClick={() => handleDelete(c.address)} position={[0.42, 0, 0]} color="#7f1d1d" w={0.1} />
                      </group>
                    );
                  })}
                  {/* Scroll controls */}
                  {contracts.length > 4 && (
                    <group position={[0, -0.45, 0]}>
                      <Btn3D label="▲" onClick={() => setScrollOffset(Math.max(0, scrollOffset - 1))} position={[-0.15, 0, 0]} color="#334155" w={0.2} />
                      <Text position={[0, 0, 0]} fontSize={0.02} color="#64748b" anchorX="center">
                        {scrollOffset + 1}-{Math.min(scrollOffset + 4, contracts.length)} / {contracts.length}
                      </Text>
                      <Btn3D label="▼" onClick={() => setScrollOffset(Math.min(contracts.length - 4, scrollOffset + 1))} position={[0.15, 0, 0]} color="#334155" w={0.2} />
                    </group>
                  )}
                </group>
              )}
            </group>
          )}

          {/* INTERACT TAB */}
          {tab === 'interact' && selected && (
            <group>
              <Text position={[0, 0.38, 0]} fontSize={0.035} color="white" anchorX="center" fontWeight="bold">
                {selected.name}
              </Text>
              <Text position={[0, 0.32, 0]} fontSize={0.02} color="#64748b" anchorX="center">
                {truncAddr(selected.address)}
              </Text>

              {/* Read Methods */}
              {readMethods.length > 0 && (
                <group>
                  <Text position={[-0.45, 0.22, 0]} fontSize={0.022} color="#60a5fa" anchorX="left">
                    READ METHODS
                  </Text>
                  {readMethods.map((m, i) => {
                    const yPos = 0.14 - i * 0.1;
                    return (
                      <group key={m.name} position={[0, yPos, 0]}>
                        <Btn3D label={m.name + (m.inputs.length > 0 ? `(${m.inputs.length})` : '()')} onClick={() => handleCallRead(m.name)} position={[-0.15, 0, 0]} color="#1e40af" w={0.6} />
                        {methodResults[m.name] && (
                          <Text position={[0.35, 0, 0.01]} fontSize={0.02} color="#10b981" anchorX="left" maxWidth={0.3}>
                            {methodResults[m.name].length > 20 ? methodResults[m.name].substring(0, 20) + '...' : methodResults[m.name]}
                          </Text>
                        )}
                      </group>
                    );
                  })}
                </group>
              )}

              {/* Write Methods (display only — needs args) */}
              {writeMethods.length > 0 && (
                <group>
                  <Text position={[-0.45, -0.3, 0]} fontSize={0.022} color="#fb923c" anchorX="left">
                    WRITE METHODS
                  </Text>
                  {writeMethods.map((m, i) => (
                    <Text key={m.name} position={[-0.4, -0.38 - i * 0.06, 0]} fontSize={0.022} color="#94a3b8" anchorX="left">
                      ▸ {m.name}({m.inputs.map(inp => inp.type).join(', ')})
                    </Text>
                  ))}
                  <Text position={[0, -0.58, 0]} fontSize={0.018} color="#64748b" anchorX="center" maxWidth={0.8}>
                    Write methods require parameter input. Use the 2D Contract Manager for full interaction.
                  </Text>
                </group>
              )}
            </group>
          )}
        </group>

        {/* Close Button */}
        <Btn3D label="CLOSE" onClick={onClose} position={[0, -0.78, 0.04]} color="#334155" w={0.4} />
      </Float>
    </group>
  );
}
