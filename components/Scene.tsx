'use client';

import { useEffect, useMemo, useState } from 'react';
import { Environment, Lightformer, Grid, OrbitControls, Stars } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import { useWallet, MIN_NEW_PIN_LENGTH } from '@/hooks/useWallet';
import { errorMessage } from '@/lib/format';
import CoinVault from './xr/CoinVault';
import Dashboard from './Dashboard';
import TransactionPanel from './TransactionPanel';
import SwapPanel from './SwapPanel';
import SecurityPinPad from './SecurityPinPad';
import TokenRain from './TokenRain';
import EnvironmentSelector, { EnvType } from './EnvironmentSelector';
import SecureInfoPanel from './SecureInfoPanel';
import SafeBoundary from './xr/SafeBoundary';
import ContractClipboard3D from './ContractClipboard3D';
import WristWatch, { type WatchView } from './xr/WristWatch';
import { ICED_OUT } from '@iced-out/watch';
import { useWatchOwnership } from '../hooks/useWatchOwnership';
import VirtualSky from './xr/VirtualSky';
import { useSettings } from '@/hooks/useSettings';
import { canSeeThrough, isSeeThrough, usePassthrough } from '@/lib/xr/passthrough';
import XRTaskPanel from './xr/XRTaskPanel';
import PaymentPanel from './xr/PaymentPanel';
import FarmingPanel from './xr/FarmingPanel';
import QRScannerPanel from './xr/QRScannerPanel';
import SpatialBrowserPanel from './xr/SpatialBrowserPanel';
import SpatialDappApproval from './xr/SpatialDappApproval';
import { useDappBridge } from '@/hooks/useDappBridge';
import { selectHoldings } from '@/lib/coins/holdings';

const ENV_TINT: Record<EnvType, string> = {
    space: '#6366f1',
    sunset: '#f43f5e',
    forest: '#10b981',
    city: '#3b82f6',
    rain: '#f59e0b',
};

