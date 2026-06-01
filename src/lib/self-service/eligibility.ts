// AAR-940 Self-Service: Eligibility — welche Anfragen bekommen einen
// Self-Service-FlowLink? Rein + deterministisch (TDD).
//
// Self-Service = native Funnel (source NULL) + Cluster-LP (kfz_gutachter_lp).
// sv_embed hat seinen eigenen Pfad (embed-A WA-an-SV / embed-B Dispatch) und
// wird hier (v1) NICHT als Self-Service ausgegeben.

export type SelfServiceAnfrage = {
  source: string | null
  telefon: string | null
  email: string | null
  konvertiert_zu_lead_id: string | null
  status: string | null
}

// Quellen, die einen Self-Service-FlowLink bekommen. sv_embed ist bewusst NICHT
// dabei (eigener Pfad). `null` = nativer Funnel.
const SELF_SERVICE_SOURCES = new Set<string | null>([null, 'kfz_gutachter_lp'])

// Status, in denen ein Self-Service-Link keinen Sinn ergibt.
const TERMINAL_STATI = new Set(['konvertiert', 'storniert', 'abgeschlossen', 'abgebrochen'])

/** Hat die Anfrage einen brauchbaren Kontaktkanal (Telefon ODER Email)? */
export function hatKontakt(a: { telefon: string | null; email: string | null }): boolean {
  const tel = (a.telefon ?? '').trim()
  const mail = (a.email ?? '').trim()
  return tel.length >= 6 || mail.includes('@')
}

export function istSelfServiceFaehig(a: SelfServiceAnfrage): boolean {
  if (!SELF_SERVICE_SOURCES.has(a.source ?? null)) return false
  if (a.konvertiert_zu_lead_id) return false
  if (a.status && TERMINAL_STATI.has(a.status)) return false
  return hatKontakt(a)
}
