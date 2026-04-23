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
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : undefined as unknown as Storage)),
      partialize: (state) => ({ pinned: state.pinned, openFallId: null }),
      // Pins überleben Reload, aber beim Reload ist kein Fenster offen
      // (openFallId=null) — sonst poppt beim Laden überraschend ein Chat auf.
    },
  ),
)
