// AAR-956: Single-Source Termin/Gutachter pro Lead — Typ + reine Darstellungs-
// Helfer. Client-safe (KEIN server-only/Admin-Import), damit das Dispatch-Leads-
// Toggle (Client-Component) sie nutzen kann. Der Loader liegt server-only in
// ./lade-lead-termin-gutachter. Quelle = View public.v_lead_termin_gutachter.

export type GutachterTyp = 'sv' | 'sv_lead'
export type GutachterQuelle = 'gebucht' | 'kunden_pick'

// Eine Zeile der View v_lead_termin_gutachter — die EINE Quelle dafuer, ob ein
// Lead schon einen Termin und/oder einen Gutachter hat (reconciled ueber den
// dispatch-nativen Termin, den self-service-nativen Termin und den Kundenwunsch
// aus der Gutachter-Finder-Anfrage).
export type TerminGutachterInfo = {
  lead_id: string
  termin_id: string | null
  hat_termin: boolean
  termin_start: string | null
  termin_status: string | null
  gutachter_typ: GutachterTyp | null
  gutachter_quelle: GutachterQuelle | null
  gutachter_id: string | null
  hat_gutachter: boolean
  gutachter_name: string | null
  kunden_pick_name: string | null
  gutachter_divergiert: boolean
}

export type Tone = 'success' | 'warning' | 'neutral'

const TERMIN_STATUS_LABEL: Record<string, string> = {
  bestaetigt: 'Bestätigt',
  reserviert: 'Geblockt',
  gegenvorschlag: 'Gegenvorschlag',
}

export function terminStatusLabel(status: string | null): string {
  if (!status) return '—'
  return TERMIN_STATUS_LABEL[status] ?? status
}

export function terminStatusTone(status: string | null): Tone {
  if (status === 'bestaetigt') return 'success'
  if (status === 'reserviert' || status === 'gegenvorschlag') return 'warning'
  return 'neutral'
}

// Status-Token-Klassen (AGENTS.md Status-Ratchet: keine rohen green/amber-Scales
// in neuem Code — die Tokens branden zudem ueber var(--brand-*) mit).
export const TONE_BADGE: Record<Tone, string> = {
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  neutral: 'bg-claimondo-bg text-claimondo-ondo',
}

// Termin-Zeit kompakt in Berlin-Zeit (server + client identisch → keine
// Hydration-Mismatch, daher kein suppressHydrationWarning noetig).
export function formatTerminKurz(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const tag = d.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const zeit = d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${tag} · ${zeit}`
}
