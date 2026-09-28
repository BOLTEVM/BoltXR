'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import { Group } from 'three';
import Button3D, { XR_THEME } from './xr/Button3D';
import { useCountdown } from '@/hooks/useCountdown';

interface SecurityPinPadProps {
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  error?: string;
  lockoutUntil?: number | null;
  minLength?: number;
  busy?: boolean;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['CLR', '0', 'DEL'],
];
const MAX_LENGTH = 12;

export default function SecurityPinPad({
  onConfirm, onCancel, title = 'ENTER SECURITY PIN', subtitle, error, lockoutUntil, minLength = 4, busy = false,
}: SecurityPinPadProps) {
  const [pin, setPin] = useState('');
  const groupRef = useRef<Group>(null);
  const shakeRef = useRef(0);
  const secondsLeft = useCountdown(lockoutUntil);
  const lockedOut = secondsLeft > 0;
  const disabled = lockedOut || busy;

  // Shake animation (visual only — no React state per frame)
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (shakeRef.current > 0) {
      shakeRef.current = Math.max(0, shakeRef.current - delta * 4);
      groupRef.current.position.x = Math.sin(state.clock.elapsedTime * 50) * 0.04 * shakeRef.current;
    } else {
      groupRef.current.position.x = 0;
    }
  });

  useEffect(() => {
    if (error) shakeRef.current = 1;
  }, [error]);

  const submit = useCallback(() => {
    if (disabled || pin.length < minLength) return;
    onConfirm(pin);
    setPin('');
  }, [disabled, pin, minLength, onConfirm]);

  const press = useCallback((key: string) => {
    if (disabled) return;
    if (key === 'CLR') setPin('');
    else if (key === 'DEL') setPin(p => p.slice(0, -1));
    else setPin(p => (p.length < MAX_LENGTH ? p + key : p));
  }, [disabled]);

  // Physical keyboard support on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('DEL');
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, submit, onCancel]);

  const dots = Array.from({ length: Math.max(minLength, pin.length) }, (_, i) => (i < pin.length ? '*' : '-')).join(' ');
  const status = lockedOut
    ? `TOO MANY ATTEMPTS · RETRY IN ${secondsLeft}s`
    : busy ? 'VERIFYING…' : error || subtitle || `ENTER AT LEAST ${minLength} DIGITS`;

  return (
    <group ref={groupRef}>
      <RoundedBox args={[1.05, 1.6, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.05]}>
        <meshStandardMaterial color={lockedOut ? '#450a0a' : XR_THEME.surface} transparent opacity={0.94} metalness={0.8} roughness={0.2} />
      </RoundedBox>

      <Text position={[0, 0.68, 0.01]} fontSize={0.065} color={lockedOut ? XR_THEME.danger : XR_THEME.text} anchorX="center">
        {lockedOut ? 'VAULT LOCKOUT' : title}
      </Text>
      <Text position={[0, 0.54, 0.01]} fontSize={0.09} color={error ? XR_THEME.danger : '#a78bfa'} anchorX="center" letterSpacing={0.1}>
        {dots}
      </Text>
      <Text position={[0, 0.43, 0.01]} fontSize={0.032} color={error || lockedOut ? XR_THEME.danger : XR_THEME.muted} anchorX="center" maxWidth={0.95} textAlign="center">
        {status}
      </Text>

      <group position={[0, 0.24, 0.01]}>
        {KEYS.map((row, i) => row.map((key, j) => (
          <Button3D
            key={key}
            label={key}
            onPress={() => press(key)}
            position={[(j - 1) * 0.27, -i * 0.21, 0]}
            width={0.24}
            height={0.18}
            fontSize={key.length > 1 ? 0.045 : 0.075}
            color={key.length > 1 ? XR_THEME.neutral : XR_THEME.raised}
            disabled={disabled}
          />
        )))}
      </group>

      <Button3D label="CANCEL" onPress={onCancel} position={[-0.26, -0.68, 0.01]} width={0.46} height={0.14} />
      <Button3D label="CONFIRM" onPress={submit} position={[0.26, -0.68, 0.01]} width={0.46} height={0.14}
        color={XR_THEME.brand} disabled={disabled || pin.length < minLength} />
    </group>
  );
}
