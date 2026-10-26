'use client';

/**
 * Token3D — one asset the wallet holds, as a living Currencychips coin.
 *
 * Replaces the old flat cylinder chips. The coin itself (sculpted body, gem
 * settings, engraved and baked faces, halo, glow and animation) is
 * lib/coins/CoinModel; this component places it, feeds it the wallet's state
 * and turns pointer input into the same action the chips had: tap a coin to
 * open that asset (send, receive, swap).
 *
 *   hover / ray     the coin turns to face you, grows, its stones chase and
 *                   its halo brightens; the network name shows
 *   balance up      sparks off the rim and the stones celebrate; down: a dip
 *   network offline the halo goes red and flickers; the last balance read
 *                   stays, labelled
 *   no longer held  it shrinks away, then unmounts (`onGone`)
 *
 * Pointer events come from the mouse on the desktop and from controller rays
 * and hands in WebXR (@react-three/xr v6), so there is one set of handlers.
 * Only an invisible disc is ray-tested, never the hundreds of stones.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Vector3, type Group } from 'three';
import { CoinModel } from '@/lib/coins/CoinModel';
import type { Holding } from '@/lib/coins/holdings';
import { studioFor } from '@/lib/gems/studioCache';
import { formatAmount, formatUsd } from '@/lib/format';

/** Coin radius in metres at scale 1 (the old chips were 0.3). */
export const COIN_RADIUS = 0.27;

/** Coins already minted in this session come back without the drop. */
const introduced = new Set<string>();

interface Token3DProps {
    holding: Holding;
    position: [number, number, number];
    /** Turns the coin's face toward the viewer. */
    yaw: number;
    /** No longer held: play the exit, then call `onGone`. */
    leaving?: boolean;
    /** Calm mode: softer sparkle, no flips or strobing. */
    calm?: boolean;
    /** Milliseconds to wait before building (spreads first-load work across frames). */
    buildDelay?: number;
    onSelect: (chainKey: string) => void;
    onGone?: (key: string) => void;
}

export default function Token3D({ holding, position, yaw, leaving = false, calm = false, buildDelay = 0, onSelect, onGone }: Token3DProps) {
    const gl = useThree(s => s.gl);
    const groupRef = useRef<Group>(null);
    const [model, setModel] = useState<CoinModel | null>(null);
    const [hovered, setHovered] = useState(false);
    const lastAmount = useRef<number | null>(null);
    const goneSent = useRef(false);
    const { coin, key, asset, stale, scale, usd } = holding;

    // build (after `buildDelay`), dispose on unmount; strict-mode safe
    useEffect(() => {
        let m: CoinModel | null = null;
        const id = window.setTimeout(() => {
            m = new CoinModel(coin, { env: studioFor(gl), quality: 'xr', calm, introAt: introduced.has(key) ? 1 : 0 });
            introduced.add(key);
            setModel(m);
        }, buildDelay);
        return () => {
            window.clearTimeout(id);
            m?.dispose();
        };
        // calm is applied live below; rebuilding for it would replay the intro
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coin, gl, key]);

    useEffect(() => { model?.setCalm(calm); }, [model, calm]);
    useEffect(() => { model?.setStale(stale); }, [model, stale]);
    useEffect(() => {
        if (!model) return;
        if (leaving) model.leave();
        else model.stay();
    }, [model, leaving]);

    // balance moved: sparks up, a dip down (not on the first read)
    useEffect(() => {
        if (!model) return;
        const prev = lastAmount.current;
        lastAmount.current = holding.amount;
        if (prev === null || stale) return;
        if (holding.amount > prev) model.pulse('up');
        else if (holding.amount < prev) model.pulse('down');
    }, [model, holding.amount, stale]);

    useFrame((state, delta) => {
        const g = groupRef.current;
        if (g) {
            // glide into a new slot when the set of coins changes
            g.position.lerp(_target.set(...position), 1 - Math.exp(-delta * 5));
            g.rotation.y += (yaw - g.rotation.y) * (1 - Math.exp(-delta * 5));
        }
        if (!model) return;
        model.update(delta, state.clock.elapsedTime, state.camera, state.size.height * state.viewport.dpr);
        if (model.gone && !goneSent.current) {
            goneSent.current = true;
            onGone?.(key);
        }
    });

    const setCursor = (value: string) => { if (typeof document !== 'undefined') document.body.style.cursor = value; };
    const R = COIN_RADIUS * scale;
    const amount = `${formatAmount(asset.balance, asset.balance.startsWith('0.') ? 6 : 4)} ${asset.symbol}`;
    const sub = stale ? 'OFFLINE · LAST BALANCE READ' : hovered ? asset.network : usd !== null ? formatUsd(usd) : asset.network;

    return (
        <group ref={groupRef} position={position} rotation={[0, yaw, 0]}>
            {model && (
                <primitive
                    object={model.root}
                    scale={R}
                    onClick={(e: ThreeEvent<MouseEvent>) => {
                        e.stopPropagation();
                        if (!leaving) onSelect(asset.chainKey);
                    }}
                    onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                        e.stopPropagation();
                        model.setHover(true); // straight to the coin: no waiting for a re-render in the headset
                        setHovered(true);
                        setCursor('pointer');
                    }}
                    onPointerOut={() => { model.setHover(false); setHovered(false); setCursor('auto'); }}
                />
            )}
            {model && !leaving && (
                <group position={[0, -R - 0.11, 0]}>
                    <Text fontSize={0.072} color="#f8fafc" anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#020617">
                        {amount}
                    </Text>
                    <Text position={[0, -0.085, 0]} fontSize={0.045} color={stale ? '#fca5a5' : hovered ? coin.accent : '#94a3b8'} anchorX="center" anchorY="middle">
                        {sub}
                    </Text>
                </group>
            )}
        </group>
    );
}

const _target = new Vector3();