export default function Scene() {
    const session = useXR(state => state.session);
    const passthrough = usePassthrough();
    // passthrough: the room shows through, so no sky, stars, rain or floor grid;
    // an AR session with passthrough off gets an opaque sky and looks like VR
    const seeThrough = isSeeThrough(session, passthrough);
    const virtualSky = canSeeThrough(session) && !passthrough;
    const { watchCalm } = useSettings();
    // only a holder wears an Iced-Out XR watch; everyone else keeps the classic Wrist OS watch.
    // A watch that self-destructs (worn without being held) is gone for the rest of the session.
    const { wornEdition } = useWatchOwnership();
    const [revoked, setRevoked] = useState<number[]>([]);
    // a build without the private watch module has no Iced-Out watches to put on (see lib/iced-out)
    const IcedWristWatch = ICED_OUT.IcedWristWatch;
    const icedEdition = IcedWristWatch && wornEdition > 0 && !revoked.includes(wornEdition) ? wornEdition : 0;
    const { tokens, account, isLocked, isVaultSetup, unlock, setup, lock, lockoutUntil, totalUsd } = useWallet();
    const { approval, queued } = useDappBridge();
    const [selectedChain, setSelectedChain] = useState<string | null>(null);
    const [transactionIntent, setTransactionIntent] = useState<{ step: 'overview' | 'recipient'; recipient: string }>({ step: 'overview', recipient: '' });
    const selectedToken = tokens.find(token => token.chainKey === selectedChain) || null;
    const [watchOpen, setWatchOpen] = useState(true);
    const [watchView, setWatchView] = useState<WatchView>('home');
    const [scanChain, setScanChain] = useState('ethereum');
    const [env, setEnv] = useState<EnvType>('space');

    const [showPinPad, setShowPinPad] = useState(false);
    const [pinPadAction, setPinPadAction] = useState<'unlock' | 'setup' | 'setup-confirm' | null>(null);
    const [pendingPin, setPendingPin] = useState('');
    const [pinBusy, setPinBusy] = useState(false);
    const [pinError, setPinError] = useState('');
    const [showSecureInfo, setShowSecureInfo] = useState(false);
    const [secureContent, setSecureContent] = useState('');
    const [showClipboard, setShowClipboard] = useState(false);

    // the rain environment drops coins in the colours of what you hold (gold when nothing yet)
    const rainColors = useMemo(() => {
        const held = selectHoldings(isLocked ? [] : tokens).coins.map(c => c.coin.accent);
        return held.length ? held : ['#d4af37'];
    }, [tokens, isLocked]);

    const blockingOverlay = showPinPad || showSecureInfo;
    const focusedTask = approval ? 'approval' : selectedToken ? 'transaction' : watchOpen ? watchView : 'home';

    const handleConnect = () => {
        if (!isVaultSetup) {
            setPinPadAction('setup');
            setShowPinPad(true);
        } else if (isLocked) {
            setPinPadAction('unlock');
            setShowPinPad(true);
        }
    };

    const closePinPad = () => {
        setShowPinPad(false);
        setPinPadAction(null);
        setPendingPin('');
        setPinError('');
    };

    const handlePinConfirm = async (pin: string) => {
        setPinError('');
        if (pinPadAction === 'unlock') {
            setPinBusy(true);
            const result = await unlock(pin);
            setPinBusy(false);
            if (result.ok) closePinPad();
            else setPinError((result.error || 'Incorrect PIN').toUpperCase());
        } else if (pinPadAction === 'setup') {
            if (/^(\d)\1+$/.test(pin)) {
                setPinError('AVOID REPEATED DIGITS');
                return;
            }
            setPendingPin(pin);
            setPinPadAction('setup-confirm');
        } else if (pinPadAction === 'setup-confirm') {
            if (pin !== pendingPin) {
                setPinError('PINS DO NOT MATCH — START AGAIN');
                setPendingPin('');
                setPinPadAction('setup');
                return;
            }
            setPinBusy(true);
            try {
                const mnemonic = await setup(pin);
                if (!mnemonic) throw new Error('Setup failed');
                setSecureContent(mnemonic);
                setShowSecureInfo(true);
                closePinPad();
            } catch (error) {
                setPinError(errorMessage(error).toUpperCase());
                setPinPadAction('setup');
            } finally {
                setPinBusy(false);
            }
        }
    };

    const openTransaction = (chainKey: string, direct = false, recipient = '') => {
        setTransactionIntent({ step: direct ? 'recipient' : 'overview', recipient });
        setSelectedChain(chainKey);
        setWatchView('home');
        setWatchOpen(true);
    };

    const openScanner = (chainKey: string) => {
        setSelectedChain(null);
        setScanChain(chainKey);
        setWatchView('scan');
        setWatchOpen(true);
    };

    const selectWatchView = (view: WatchView) => {
        setSelectedChain(null);
        if (view === 'swap' && isLocked) handleConnect();
        setWatchView(view);
        setWatchOpen(true);
    };

    const closeTask = () => {
        setSelectedChain(null);
        setWatchView('home');
    };

    useEffect(() => {
        const onView = (event: Event) => {
            const view = (event as CustomEvent<WatchView>).detail;
            if (['home', 'pay', 'swap', 'farm', 'scan', 'web'].includes(view)) selectWatchView(view);
        };
        window.addEventListener('boltxr:watch-view', onView);
        return () => window.removeEventListener('boltxr:watch-view', onView);
    });

    return (
        <>
            <ambientLight intensity={env === 'sunset' ? 0.8 : 0.68} />
            <directionalLight position={[4, 8, 6]} intensity={2.1} color="#e0f2fe" />
            <pointLight position={[-6, 3, 1]} intensity={0.65} color={env === 'space' ? '#4c1d95' : '#f43f5e'} />

            {virtualSky && <VirtualSky tint={ENV_TINT[env]} />}
            {env === 'space' && !seeThrough && <Stars radius={100} depth={50} count={3500} factor={4} saturation={0} fade speed={0.6} />}
            {env === 'rain' && !seeThrough && <SafeBoundary><TokenRain count={40} colors={rainColors} /></SafeBoundary>}

            <Environment resolution={64} frames={1}>
                <Lightformer intensity={1.2} color={ENV_TINT[env]} position={[0, 4, -6]} scale={[10, 4, 1]} />
                <Lightformer intensity={0.6} color="#ffffff" position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
                <Lightformer intensity={0.4} color={ENV_TINT[env]} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
            </Environment>

            {!seeThrough && (
                <Grid
                    args={[20, 20]}
                    cellColor={env === 'forest' ? '#064e3b' : '#202030'}
                    sectionColor={env === 'forest' ? '#065f46' : '#404060'}
                    position={[0, -2, 0]}
                    infiniteGrid
                />
            )}

            {focusedTask === 'home' && (
                <group position={[0.3, 2.65, -3]} scale={0.68}>
                    <Dashboard
                        account={account}
                        isLocked={isLocked}
                        isVaultSetup={isVaultSetup}
                        onConnect={handleConnect}
                        onLock={() => { lock(); closeTask(); setWatchOpen(false); setShowClipboard(false); }}
                        onShowQR={() => selectWatchView('pay')}
                        onShowContracts={() => setShowClipboard(!showClipboard)}
                    />
                </group>
            )}

            {!blockingOverlay && (
                <group position={session ? [0, 0, 0] : [-0.72, 1.32, 0.15]} rotation={session ? [0, 0, 0] : [0.04, -0.1, -0.08]} scale={session ? 1 : 0.56}>
                    {IcedWristWatch && icedEdition > 0 ? (
                        <IcedWristWatch
                            key={icedEdition}
                            edition={icedEdition}
                            onRevoked={id => setRevoked(r => (r.includes(id) ? r : [...r, id]))}
                            calm={watchCalm}
                            open={watchOpen}
                            active={watchView}
                            locked={isLocked}
                            totalUsd={totalUsd}
                            pendingApprovals={approval ? queued + 1 : 0}
                            onToggle={() => { setWatchOpen(!watchOpen); if (watchOpen) closeTask(); }}
                            onSelect={selectWatchView}
                        />
                    ) : (
                        <WristWatch
                            open={watchOpen}
                            active={watchView}
                            locked={isLocked}
                            totalUsd={totalUsd}
                            pendingApprovals={approval ? queued + 1 : 0}
                            onToggle={() => { setWatchOpen(!watchOpen); if (watchOpen) closeTask(); }}
                            onSelect={selectWatchView}
                        />
                    )}
                </group>
            )}

            {!blockingOverlay && approval && (
                <group position={session ? [0, 0, 0] : [0.4, 1.4, 0.45]} scale={session ? 1 : 0.72}>
                    <XRTaskPanel><SpatialDappApproval onRequestUnlock={handleConnect} /></XRTaskPanel>
                </group>
            )}

            {!blockingOverlay && !approval && focusedTask !== 'home' && focusedTask !== 'transaction' && (
                <group position={session ? [0, 0, 0] : [0.55, 1.4, 0.1]} scale={session ? 1 : 0.58}>
                    <XRTaskPanel>
                        {watchView === 'pay' && (
                            <PaymentPanel
                                initialChain={selectedChain}
                                onSend={chainKey => openTransaction(chainKey, true)}
                                onScan={openScanner}
                                onRequestUnlock={handleConnect}
                                onClose={closeTask}
                            />
                        )}
                        {watchView === 'swap' && !isLocked && <SwapPanel onClose={closeTask} />}
                        {watchView === 'farm' && <FarmingPanel onClose={closeTask} />}
                        {watchView === 'web' && <SpatialBrowserPanel onClose={closeTask} />}
                        {watchView === 'scan' && (
                            <QRScannerPanel
                                chainKey={scanChain}
                                onAddress={(address, chainKey) => openTransaction(chainKey, true, address)}
                                onClose={closeTask}
                            />
                        )}
                    </XRTaskPanel>
                </group>
            )}

            {!blockingOverlay && !approval && watchView === 'home' && !selectedToken && (
                // XR: a console at waist height, within reach, tilted toward the eyes (below the coin vault);
                // desktop: low in front of the camera
                <group position={session ? [0, 0.82, -0.62] : [0, 0.95, 1.2]} rotation={session ? [-0.6, 0, 0] : [-0.25, 0, 0]}>
                    <EnvironmentSelector current={env} onSelect={setEnv} />
                </group>
            )}

            {showPinPad && (
                <group position={[0, 1.5, 0.3]}>
                    <SecurityPinPad
                        title={pinPadAction === 'unlock' ? 'UNLOCK VAULT' : pinPadAction === 'setup-confirm' ? 'CONFIRM NEW PIN' : 'CHOOSE A NEW PIN'}
                        subtitle={pinPadAction === 'unlock' ? undefined : `AT LEAST ${MIN_NEW_PIN_LENGTH} DIGITS · ENCRYPTS YOUR VAULT`}
                        minLength={pinPadAction === 'unlock' ? 4 : MIN_NEW_PIN_LENGTH}
                        error={pinError}
                        busy={pinBusy}
                        lockoutUntil={pinPadAction === 'unlock' ? lockoutUntil : null}
                        onConfirm={handlePinConfirm}
                        onCancel={closePinPad}
                    />
                </group>
            )}

            {showSecureInfo && (
                <group position={[0, 1.5, 0.3]}>
                    <SecureInfoPanel title="NEW VAULT SEED" content={secureContent} onClose={() => setShowSecureInfo(false)} />
                </group>
            )}

            {/* one coin per asset the wallet holds (none for zero balances or unread networks) */}
            {!blockingOverlay && !approval && watchView === 'home' && !selectedToken && (
                <group position={[0.35, 1.05, -0.8]}>
                    <CoinVault
                        tokens={tokens}
                        locked={isLocked}
                        calm={watchCalm}
                        onSelect={chainKey => openTransaction(chainKey)}
                        onReceive={() => selectWatchView('pay')}
                    />
                </group>
            )}

            {selectedToken && !blockingOverlay && !approval && (
                <group position={session ? [0, 0, 0] : [0.7, 1.5, 0.25]} scale={session ? 1 : 0.72}>
                    <XRTaskPanel>
                        <TransactionPanel
                            key={`${selectedToken.chainKey}-${transactionIntent.recipient}`}
                            token={selectedToken}
                            initialStep={transactionIntent.step}
                            initialRecipient={transactionIntent.recipient}
                            onScanRequest={openScanner}
                            onClose={closeTask}
                            onStartSwap={() => { setSelectedChain(null); setWatchView('swap'); }}
                        />
                    </XRTaskPanel>
                </group>
            )}

            <OrbitControls makeDefault target={[0, 1.2, -1]} minDistance={1} maxDistance={10} />

            {showClipboard && !showPinPad && (
                <group position={[-1.8, 1.5, -1.5]} rotation={[0, 0.3, 0]}>
                    <ContractClipboard3D chainId="ethereum" onClose={() => setShowClipboard(false)} />
                </group>
            )}
        </>
    );
}
