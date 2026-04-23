import { create } from 'zustand'
import type { InboxThread } from '@/app/api/chat/inbox-threads/route'

export type PinnedChat = InboxThread & {
  open: boolean
}

type GlobalChatState = {
  pinned: PinnedChat[]
  pin: (thread: InboxThread) => void
  unpin: (fallId: string) => void
  toggleOpen: (fallId: string) => void
  close: (fallId: string) => void
}

export const useGlobalChatStore = create<GlobalChatState>((set) => ({
  pinned: [],

  pin: (thread) =>
    set((s) => {
      if (s.pinned.some((p) => p.fallId === thread.fallId)) {
        return { pinned: s.pinned.map((p) => p.fallId === thread.fallId ? { ...p, open: true } : p) }
      }
      return { pinned: [...s.pinned, { ...thread, open: true }] }
    }),

  unpin: (fallId) =>
    set((s) => ({ pinned: s.pinned.filter((p) => p.fallId !== fallId) })),

  toggleOpen: (fallId) =>
    set((s) => ({
      pinned: s.pinned.map((p) =>
        p.fallId === fallId ? { ...p, open: !p.open } : p,
      ),
    })),

  close: (fallId) =>
    set((s) => ({
      pinned: s.pinned.map((p) =>
        p.fallId === fallId ? { ...p, open: false } : p,
      ),
    })),
}))
