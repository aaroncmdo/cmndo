'use client'
// Ambient-Typ für window.gtag: src/types/gtag.d.ts
import { useEffect } from 'react'

type Props = {
  /**
   * LP-Variante (z. B. 'test_b'). Wenn gesetzt, wird `lp_variant` in jedes
   * Event gemergt. Loose `string` statt Literal-Union, damit künftige
   * Varianten ohne Component-Patch wirken — Wert kommt aus `LP_VARIANT`
   * in `src/app/kfzgutachter-lp/track.ts`.
   */
  lpVariant?: string
  /**
   * Quellen-Kennzeichnung (z. B. 'kfzgutachter-ads-lp'). Wenn gesetzt,
   * wird `source` in jedes Event gemergt — symmetrisch zu trackLpEvent,
   * damit GA4-Filter beide Event-Typen (Klick + Form-Submit) erfassen.
   */
  source?: string
}

export function TrackingHooks({ lpVariant, source }: Props = {}) {
  useEffect(() => {
    const fire = (eventName: string) => (e: Event) => {
      const el = e.currentTarget as HTMLElement
      const params: Record<string, unknown> = {
        event_category: 'cta',
        event_label: el.dataset.tracking ?? '',
      }
      if (lpVariant) params.lp_variant = lpVariant
      if (source) params.source = source
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
  }, [lpVariant, source])
  return null
}
