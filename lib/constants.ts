export type ButtonAction = "modal" | "drawer" | "dropdown" | "toast" | "send" | "receive";

export interface ButtonDef {
  label: string;
  color: string;
  action: ButtonAction;
  icon: string;
}

/** Wallet mode: every gesture button opens a real wallet surface. */
export const WALLET_BUTTONS: ButtonDef[] = [
  { label: "ASSETS",   color: "#22d3ee", action: "modal",   icon: "◈" },
  { label: "HISTORY",  color: "#f472b6", action: "drawer",  icon: "⧖" },
  { label: "SEND",     color: "#a855f7", action: "send",    icon: "↗" },
  { label: "RECEIVE",  color: "#34d399", action: "receive", icon: "↙" },
];

/** Playground mode: demonstrates each gesture-driven overlay primitive. */
export const PLAYGROUND_BUTTONS: ButtonDef[] = [
  { label: "MODAL",    color: "#22d3ee", action: "modal",    icon: "◈" },
  { label: "DRAWER",   color: "#f472b6", action: "drawer",   icon: "⬡" },
  { label: "MENU",     color: "#fbbf24", action: "dropdown", icon: "✦" },
  { label: "NOTIFY",   color: "#fb923c", action: "toast",    icon: "◎" },
];

export interface Rect { x: number; y: number; w: number; h: number; }
