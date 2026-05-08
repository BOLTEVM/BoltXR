'use client';

import { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox } from '@react-three/drei';
import { Interactive } from '@react-three/xr';
import { Group, MeshStandardMaterial } from 'three';

interface SecurityPinPadProps {
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  title?: string;
  error?: string;
  lockoutUntil?: number | null;
}

function PinButton({ value, onSelect, position, disabled }: { value: string; onSelect: (v: string) => void; position: [number, number, number]; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <Interactive
      onSelectStart={() => { if (!disabled) { setPressed(true); onSelect(value); } }}
      onSelectEnd={() => setPressed(false)}
      onHover={() => !disabled && setHovered(true)}
      onBlur={() => { setHovered(false); setPressed(false); }}
    >
      <group position={position}>
        <RoundedBox args={[0.2, 0.2, 0.05]} radius={0.02} smoothness={4}>
          <meshStandardMaterial
            color={disabled ? "#0f172a" : (pressed ? "#8b5cf6" : (hovered ? "#4c1d95" : "#1e293b"))}
            emissive={pressed ? "#a78bfa" : (hovered ? "#6d28d9" : "#000")}
            emissiveIntensity={hovered ? 0.5 : 0}
            metalness={0.8}
            roughness={0.2}
            transparent={disabled}
            opacity={disabled ? 0.3 : 1}
          />
        </RoundedBox>
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.08}
          color={disabled ? "#334155" : "white"}
          anchorX="center"
          anchorY="middle"
        >
          {value}
        </Text>
      </group>
    </Interactive>
  );
}

export default function SecurityPinPad({ onConfirm, onCancel, title = "ENTER SECURITY PIN", error, lockoutUntil }: SecurityPinPadProps) {
  const [pin, setPin] = useState("");
  const groupRef = useRef<Group>(null);
  const shakeRef = useRef(0);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const isLockedOut = !!(lockoutUntil && Date.now() < lockoutUntil);

  useFrame((state, delta) => {
    // Shake animation logic
    if (shakeRef.current > 0) {
      shakeRef.current -= delta * 5;
      if (groupRef.current) {
        groupRef.current.position.x = Math.sin(state.clock.elapsedTime * 50) * 0.05 * shakeRef.current;
      }
    } else if (groupRef.current) {
      groupRef.current.position.x = 0;
    }

    // Lockout timer logic
    if (isLockedOut) {
      setTimeRemaining(Math.ceil((lockoutUntil! - Date.now()) / 1000));
    }
  });

  // Trigger shake on error change
  useEffect(() => {
    if (error) shakeRef.current = 1;
  }, [error]);

  const handleSelect = (val: string) => {
    if (isLockedOut) return;

    if (val === "CLR") {
      setPin("");
    } else if (val === "OK") {
      if (pin.length >= 4) {
        onConfirm(pin);
        setPin(""); // Clear after attempt
      }
    } else if (pin.length < 8) {
      setPin(prev => prev + val);
    }
  };

  const buttons = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["CLR", "0", "OK"]
  ];

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
        {/* Background Panel */}
        <RoundedBox args={[1, 1.4, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.05]}>
          <meshStandardMaterial
            color={isLockedOut ? "#450a0a" : "#0f172a"}
            transparent
            opacity={0.9}
            metalness={0.9}
            roughness={0.1}
          />
        </RoundedBox>

        {/* Title */}
        <Text
          position={[0, 0.55, 0.03]}
          fontSize={0.06}
          color={isLockedOut ? "#ef4444" : "white"}
          anchorX="center"
        >
          {isLockedOut ? "SYSTEM LOCKOUT" : title}
        </Text>

        {/* PIN Display (Dots) or Lockout Timer */}
        <group position={[0, 0.35, 0.03]}>
          {isLockedOut ? (
            <Text
              fontSize={0.1}
              color="#ef4444"
            >
              {timeRemaining}s
            </Text>
          ) : (
            <Text
              fontSize={0.12}
              color={error ? "#ef4444" : "#8b5cf6"}
              letterSpacing={0.2}
            >
              {pin.split("").map(() => "•").join("") || "----"}
            </Text>
          )}
          {error && !isLockedOut && (
            <Text position={[0, -0.15, 0]} fontSize={0.04} color="#ef4444">
              {error}
            </Text>
          )}
        </group>

        {/* Keypad Grid */}
        <group position={[0, -0.15, 0.03]}>
          {buttons.map((row, i) => (
            <group key={i} position={[0, -i * 0.25, 0]}>
              {row.map((val, j) => (
                <PinButton
                  key={val}
                  value={val}
                  position={[(j - 1) * 0.25, 0, 0]}
                  onSelect={handleSelect}
                  disabled={isLockedOut}
                />
              ))}
            </group>
          ))}
        </group>

        {/* Cancel Button */}
        <Interactive onSelect={onCancel}>
          <group position={[0, -0.6, 0.03]}>
            <Text fontSize={0.04} color="#94a3b8">
              CANCEL
            </Text>
          </group>
        </Interactive>
      </Float>
    </group>
  );
}
