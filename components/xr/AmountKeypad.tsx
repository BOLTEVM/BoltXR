'use client';

import Button3D, { XR_THEME } from './Button3D';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'DEL'],
];

interface AmountKeypadProps {
  value: string;
  onChange: (value: string) => void;
  /** Max fractional digits accepted (the asset's decimals). */
  decimals: number;
  onMax?: () => void;
  maxDisabled?: boolean;
  position?: [number, number, number];
}

/** Apply one keypad press to a decimal amount string. */
export function applyAmountKey(current: string, key: string, decimals: number): string {
  if (key === 'DEL') return current.slice(0, -1);
  if (key === '.') {
    if (decimals === 0 || current.includes('.')) return current;
    return (current || '0') + '.';
  }
  if (current.length >= 24) return current;
  const fraction = current.split('.')[1];
  if (fraction !== undefined && fraction.length >= decimals) return current;
  return current === '0' ? key : current + key;
}

/** 3D numeric keypad for entering token amounts (shared by send and swap). */
export default function AmountKeypad({ value, onChange, decimals, onMax, maxDisabled, position = [0, 0, 0] }: AmountKeypadProps) {
  return (
    <group position={position}>
      <group position={[-0.1, 0, 0]}>
        {KEYS.map((row, i) => row.map((key, j) => (
          <Button3D
            key={key}
            label={key}
            onPress={() => onChange(applyAmountKey(value, key, decimals))}
            position={[(j - 1) * 0.3, -i * 0.2, 0]}
            width={0.27}
            height={0.17}
            fontSize={key === 'DEL' ? 0.045 : 0.07}
            color={XR_THEME.raised}
          />
        )))}
      </group>
      {onMax && (
        <Button3D label="MAX" onPress={onMax} position={[0.55, 0, 0]} width={0.22} height={0.17} fontSize={0.045} color={XR_THEME.brand} disabled={maxDisabled} />
      )}
      <Button3D label="CLR" onPress={() => onChange('')} position={[0.55, -0.2, 0]} width={0.22} height={0.17} fontSize={0.045} />
    </group>
  );
}
