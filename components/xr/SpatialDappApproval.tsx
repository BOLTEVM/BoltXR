'use client';

import { useEffect, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { formatQuai } from 'quais';
import Button3D, { XR_THEME } from './Button3D';
import { useDappBridge } from '@/hooks/useDappBridge';
import { useWallet } from '@/hooks/useWallet';

const LABELS = {
  connect: 'CONNECT ACCOUNT',
  sign: 'SIGN MESSAGE',
  typed: 'SIGN TYPED DATA',
  transaction: 'CONFIRM TRANSACTION',
  switch: 'SWITCH NETWORK',
};

export default function SpatialDappApproval({ onRequestUnlock }: { onRequestUnlock: () => void }) {
  const { approval, approvalKey, queued, resolveApproval } = useDappBridge();
  const wallet = useWallet();
  const [armedKey, setArmedKey] = useState(0);

  useEffect(() => {
    if (!approvalKey) return;
    const timer = setTimeout(() => setArmedKey(approvalKey), 900);
    return () => clearTimeout(timer);
  }, [approvalKey]);

  if (!approval) return null;
  const account = wallet.status === 'unlocked' ? wallet.addresses.quai : null;
  const armed = armedKey === approvalKey;
  const canApprove = armed && wallet.status === 'unlocked' && (approval.kind === 'switch' || !!account);
  let primary = '';
  let secondary = '';
  let detail = '';
  let warning = '';

  if (approval.kind === 'connect') {
    primary = 'SHARE YOUR QUAI ADDRESS?';
    secondary = `NETWORK · ${approval.network.shortName}`;
    detail = account || 'UNLOCK TO SELECT AN ACCOUNT';
    warning = 'THE SITE CAN REQUEST SIGNATURES. EVERY REQUEST NEEDS YOUR WRIST APPROVAL.';
  } else if (approval.kind === 'transaction') {
    primary = `${formatQuai(approval.tx.value)} QUAI`;
    secondary = `TO / CONTRACT · ${approval.tx.to}`;
    detail = `${approval.network.shortName} · ${approval.tx.data === '0x' ? 'NATIVE TRANSFER' : `CALLDATA ${approval.tx.data.slice(0, 10)} · ${(approval.tx.data.length - 10) / 2} BYTES`}`;
    warning = approval.tx.data.toLowerCase().startsWith('0xa22cb465')
      ? 'WARNING · THIS CAN GIVE A CONTRACT CONTROL OF ALL ITEMS IN A COLLECTION.'
      : 'VERIFY THE SITE, NETWORK, DESTINATION, AND AMOUNT. THIS CAN MOVE FUNDS.';
  } else if (approval.kind === 'sign') {
    primary = approval.signInDomain ? 'SIGN-IN REQUEST' : 'MESSAGE SIGNATURE';
    secondary = approval.text ?? approval.message;
    detail = `ACCOUNT · ${account || 'LOCKED'}`;
    warning = approval.signInDomain && approval.signInDomain !== new URL(approval.origin).host
      ? `DANGER · MESSAGE DOMAIN ${approval.signInDomain} DOES NOT MATCH THIS SITE.`
      : approval.hiddenCharacters ? 'WARNING · INVISIBLE OR DIRECTION-CHANGING CHARACTERS DETECTED.' : 'SIGNATURE ONLY · THIS DOES NOT BROADCAST A TRANSACTION.';
  } else if (approval.kind === 'typed') {
    primary = String(approval.typed.domain.name || approval.typed.primaryType);
    secondary = `TYPE · ${approval.typed.primaryType}`;
    detail = `VERIFYING CONTRACT · ${String(approval.typed.domain.verifyingContract || 'NOT SPECIFIED')}`;
    warning = 'REVIEW THE REQUESTING SITE AND CONTRACT. TYPED DATA CAN AUTHORIZE ASSET ACTIONS.';
  } else {
    primary = `${approval.from.shortName} → ${approval.to.shortName}`;
    secondary = 'SWITCH THE NETWORK SHARED WITH CONNECTED SITES';
    warning = 'NO TRANSACTION IS SENT BY A NETWORK SWITCH.';
  }

  return (
    <group>
      <RoundedBox args={[2.2, 3.05, 0.1]} radius={0.09} smoothness={5}>
        <meshStandardMaterial color="#0b1020" metalness={0.5} roughness={0.25} name="Approval · Obsidian panel" />
      </RoundedBox>
      <RoundedBox args={[2.23, 3.08, 0.025]} radius={0.09} position={[0, 0, -0.06]}>
        <meshStandardMaterial color="#b45309" emissive="#f59e0b" emissiveIntensity={0.35} transparent opacity={0.45} name="Approval · Amber rim" />
      </RoundedBox>
      <group position={[0, 0, 0.075]}>
        <Text position={[0, 1.31, 0]} fontSize={0.072} color="#fbbf24" anchorX="center">WRIST APPROVAL</Text>
        <Text position={[0, 1.12, 0]} fontSize={0.052} color="#f8fafc" anchorX="center">{LABELS[approval.kind]}</Text>
        <Text position={[0, 0.9, 0]} fontSize={0.048} color="#a5f3fc" anchorX="center" maxWidth={1.88} textAlign="center">{new URL(approval.origin).host.toUpperCase()}</Text>
        <Text position={[0, 0.72, 0]} fontSize={0.033} color={XR_THEME.muted} anchorX="center">{approval.origin}</Text>
        <mesh position={[0, 0.58, 0]}><planeGeometry args={[1.84, 0.008]} /><meshBasicMaterial color="#334155" /></mesh>

        <Text position={[0, 0.34, 0]} fontSize={approval.kind === 'transaction' ? 0.085 : 0.06} color="#e2e8f0" anchorX="center" maxWidth={1.85} textAlign="center">{primary.toUpperCase()}</Text>
        <Text position={[0, -0.02, 0]} fontSize={0.041} color="#cbd5e1" anchorX="center" maxWidth={1.82} textAlign="center">{secondary.slice(0, 900)}</Text>
        <Text position={[0, -0.49, 0]} fontSize={0.034} color={XR_THEME.muted} anchorX="center" maxWidth={1.82} textAlign="center">{detail}</Text>
        <Text position={[0, -0.76, 0]} fontSize={0.035} color={warning.startsWith('DANGER') || warning.startsWith('WARNING') ? '#fda4af' : '#fbbf24'} anchorX="center" maxWidth={1.82} textAlign="center">{warning}</Text>

        {wallet.status !== 'unlocked' && approval.kind !== 'switch' ? (
          <Button3D label={wallet.status === 'no-vault' ? 'SET UP VAULT TO CONTINUE' : 'UNLOCK VAULT TO REVIEW'} onPress={onRequestUnlock} position={[0, -1.04, 0]} width={1.75} height={0.24} fontSize={0.043} color="#7c3aed" />
        ) : (
          <Button3D label={armed ? approval.kind === 'transaction' ? 'CONFIRM & SEND' : 'APPROVE ON WRIST' : 'REVIEW…'} onPress={() => resolveApproval(true)} position={[0, -1.04, 0]} width={1.75} height={0.25} fontSize={0.047} color={warning.startsWith('DANGER') ? '#be123c' : '#059669'} disabled={!canApprove} />
        )}
        <Button3D label="REJECT REQUEST" onPress={() => resolveApproval(false)} position={[0, -1.34, 0]} width={1.75} height={0.21} fontSize={0.043} color="#475569" />
        <Text position={[0, -1.46, 0]} fontSize={0.03} color={XR_THEME.faint} anchorX="center">{queued ? `${queued} MORE REQUESTS WAITING` : 'PAGE PAUSED UNTIL YOU DECIDE'}</Text>
      </group>
    </group>
  );
}
