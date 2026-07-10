// Enhanced Conversions (Google user-provided data) fuer die gtag.js-Lead-Forms.
// setUserData() normalisiert die Form-Daten + ruft gtag('set','user_data', …)
// VOR dem generate_lead-Event. gtag.js hasht client-seitig SHA-256 und Consent
// Mode redacted user_data automatisch bei ad_user_data=denied → kein Roh-PII
// ohne Einwilligung. toE164/splitName/buildUserData sind pur → vitest-testbar.
// Ambient-Typ fuer window.gtag ist im Projekt deklariert (vgl. trackLpEvent).

/** Deutsche Telefonnummer → E.164 (+49…). Leer/unbrauchbar → ''. */
export function toE164(raw: string | undefined, cc = '49'): string {
  const s = (raw ?? '').replace(/[^\d+]/g, '')
  if (!s || s === '+') return ''
  if (s.startsWith('+')) return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  if (s.startsWith('0')) return '+' + cc + s.slice(1)
  if (s.startsWith(cc)) return '+' + s
  return '+' + cc + s
}

export function splitName(name: string | undefined): { first_name?: string; last_name?: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first_name: parts[0] }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

export type LeadUserData = { name?: string; phone?: string; email?: string }

/** gtag-user_data (rohe, normalisierte Werte; gtag hasht selbst). null wenn leer. */
export function buildUserData(input: LeadUserData): Record<string, unknown> | null {
  const ud: Record<string, unknown> = {}
  const phone = toE164(input.phone)
  if (phone) ud.phone_number = phone
  const email = input.email?.trim().toLowerCase()
  if (email && email.includes('@')) ud.email = email
  const { first_name, last_name } = splitName(input.name)
  const address: Record<string, string> = {}
  if (first_name) address.first_name = first_name
  if (last_name) address.last_name = last_name
  if (Object.keys(address).length > 0) ud.address = address
  return Object.keys(ud).length > 0 ? ud : null
}

/** Setzt gtag user_data fuer Enhanced Conversions (no-op ohne window/gtag/Daten). */
export function setUserData(input: LeadUserData): void {
  if (typeof window === 'undefined' || !window.gtag) return
  const ud = buildUserData(input)
  if (ud) window.gtag('set', 'user_data', ud)
}
