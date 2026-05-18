'use client'
// Ambient-Typ für window.gtag: src/types/gtag.d.ts
import { useEffect } from 'react'

type Props = {
  /** Optional: wenn gesetzt, wird lp_variant in jedes Event gemergt. */
  lpVariant?: string
}

export function TrackingHooks({ lpVariant }: Props = {}) {
  useEffect(() => {
    const fire = (eventName: string) => (e: Event) => {
      const el = e.currentTarget as HTMLElement
      const params: Record<string, unknown> = {
        event_category: 'cta',
        event_label: el.dataset.tracking ?? '',
      }
      if (lpVariant) params.lp_variant = lpVariant
      window.gtag?.('event', eventName, params)
    }
    const listeners: Array<[HTMLElement, EventListener]> = []
    document.querySelectorAll<HTMLElement>('[data-tracking^="call-"]').forEach(el => {
      const fn = fire('phone_call'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    document.querySelectorAll<HTMLElement>('[data-tracking^="whatsapp-"]').forEach(el => {
      const fn = fire('whatsapp_click'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    document.querySelectorAll<HTMLElement>('[data-tracking^="form-"]').forEach(el => {
      const fn = fire('form_anchor_click'); el.addEventListener('click', fn); listeners.push([el, fn])
    })
    return () => listeners.forEach(([el, fn]) => el.removeEventListener('click', fn))
  }, [lpVariant])
  return null
}
