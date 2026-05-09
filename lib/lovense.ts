/**
 * Headless LovenseManager for Handtracking Wallet
 * Handles communication with Lovense Connect (Local Loopback)
 */
export class LovenseManager {
    private static instance: LovenseManager;
    private baseUrl = 'https://127-0-0-1.lovense.club:30010';
    private developerToken: string = '';
    private devices: any[] = [];
    private isConnected: boolean = false;
    private isScanning: boolean = false;

    private constructor() {
        this.developerToken = typeof window !== 'undefined' ? localStorage.getItem('LOVENSE_TOKEN') || '' : '';
        if (this.developerToken) {
            this.scan();
        }
    }

    static getInstance() {
        if (!LovenseManager.instance) {
            LovenseManager.instance = new LovenseManager();
        }
        return LovenseManager.instance;
    }

    setToken(token: string) {
        this.developerToken = token;
        localStorage.setItem('LOVENSE_TOKEN', token);
        this.scan();
    }

    async scan() {
        if (this.isScanning) return;
        this.isScanning = true;
        try {
            const resp = await fetch(`${this.baseUrl}/GetToys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: this.developerToken })
            });
            const data = await resp.json();
            if (data.code === 200) {
                this.devices = Object.values(data.data.toys || {});
                this.isConnected = true;
                console.log('Lovense: Devices discovered', this.devices);
            }
        } catch (e) {
            this.isConnected = false;
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
        
        const body: any = {
            token: this.developerToken,
            command: 'Function',
            action: `${cmd}:${strength}`,
            timeOut: 10
        };

        try {
            await fetch(`${this.baseUrl}/DoFunction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
                    timeOut: 10
                })
            });
        } catch (e) {
            console.error('Lovense: Stop failed', e);
        }
    }

    getDevices() { return this.devices; }
    getIsConnected() { return this.isConnected; }
}

export const lovense = LovenseManager.getInstance();
