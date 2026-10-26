'use client';

import { useEffect, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { CanvasTexture } from 'three';
import Button3D, { XR_THEME } from './Button3D';
import { getDesktop, HOME_SITES } from '@/lib/desktop';
import { useDappBridge } from '@/hooks/useDappBridge';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM.-'];

export default function SpatialBrowserPanel({ onClose }: { onClose: () => void }) {
  const [desktop] = useState(getDesktop);
  const { browserState } = useDappBridge();
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // The native Chromium layer is used by the 2D browser. In Wrist OS the same
    // page is sampled into this XR surface so it remains visible in the scene.
    desktop?.browser.layout({ visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } });
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !browserState?.tabId || editing) return;
    let cancelled = false;
    let busy = false;
    const capture = async () => {
      if (busy) return;
      busy = true;
      try {
        const frame = await desktop.browser.capture();
        if (!frame || cancelled) return;
        const image = new Image();
        image.onload = () => {
          if (cancelled) return;
          const next = new CanvasTexture(image);
          next.needsUpdate = true;
          setTexture(previous => { previous?.dispose(); return next; });
        };
        image.src = frame.dataUrl;
      } catch {
        if (!cancelled) setError('Page preview is temporarily unavailable. Navigation controls still work.');
      } finally {
        busy = false;
      }
    };
    queueMicrotask(() => { void capture(); });
    const interval = setInterval(() => { void capture(); }, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [desktop, browserState?.tabId, browserState?.url, browserState?.loading, editing]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!desktop) {
    return (
      <group>
        <RoundedBox args={[2.7, 1.7, 0.08]} radius={0.08}><meshStandardMaterial color="#07111f" /></RoundedBox>
        <Text position={[0, 0.45, 0.06]} fontSize={0.09} color="#f8fafc" anchorX="center">BOLT SHIELD BROWSER</Text>
        <Text position={[0, 0.05, 0.06]} fontSize={0.055} color={XR_THEME.muted} anchorX="center" maxWidth={2.25} textAlign="center">MULTI-TAB CHROMIUM AND WEBXR GAMES RUN IN THE BOLT XR DESKTOP SHELL.</Text>
        <Button3D label="CLOSE" onPress={onClose} position={[0, -0.55, 0.06]} width={1.05} />
      </group>
    );
  }

  const open = async (value: string) => {
    const result = await desktop.browser.open(value);
    if (!result.ok) setError(result.reason);
    else { setError(''); setEditing(false); }
  };
  const newTab = async () => { await desktop.browser.newTab(); setEditing(false); };
  const tabs = browserState?.tabs ?? [];
  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === browserState?.tabId));
  const cycleTab = (direction: number) => {
    if (!tabs.length) return;
    desktop.browser.activateTab(tabs[(activeIndex + direction + tabs.length) % tabs.length].id);
  };
  const shields = browserState?.shields ?? { trackers: true, thirdPartyCookies: true };
  const stats = browserState?.stats ?? { trackers: 0, cookies: 0, requests: 0 };

  const clickPage = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!event.uv) return;
    desktop.browser.input({ type: 'click', x: event.uv.x, y: 1 - event.uv.y });
  };
  const scrollPage = (event: ThreeEvent<WheelEvent>) => {
    event.stopPropagation();
    desktop.browser.input({ type: 'scroll', x: 0.5, y: 0.5, deltaY: event.deltaY });
  };

  return (
    <group>
      <RoundedBox args={[3.12, 3.7, 0.09]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color="#06101d" metalness={0.45} roughness={0.28} name="Browser · Titanium panel" />
      </RoundedBox>
      <RoundedBox args={[3.14, 3.72, 0.025]} radius={0.08} position={[0, 0, -0.055]}>
        <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.2} transparent opacity={0.3} name="Browser · Shield rim" />
      </RoundedBox>
      <group position={[0, 0, 0.065]}>
        <Text position={[-1.4, 1.65, 0]} fontSize={0.068} color="#f8fafc" anchorX="left">BOLT / SHIELD</Text>
        <Text position={[1.4, 1.65, 0]} fontSize={0.038} color="#34d399" anchorX="right">{`${tabs.length} ISOLATED TABS`}</Text>

        <Button3D label="‹" onPress={() => cycleTab(-1)} position={[-1.32, 1.38, 0]} width={0.22} height={0.22} disabled={tabs.length < 2} />
        <Text position={[0, 1.39, 0]} fontSize={0.048} color="#a5f3fc" anchorX="center" maxWidth={2.1}>
          {(browserState?.title || 'NEW ISOLATED TAB').slice(0, 48).toUpperCase()}
        </Text>
        <Button3D label="›" onPress={() => cycleTab(1)} position={[1.02, 1.38, 0]} width={0.22} height={0.22} disabled={tabs.length < 2} />
        <Button3D label="+" onPress={() => { void newTab(); }} position={[1.32, 1.38, 0]} width={0.3} height={0.22} color="#0e7490" />

        <Button3D
          label={editing ? address || 'ENTER HTTPS ADDRESS' : browserState?.url && browserState.url !== 'about:blank' ? browserState.url : 'TAP TO ENTER AN HTTPS ADDRESS'}
          onPress={() => { setAddress(browserState?.url === 'about:blank' ? '' : browserState?.url ?? ''); setEditing(true); }}
          position={[0, 1.09, 0]} width={2.78} height={0.25} fontSize={0.037} color="#172554"
        />

        <Button3D label="BACK" onPress={() => desktop.browser.command('back')} position={[-1.13, 0.79, 0]} width={0.56} height={0.22} fontSize={0.04} disabled={!browserState?.canGoBack} />
        <Button3D label="RELOAD" onPress={() => desktop.browser.command('reload')} position={[-0.52, 0.79, 0]} width={0.58} height={0.22} fontSize={0.038} disabled={!browserState?.tabId} />
        <Button3D label="BEAM" onPress={() => { void open(HOME_SITES[0].url); }} position={[0.08, 0.79, 0]} width={0.52} height={0.22} fontSize={0.04} color="#7c3aed" />
        <Button3D label={`TRACK ${shields.trackers ? 'ON' : 'OFF'}`} onPress={() => desktop.browser.setShield('trackers', !shields.trackers)} position={[0.73, 0.79, 0]} width={0.63} height={0.22} fontSize={0.035} color={shields.trackers ? '#047857' : '#475569'} />
        <Button3D label={`COOKIE ${shields.thirdPartyCookies ? 'ON' : 'OFF'}`} onPress={() => desktop.browser.setShield('thirdPartyCookies', !shields.thirdPartyCookies)} position={[1.36, 0.79, 0]} width={0.55} height={0.22} fontSize={0.032} color={shields.thirdPartyCookies ? '#047857' : '#475569'} />

        <RoundedBox args={[2.84, 1.98, 0.025]} radius={0.04} position={[0, -0.34, -0.015]}>
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </RoundedBox>

        {editing ? (
          <group position={[0, -0.25, 0.02]}>
            <Text position={[0, 0.77, 0]} fontSize={0.045} color="#67e8f9" anchorX="center" maxWidth={2.55}>SPATIAL URL KEYBOARD · HTTPS ONLY</Text>
            {KEY_ROWS.map((row, rowIndex) => [...row].map((key, keyIndex) => (
              <Button3D
                key={`${rowIndex}-${key}`}
                label={key}
                onPress={() => setAddress(value => (value + key.toLowerCase()).slice(0, 2048))}
                position={[-1.1 + keyIndex * 0.245, 0.43 - rowIndex * 0.38, 0]}
                width={0.21} height={0.28} fontSize={0.065} color="#1e293b"
              />
            )))}
            <Button3D label="⌫" onPress={() => setAddress(value => value.slice(0, -1))} position={[-0.92, -0.77, 0]} width={0.42} height={0.25} />
            <Button3D label="CLEAR" onPress={() => setAddress('')} position={[-0.42, -0.77, 0]} width={0.48} height={0.25} fontSize={0.04} />
            <Button3D label="GO" onPress={() => { void open(address); }} position={[0.3, -0.77, 0]} width={0.75} height={0.25} color="#059669" disabled={!address} />
            <Button3D label="CANCEL" onPress={() => setEditing(false)} position={[1.0, -0.77, 0]} width={0.55} height={0.25} fontSize={0.037} />
          </group>
        ) : texture && browserState?.tabId ? (
          <mesh position={[0, -0.34, 0.008]} onClick={clickPage} onWheel={scrollPage}>
            <planeGeometry args={[2.76, 1.9]} />
            <meshBasicMaterial map={texture} toneMapped={false} name="Browser · Live Chromium surface" />
          </mesh>
        ) : (
          <group position={[0, -0.28, 0.015]}>
            <Text position={[0, 0.35, 0]} fontSize={0.075} color="#e2e8f0" anchorX="center">PRIVATE CHROMIUM TAB</Text>
            <Text position={[0, 0.08, 0]} fontSize={0.047} color={XR_THEME.muted} anchorX="center" maxWidth={2.3} textAlign="center">OPEN BEAM OR ENTER A URL. TAP THE PAGE TO INTERACT; SCROLL WITH THE POINTER WHEEL.</Text>
            <Button3D label="NEW TAB" onPress={() => { void newTab(); }} position={[0, -0.38, 0]} width={1.2} height={0.26} color="#0e7490" />
          </group>
        )}

        <Text position={[-1.38, -1.48, 0]} fontSize={0.036} color="#34d399" anchorX="left">{`${stats.trackers} TRACKERS · ${stats.cookies} COOKIES BLOCKED`}</Text>
        <Button3D label="CLEAR DATA" onPress={() => { void desktop.browser.clearSiteData(); }} position={[-0.85, -1.67, 0]} width={0.85} height={0.19} fontSize={0.035} color="#7f1d1d" disabled={!browserState?.tabId} />
        <Button3D label="CLOSE TAB" onPress={() => browserState?.tabId && desktop.browser.closeTab(browserState.tabId)} position={[0.1, -1.67, 0]} width={0.85} height={0.19} fontSize={0.035} disabled={!browserState?.tabId} />
        <Button3D label="CLOSE" onPress={onClose} position={[1.05, -1.67, 0]} width={0.75} height={0.19} fontSize={0.038} />
        {error && <Text position={[0, -1.34, 0.01]} fontSize={0.032} color="#fda4af" anchorX="center" maxWidth={2.65} textAlign="center">{error.toUpperCase()}</Text>}
      </group>
    </group>
  );
}
