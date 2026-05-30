// AAR-login-embed · L2 — Login-Widget-Bundle (vanilla, kein Framework).
//
// Liest data-site-id vom <script>-Tag, holt das SV-Branding ueber den
// bestehenden /api/embed/config (Stream 5) und rendert einen auf den
// Gutachter gebrandeten "Anmelden"-Button (Shadow-DOM-isoliert). Klick =
// Top-Level-Navigation zu app.claimondo.de/login?continue=<aktuelle-url>
// (Redirect-Modus — SameSite=lax traegt das Auth-Cookie nach dem Login).
//
// esbuild baut das als IIFE -> laeuft beim Laden sofort (defer/lazyOnload).
//
// Einbinden:
//   <script src="https://claimondo.de/embed/claimondo-login.js"
//           data-site-id="sv-bergmann-koeln" defer></script>
// Optional: data-mode="slot" (in [data-claimondo-login-slot] statt floating),
//           data-label="Mein Bereich", data-login-base, data-continue.

const DEFAULT_LOGIN_BASE = 'https://app.claimondo.de'
const DEFAULT_PRIMARY = '#0D1B3E' // Claimondo Navy (Fallback ohne Config)

interface EmbedConfig {
  theme?: { primary?: string; accent?: string; text?: string; logoUrl?: string; brandedByClaimondo?: boolean }
  paused?: boolean
}

function findScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript
  const all = Array.from(document.getElementsByTagName('script'))
  return all.find((s) => /\/embed\/claimondo-login(\.v\d+)?\.js/.test(s.src)) ?? null
}

function deriveBase(script: HTMLScriptElement): string {
  try {
    return new URL(script.src).origin
  } catch {
    return 'https://claimondo.de'
  }
}

async function loadConfig(base: string, siteId: string): Promise<EmbedConfig | null> {
  try {
    const res = await fetch(`${base}/api/embed/config?site_id=${encodeURIComponent(siteId)}`, {
      credentials: 'omit',
    })
    if (!res.ok) return null
    return (await res.json()) as EmbedConfig
  } catch {
    return null
  }
}

function buildLoginUrl(loginBase: string, continueUrl: string): string {
  return `${loginBase}/login?continue=${encodeURIComponent(continueUrl)}`
}

function renderButton(opts: { label: string; primary: string; logoUrl: string | null; loginUrl: string; mode: string }): void {
  const host = document.createElement('div')
  host.setAttribute('data-claimondo-login', '')
  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = [
    '.cl-login-btn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;',
    "align-items:center;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    'font-size:14px;font-weight:600;line-height:1;color:#fff;background:' + opts.primary + ';',
    'padding:10px 18px;border-radius:10px;transition:filter .15s ease,transform .05s ease;}',
    '.cl-login-btn:hover{filter:brightness(1.08);}',
    '.cl-login-btn:active{transform:scale(.98);}',
    '.cl-login-btn img{height:16px;width:auto;display:block;}',
    '.cl-fixed{position:fixed;top:16px;right:16px;z-index:2147483000;}',
  ].join('')
  root.appendChild(style)

  const a = document.createElement('a')
  a.className = 'cl-login-btn' + (opts.mode === 'slot' ? '' : ' cl-fixed')
  a.href = opts.loginUrl
  a.setAttribute('role', 'button')

  if (opts.logoUrl) {
    const img = document.createElement('img')
    img.src = opts.logoUrl
    img.alt = ''
    a.appendChild(img)
  }
  const span = document.createElement('span')
  span.textContent = opts.label
  a.appendChild(span)
  root.appendChild(a)

  const slot = opts.mode === 'slot' ? document.querySelector('[data-claimondo-login-slot]') : null
  ;(slot ?? document.body).appendChild(host)
}

async function boot(): Promise<void> {
  const script = findScript()
  if (!script) return
  const d = script.dataset
  const base = deriveBase(script)
  const loginBase = d.loginBase || DEFAULT_LOGIN_BASE
  const label = d.label || 'Anmelden'
  const mode = d.mode === 'slot' ? 'slot' : 'float'
  const continueUrl = d.continue || window.location.href

  let primary = DEFAULT_PRIMARY
  let logoUrl: string | null = null
  if (d.siteId) {
    const cfg = await loadConfig(base, d.siteId)
    if (cfg?.paused) return // Site pausiert -> kein Button
    if (cfg?.theme?.primary) primary = cfg.theme.primary
    if (cfg?.theme?.logoUrl) logoUrl = cfg.theme.logoUrl
  }

  renderButton({ label, primary, logoUrl, loginUrl: buildLoginUrl(loginBase, continueUrl), mode })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void boot())
} else {
  void boot()
}
