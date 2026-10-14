import { create } from "zustand";
import { WsConnectionStatus } from "@/design/components/ConnectionIndicator";

export interface ConnectionStore {
  status: WsConnectionStatus;
  lastSeq: number | null;
  latencyMs: number | null;
  reconnectAttempts: number;
  lastMessageTime: number | null;
  activeSubscriptions: string[];

  setStatus: (status: WsConnectionStatus) => void;
  setLastSeq: (seq: number) => void;
  setLatency: (ms: number) => void;
  incrementAttempts: () => void;
  resetAttempts: () => void;
  setLastMessageTime: (time: number) => void;
  addSubscription: (channel: string) => void;
  removeSubscription: (channel: string) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: "connecting",
  lastSeq: null,
  latencyMs: null,
  reconnectAttempts: 0,
  lastMessageTime: null,
  activeSubscriptions: ["public"],

  setStatus: (status) => set({ status }),
  setLastSeq: (lastSeq) => set({ lastSeq }),
  setLatency: (latencyMs) => set({ latencyMs }),
  incrementAttempts: () => set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetAttempts: () => set({ reconnectAttempts: 0 }),
  setLastMessageTime: (lastMessageTime) => set({ lastMessageTime }),
  addSubscription: (channel) =>
    set((s) => ({
      activeSubscriptions: s.activeSubscriptions.includes(channel)
        ? s.activeSubscriptions
        : [...s.activeSubscriptions, channel],
    })),
  removeSubscription: (channel) =>
    set((s) => ({
      activeSubscriptions: s.activeSubscriptions.filter((c) => c !== channel),
    })),
}));
