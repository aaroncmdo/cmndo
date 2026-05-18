'use client'
// Ambient-Typ für window.gtag: src/types/gtag.d.ts
import { useEffect } from 'react'

export function TrackingHooks() {
  useEffect(() => {
    const fire = (eventName: string) => (e: Event) => {
      const el = e.currentTarget as HTMLElement
      window.gtag?.('event', eventName, {
        event_category: 'cta',
        event_label: el.dataset.tracking ?? '',
      })
    }
    const listeners: Array<[HTMLElement, EventListener]> = []
    document.querySelectorAll<HTMLElement>('[data-tracking^="call-"]').forEach(el => {
      const fn = fire('phone_call'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    document.querySelectorAll<HTMLElement>('[data-tracking^="whatsapp-"]').forEach(el => {
      const fn = fire('whatsapp_click'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    return () => listeners.forEach(([el, fn]) => el.removeEventListener('click', fn))
  }, [])
  return null
}
