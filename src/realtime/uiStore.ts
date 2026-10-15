import { create } from "zustand";

export interface UIState {
  timeRange: string;
  selectedAlertId: string | null;
  selectedIdentityId: string | null;
  isIncidentDrawerOpen: boolean;
  isCommandPaletteOpen: boolean;
  isMobileNavOpen: boolean;
  soundEnabled: boolean;

  setTimeRange: (range: string) => void;
  setSelectedAlertId: (id: string | null) => void;
  setSelectedIdentityId: (id: string | null) => void;
  setIncidentDrawerOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleSound: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  timeRange: "Live",
  selectedAlertId: null,
  selectedIdentityId: null,
  isIncidentDrawerOpen: false,
  isCommandPaletteOpen: false,
  isMobileNavOpen: false,
  soundEnabled: true,

  setTimeRange: (timeRange) => set({ timeRange }),
  setSelectedAlertId: (selectedAlertId) =>
    set({ selectedAlertId, isIncidentDrawerOpen: Boolean(selectedAlertId) }),
  setSelectedIdentityId: (selectedIdentityId) => set({ selectedIdentityId }),
  setIncidentDrawerOpen: (isIncidentDrawerOpen) => set({ isIncidentDrawerOpen }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
  setMobileNavOpen: (isMobileNavOpen) => set({ isMobileNavOpen }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
}));
