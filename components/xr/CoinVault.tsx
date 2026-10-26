'use client';

/**
 * CoinVault — the coins that stand in front of you when you enter Bolt XR.
 *
 * One coin per asset the wallet actually holds (lib/coins/holdings): nothing
 * for a zero balance, nothing for a network that has never answered, the
 * biggest position in the middle and the rest alternating outwards on an arc.
 * When a balance arrives the coin mints in; when it goes to zero the coin
 * shrinks away; when a network stops answering its coin stays with the last
 * balance read, marked offline.
 *
 * Before the first balances arrive it says so; with nothing held it says what
 * to do (Receive); networks it could not reach are named, so a missing coin
 * is never a silent guess.
 */

import { useMemo, useState } from 'react';
import { Text } from '@react-three/drei';
import Token3D from '../Token3D';
import Button3D, { XR_THEME } from './Button3D';
import { arcSlots, selectHoldings, type Holding, type Slot, type WalletAsset } from '@/lib/coins/holdings';

interface CoinVaultProps {
    tokens: readonly WalletAsset[];
    /** Vault locked: no balances to show (the dashboard asks to unlock). */
    locked: boolean;
    calm?: boolean;
    /** Open an asset (the transaction panel: send, receive, swap). */
    onSelect: (chainKey: string) => void;
    /** Empty wallet: take the user to Receive. */
    onReceive: () => void;
}

interface Placed {
    holding: Holding;
    slot: Slot;
}

/** Arc radius (metres): the coins stand this far in front of the viewer. */
const RADIUS = 2.5;

export default function CoinVault({ tokens, locked, calm = false, onSelect, onReceive }: CoinVaultProps) {
    const view = useMemo(() => selectHoldings(locked ? [] : tokens), [tokens, locked]);
    const placed = useMemo<Placed[]>(() => {
        const slots = arcSlots(view.coins.length, { radius: RADIUS });
        return view.coins.map((holding, i) => ({ holding, slot: slots[i] }));
    }, [view.coins]);

    // coins that just stopped being held finish their exit where they stood
    const [prev, setPrev] = useState<Placed[]>(placed);
    const [leaving, setLeaving] = useState<Placed[]>([]);
    if (prev !== placed) {
        // (the documented "adjust state while rendering" pattern: runs once per change of `placed`)
        const now = new Set(placed.map(p => p.holding.key));
        const gone = prev.filter(p => !now.has(p.holding.key));
        if (gone.length || leaving.some(p => now.has(p.holding.key))) {
            setLeaving(l => [
                // a coin held again stops leaving (it remounts in its slot)
                ...l.filter(p => !now.has(p.holding.key)),
                ...gone.filter(g => !l.some(p => p.holding.key === g.holding.key)),
            ]);
        }
        setPrev(placed);
    }

    if (locked) return null;

    const names = (list: readonly WalletAsset[]) => list.map(a => a.network).join(', ');
    const empty = placed.length === 0;
    const centre = arcSlots(1, { radius: RADIUS })[0].position;

    return (
        <group>
            {/* one list, keyed by asset: a coin that stops being held keeps its instance and plays its exit */}
            {[...placed.map(p => ({ ...p, out: false })), ...leaving.map(p => ({ ...p, out: true }))].map((p, i) => (
                <Token3D
                    key={p.holding.key}
                    holding={p.holding}
                    position={p.slot.position}
                    yaw={p.slot.yaw}
                    calm={calm}
                    leaving={p.out}
                    buildDelay={Math.min(i, 8) * 140}
                    onSelect={onSelect}
                    onGone={key => setLeaving(l => l.filter(x => x.holding.key !== key))}
                />
            ))}

            {empty && !view.settled && (
                <Text position={centre} fontSize={0.075} color={XR_THEME.muted} anchorX="center" anchorY="middle">
                    Reading your balances…
                </Text>
            )}

            {empty && view.settled && view.unreachable.length === 0 && (
                <group position={centre}>
                    <mesh position={[0, 0.02, -0.02]}>
                        <planeGeometry args={[1.5, 0.66]} />
                        <meshStandardMaterial color={XR_THEME.surface} transparent opacity={0.82} metalness={0.6} roughness={0.25} />
                    </mesh>
                    <Text position={[0, 0.2, 0]} fontSize={0.085} color={XR_THEME.text} anchorX="center" anchorY="middle">
                        No coins yet
                    </Text>
                    <Text position={[0, 0.07, 0]} fontSize={0.045} maxWidth={1.3} textAlign="center" color={XR_THEME.muted} anchorX="center" anchorY="middle">
                        A coin appears here for each asset your wallet holds.
                    </Text>
                    <Button3D label="RECEIVE" onPress={onReceive} position={[0, -0.13, 0.01]} width={0.6} height={0.15} color={XR_THEME.info} fontSize={0.05} />
                </group>
            )}

            {view.unreachable.length > 0 && view.settled && (
                <Text
                    position={[centre[0], empty ? centre[1] : -0.78, centre[2]]}
                    fontSize={0.045}
                    maxWidth={2.6}
                    textAlign="center"
                    color="#fca5a5"
                    anchorX="center"
                    anchorY="middle"
                >
                    {`Can't reach ${names(view.unreachable)} right now. Their coins appear when they answer.`}
                </Text>
            )}
        </group>
    );
}
