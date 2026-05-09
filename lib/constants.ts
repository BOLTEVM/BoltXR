export type ButtonAction = "modal" | "drawer" | "dropdown" | "toast";

export interface ButtonDef {
  label: string;
  color: string;
  action: ButtonAction;
  icon: string;
}

export const FRAMEWORK_BUTTONS: ButtonDef[] = [
  { label: "MODAL",    color: "#00ffe0", action: "modal",    icon: "◈" },
  { label: "DRAWER",   color: "#ff6af5", action: "drawer",   icon: "⬡" },
  { label: "MENU",     color: "#ffe94a", action: "dropdown", icon: "✦" },
  { label: "NOTIFY",   color: "#ff9f43", action: "toast",    icon: "◎" },
];

export const GENERIC_BUTTONS: ButtonDef[] = [
  { label: "ASSETS",    color: "#00ffe0", action: "modal",    icon: "₿" },
  { label: "HISTORY",   color: "#ff6af5", action: "drawer",   icon: "⚖" },
  { label: "SWAP",      color: "#ffe94a", action: "dropdown", icon: "⇄" },
  { label: "ALERT",     color: "#ff9f43", action: "toast",    icon: "!" },
];

export interface Rect { x: number; y: number; w: number; h: number; }
