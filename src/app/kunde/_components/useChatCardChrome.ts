'use client'

import { useEffect } from 'react'
import { useActiveContactStore, type ActiveContact } from './useActiveContactStore'
import { useKundeUnreadByKanal } from './useKundeUnreadByKanal'

/**
 * Geteilte Chrome-Logik der Kontakt-Chat-Cards (KundenbetreuerCard + GutachterCard).
 * Kapselt den Single-Slot-Open-State (useActiveContactStore), den Unread-Zaehler pro
 * Kanal und den ESC/Scroll-Lock/aside-z-index-Effekt beim geoeffneten Modal. Vorher war
 * dieser Block in beiden Cards verbatim dupliziert (inkl. eines toten cardRef/cardRect).
 */
export function useChatCardChrome(
  storeKey: Exclude<ActiveContact, null>,
  currentUserId: string | null,
  kanal: Parameters<typeof useKundeUnreadByKanal>[1],
): { chatOpen: boolean; setChatOpen: (open: boolean) => void; unread: number } {
  const active = useActiveContactStore((s) => s.active)
  const setActive = useActiveContactStore((s) => s.setActive)
  const chatOpen = active === storeKey
  const { count: unread, reset: resetUnread } = useKundeUnreadByKanal(currentUserId, kanal)

  const setChatOpen = (open: boolean) => {
    if (open) resetUnread()
    setActive(open ? storeKey : null)
  }

  // ESC schliesst das Modal + hebt die Sidebar temporaer ueber das Backdrop-Blur
  // (aside z-40 -> z-1102 ueber Backdrop z-1100), sonst legt sich der Blur ueber die
  // Source-Card. Scroll-Lock waehrend das Modal offen ist.
  useEffect(() => {
    if (!chatOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    const aside = document.querySelector('aside.kunde-sidebar') as HTMLElement | null
    let originalZ = ''
    if (aside) {
      originalZ = aside.style.zIndex
      aside.style.zIndex = '1102'
      aside.setAttribute('data-chat-open', 'true')
    }
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      if (aside) {
        aside.style.zIndex = originalZ
        aside.removeAttribute('data-chat-open')
      }
    }
    // setChatOpen ist bewusst nicht in den Deps: es wird pro Render neu erzeugt,
    // ein Einschluss wuerde den Effekt bei jedem Render neu aufsetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen])

  return { chatOpen, setChatOpen, unread }
}
