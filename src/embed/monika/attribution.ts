// AAR-939 · Monika-Embed · Stream 4 — Attribution-Capture
//
// gclid + utm_* aus window.location.search UND aus localStorage (First-Touch,
// 90 Tage TTL). ga_client_id aus dem _ga-Cookie wenn vorhanden.

import type { Attribution } from './types'

const STORE_KEY = '_cl_attribution'
const TTL_MS = 90 * 24 * 60 * 60 * 1000
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

interface Stored {
  ts: number
  data: Attribution
}

function readStore(): Attribution {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Stored
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) {
      localStorage.removeItem(STORE_KEY)
      return {}
    }
    return parsed.data ?? {}
  } catch {
    return {}
  }
}

function writeStore(data: Attribution): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ts: Date.now(), data } satisfies Stored))
  } catch {
    /* localStorage blockiert (Privatmodus) — Attribution dann nur fuer diese Session */
  }
}

function readGaClientId(): string | undefined {
  try {
    const m = document.cookie.match(/_ga=GA\d\.\d\.(\d+\.\d+)/)
    return m?.[1]
  } catch {
    return undefined
  }
}

/**
 * Erfasst Attribution: URL-Parameter haben Vorrang, fehlende Werte aus dem
 * Store. Neue URL-Werte persistieren (First-Touch bleibt, solange die URL keine
 * neuen Parameter bringt).
 */
export function captureAttribution(): Attribution {
  const stored = readStore()
  const url = new URLSearchParams(window.location.search)

  const fromUrl: Attribution = {}
  const gclid = url.get('gclid')
  if (gclid) fromUrl.gclid = gclid
  for (const k of UTM_KEYS) {
    const v = url.get(k)
    if (v) fromUrl[k] = v
  }

  const merged: Attribution = { ...stored, ...fromUrl }
  if (Object.keys(fromUrl).length > 0) writeStore(merged)

  const ga = readGaClientId()
  if (ga) merged.ga_client_id = ga

  return merged
}
