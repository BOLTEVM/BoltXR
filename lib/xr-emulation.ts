'use client';

type XrEmulationStatus = {
  enabled: boolean;
  reason?: string;
};

declare global {
  interface Window {
    __boltXrEmulationDevice?: unknown;
  }
}

const XR_EMULATION_FLAG = process.env.NEXT_PUBLIC_ENABLE_XR_EMULATION === 'true';
const XR_FORCE_EMULATION_FLAG = process.env.NEXT_PUBLIC_FORCE_XR_EMULATION === 'true';

export const shouldAttemptXrEmulation = () => XR_EMULATION_FLAG;
export const isForcedXrEmulation = () => XR_FORCE_EMULATION_FLAG;

export async function initXrEmulation(): Promise<XrEmulationStatus> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { enabled: false, reason: 'server' };
  }

  if (!XR_EMULATION_FLAG) {
    return { enabled: false, reason: 'flag-disabled' };
  }

  if (window.__boltXrEmulationDevice) {
    return { enabled: true, reason: 'already-installed' };
  }

  if ('xr' in navigator && !XR_FORCE_EMULATION_FLAG) {
    return { enabled: false, reason: 'native-webxr-present' };
  }

  const { XRDevice, metaQuest3 } = await import('iwer');
  const device = new XRDevice(metaQuest3);

  device.primaryInputMode = 'hand';
  device.installRuntime({
    globalObject: window,
    polyfillLayers: true,
  });

  window.__boltXrEmulationDevice = device;

  return {
    enabled: true,
    reason: XR_FORCE_EMULATION_FLAG ? 'forced' : 'installed',
  };
}
