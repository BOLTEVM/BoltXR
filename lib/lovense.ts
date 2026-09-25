/**
 * Headless LovenseManager for Handtracking Wallet
 * Handles communication with Lovense Connect (Local Loopback)
 */
type LovenseToy = { id?: string; name?: string; [key: string]: unknown };

const REQUEST_TIMEOUT_MS = 4000;

export class LovenseManager {
    private static instance: LovenseManager;
    private baseUrl = 'https://127-0-0-1.lovense.club:30010';
    private developerToken: string = '';
    private devices: LovenseToy[] = [];
    private isConnected: boolean = false;
    private isScanning: boolean = false;
    private listeners = new Set<() => void>();

    private constructor() {
        if (typeof window !== 'undefined') {
            try {
                this.developerToken = localStorage.getItem('LOVENSE_TOKEN') || '';
            } catch { /* storage unavailable */ }
            if (this.developerToken) this.scan();
        }
    }

    static getInstance() {
        if (!LovenseManager.instance) {
            LovenseManager.instance = new LovenseManager();
        }
        return LovenseManager.instance;
    }

    /** Subscribe to connection state changes. Returns an unsubscribe function. */
    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private setConnected(connected: boolean) {
        if (this.isConnected === connected) return;
        this.isConnected = connected;
        this.listeners.forEach(l => l());
    }

    setToken(token: string) {
        const trimmed = token.trim();
        if (trimmed === this.developerToken && this.isConnected) return;
        this.developerToken = trimmed;
        if (!trimmed) {
            this.devices = [];
            this.setConnected(false);
            return;
        }
        this.scan();
    }

    async scan() {
        if (this.isScanning || !this.developerToken) return;
        this.isScanning = true;
        try {
            const resp = await fetch(`${this.baseUrl}/GetToys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: this.developerToken }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            const data = await resp.json();
            if (data.code === 200) {
                this.devices = Object.values(data.data?.toys || {}) as LovenseToy[];
                this.setConnected(true);
            } else {
                this.setConnected(false);
            }
        } catch {
            this.setConnected(false);
            console.warn('Lovense: Local loopback not found. Ensure Lovense Connect is running.');
        } finally {
            this.isScanning = false;
        }
    }

    async sendCommand(type: 'vibrate' | 'rotate' | 'air' | 'linear', strength: number) {
        if (!this.isConnected || this.devices.length === 0) return;

        const cmd = type === 'vibrate' ? 'Vibrate' :
                    type === 'rotate' ? 'Rotate' :
                    type === 'air' ? 'Air' : 'Linear';
        const level = Math.max(0, Math.min(20, Math.round(strength)));

        try {
            await fetch(`${this.baseUrl}/DoFunction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: this.developerToken,
                    command: 'Function',
                    action: `${cmd}:${level}`,
                    timeOut: 10,
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (e) {
            console.error('Lovense: Command failed', e);
        }
    }

    async stopAll() {
        if (!this.isConnected) return;
        try {
            await fetch(`${this.baseUrl}/DoFunction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: this.developerToken,
                    command: 'Function',
                    action: 'Stop',
                    timeOut: 10,
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (e) {
            console.error('Lovense: Stop failed', e);
        }
    }

    getDevices() { return this.devices; }
    getIsConnected() { return this.isConnected; }
}

export const lovense = LovenseManager.getInstance();
