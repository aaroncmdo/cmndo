'use client'

// Single-Slot Active-Contact-Store.
// Welche Sidebar-Card ist aktuell als Chat-Modal offen? Nur eine zur Zeit
// — Klick auf eine andere schliesst die vorherige automatisch.

import { create } from 'zustand'

export type ActiveContact = 'kb' | 'sv' | null

type State = {
  active: ActiveContact
  setActive: (next: ActiveContact) => void
  close: () => void
}

export const useActiveContactStore = create<State>((set) => ({
  active: null,
  setActive: (next) => set({ active: next }),
  close: () => set({ active: null }),
}))
