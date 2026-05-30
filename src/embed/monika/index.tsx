/** @jsxImportSource preact */
// AAR-939 · Monika-Embed · Stream 4 — Boot-Entry
//
// Liest data-*-Attribute vom <script>-Tag, leitet die Config ab, prueft die
// Origin (server-seitig im Webhook) und rendert das Preact-Widget in einen
// Shadow-DOM. Zwei Modi:
//   • data-site-id      → sv_embed: Config via /api/embed/config (Stream 5)
//   • data-cluster + …  → kfz_gutachter_lp: alles aus data-*-Attributen
//
// esbuild baut das als IIFE → laeuft beim Laden sofort (defer/lazyOnload).

import { render } from 'preact'
import type { MonikaConfig, MonikaTheme } from './types'
import { loadConfig } from './api'
import { injectBacklink } from './backlink'
import { track } from './tracking'
import { STYLES } from './styles'
import { MonikaApp } from './app'

const DEFAULT_THEME: Omit<MonikaTheme, 'logoUrl'> = {
  primary: '#0D1B3E', // Claimondo Navy
  accent: '#4573A2', // Claimondo Light
  text: '#0F2429', // ink
  brandedByClaimondo: true,
}

// Default-Logo bis das Claimondo-Siegel (siegel-claimondo-partner-v2.svg)
// geliefert ist — dann nur diese Konstante umstellen.
const DEFAULT_LOGO_PATH = '/brand/logo-mark.svg'

function findScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript
  const all = Array.from(document.getElementsByTagName('script'))
  return all.find((s) => /\/embed\/monika(\.v\d+)?\.js/.test(s.src)) ?? null
}

function deriveBase(script: HTMLScriptElement): string {
  try {
    return new URL(script.src).origin
  } catch {
    return 'https://claimondo.de'
  }
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, '')
  return digits.length >= 8 ? digits : null
}

function mount(cfg: MonikaConfig): void {
  const host = document.createElement('div')
  host.setAttribute('data-monika-widget', '')
  const root = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)

  const style = document.createElement('style')
  style.textContent = STYLES
  root.appendChild(style)

  host.style.setProperty('--monika-primary', cfg.theme.primary)
  host.style.setProperty('--monika-accent', cfg.theme.accent)
  host.style.setProperty('--monika-text', cfg.theme.text)

  const mountPoint = document.createElement('div')
  root.appendChild(mountPoint)
  render(<MonikaApp cfg={cfg} />, mountPoint)

  track(cfg, 'monika_shown')
}

async function boot(): Promise<void> {
  const script = findScript()
  if (!script) return
  const d = script.dataset
  const base = deriveBase(script)

  // SEO-Backlink IMMER (Pflicht, Variante A + B), unabhaengig vom Modus.
  injectBacklink(base)

  let cfg: MonikaConfig | null = null

  if (d.siteId) {
    // ── sv_embed: Config vom Server ──
    const remote = await loadConfig(base, d.siteId)
    if (remote?.paused) return // Site pausiert → Widget rendert nicht
    const theme: MonikaTheme = remote?.theme ?? { ...DEFAULT_THEME, logoUrl: `${base}${DEFAULT_LOGO_PATH}` }
    cfg = {
      source: 'sv_embed',
      base,
      theme,
      telefon: remote?.telefon ?? null,
      whatsapp: normalizePhone(remote?.whatsapp ?? null),
      embedSiteSlug: d.siteId,
      siteToken: remote?.site_token ?? null,
      cluster: null,
      stadtSlug: null,
    }
  } else if (d.cluster) {
    // ── kfz_gutachter_lp: alles aus data-* (Claimondo-eigene LP) ──
    const theme: MonikaTheme = {
      primary: d.primary || DEFAULT_THEME.primary,
      accent: d.accent || DEFAULT_THEME.accent,
      text: d.text || DEFAULT_THEME.text,
      logoUrl: d.logo || `${base}${DEFAULT_LOGO_PATH}`,
      brandedByClaimondo: false,
    }
    cfg = {
      source: 'kfz_gutachter_lp',
      base,
      theme,
      telefon: d.phone || null,
      whatsapp: normalizePhone(d.wa),
      embedSiteSlug: null,
      siteToken: null,
      cluster: d.cluster,
      stadtSlug: d.stadt || null,
    }
  } else {
    return // weder site-id noch cluster
  }

  mount(cfg)
}

// Lazy-Init: erst nach DOMContentLoaded (LCP-neutral)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot())
} else {
  void boot()
}
