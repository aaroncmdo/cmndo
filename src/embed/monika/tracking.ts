// AAR-939 · Monika-Embed · Stream 4 — Client-Tracking
//
// Zwei Kanaele: (1) window.dataLayer der Host-Seite (GTM/GA4) mit Marker
// cl_event_source='monika', (2) Beacon an claimondo.de/api/embed-track
// (Stream 5). Beide best-effort, blockieren nie.

import type { MonikaConfig } from './types'

type MonikaEvent =
  | 'monika_shown'
  | 'monika_open'
  | 'monika_qualify_yes'
  | 'monika_qualify_no'
  | 'monika_form_shown'
  | 'monika_anfrage_submit'

interface DataLayerWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>
}

export function track(cfg: MonikaConfig, event: MonikaEvent, extra?: Record<string, unknown>): void {
  const props: Record<string, unknown> = {
    event,
    cl_event_source: 'monika',
    source: cfg.source,
    cluster: cfg.cluster ?? undefined,
    stadt: cfg.stadtSlug ?? undefined,
    embed_site: cfg.embedSiteSlug ?? undefined,
    ...extra,
  }

  // (1) dataLayer der Host-Seite
  try {
    const w = window as DataLayerWindow
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(props)
  } catch {
    /* kein dataLayer auf der Host-Seite */
  }

  // (2) Beacon an claimondo.de (Stream-5-Endpoint). text/plain + credentials:'omit'
  // → CORS-safelisted (kein Preflight) UND ACAO:* gilt (keine Credentials) → kein
  // cross-origin ERR_FAILED (sendBeacon mit application/json + Cookies vs ACAO:*
  // schlug fehl). keepalive ueberlebt den Page-Unload wie sendBeacon; der Server
  // liest req.json() unabhaengig vom Content-Type.
  try {
    const url = `${cfg.base}/api/embed-track`
    const body = JSON.stringify(props)
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch {
    /* Beacon best-effort */
  }
}
