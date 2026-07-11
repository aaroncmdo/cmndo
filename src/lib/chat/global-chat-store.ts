import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { InboxThread } from '@/app/api/chat/inbox-threads/route'

export type PinnedChat = InboxThread & {
  open: boolean
}

type GlobalChatState = {
  pinned: PinnedChat[]
  openFallId: string | null
  pin: (thread: InboxThread) => void
  unpin: (fallId: string) => void
  toggleOpen: (fallId: string) => void
  close: (fallId: string) => void
  closeAll: () => void
}

// Single-Window-Slot: nur 1 Chat gleichzeitig offen.
// openFallId ist Source of Truth, pinned[i].open wird daraus abgeleitet.
function applyOpenState(pinned: PinnedChat[], openFallId: string | null): PinnedChat[] {
  return pinned.map((p) => ({ ...p, open: p.fallId === openFallId }))
}

export const useGlobalChatStore = create<GlobalChatState>()(
  persist(
    (set) => ({
      pinned: [],
      openFallId: null,

      pin: (thread) =>
        set((s) => {
          const existing = s.pinned.some((p) => p.fallId === thread.fallId)
          const basePinned = existing
            ? s.pinned.map((p) => (p.fallId === thread.fallId ? { ...p, ...thread } : p))
            : [...s.pinned, { ...thread, open: false }]
          return {
            pinned: applyOpenState(basePinned, thread.fallId),
            openFallId: thread.fallId,
          }
        }),

      unpin: (fallId) =>
        set((s) => {
          const nextOpen = s.openFallId === fallId ? null : s.openFallId
          return {
            pinned: applyOpenState(s.pinned.filter((p) => p.fallId !== fallId), nextOpen),
            openFallId: nextOpen,
          }
        }),

      toggleOpen: (fallId) =>
        set((s) => {
          const nextOpen = s.openFallId === fallId ? null : fallId
          return {
            pinned: applyOpenState(s.pinned, nextOpen),
            openFallId: nextOpen,
          }
        }),

      close: (fallId) =>
        set((s) => {
          if (s.openFallId !== fallId) return s
          return {
            pinned: applyOpenState(s.pinned, null),
            openFallId: null,
          }
        }),

      closeAll: () =>
        set((s) => ({
          pinned: applyOpenState(s.pinned, null),
          openFallId: null,
        })),
    }),
    {
      name: 'claimondo-pinned-chats',
      // v1 (Phase 2b): PinnedChat ist jetzt claim-nativ (claimId noetig fuer den v2-Thread).
      // Alt-Pins aus localStorage haben kein claimId -> beim Version-Bump verwerfen
      // (Pins sind Convenience, kein kritisches Datum).
      version: 1,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : undefined as unknown as Storage)),
      partialize: (state) => ({ pinned: state.pinned, openFallId: null }),
      migrate: (persisted) => {
        // v0 -> v1: claimId-lose Pins rauswerfen. zustand merged den Rueckgabewert ueber
        // den Initial-State -> die Methoden (pin/unpin/...) bleiben erhalten.
        const state = (persisted ?? {}) as { pinned?: PinnedChat[]; openFallId?: string | null }
        const pinned = (state.pinned ?? []).filter((p) => !!(p as Partial<PinnedChat>).claimId)
        return { pinned, openFallId: null } as unknown as GlobalChatState
      },
      // Pins überleben Reload, aber beim Reload ist kein Fenster offen
      // (openFallId=null) — sonst poppt beim Laden überraschend ein Chat auf.
    },
  ),
)
