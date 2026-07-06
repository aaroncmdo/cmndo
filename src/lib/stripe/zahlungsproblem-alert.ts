/**
 * Zahlungsproblem-Alert — Admin-Benachrichtigung bei Stripe-Rueckbuchung,
 * Chargeback oder stornierter Zahlung.
 *
 * Produkt-Entscheidung: KEIN automatischer Entzug von Portal-Zugang oder
 * Werbebudget — ein Mensch entscheidet nach Pruefung. Diese Datei erzeugt
 * ausschliesslich Alerts (Admin-Task + ggf. Team-WhatsApp fuer Disputes).
 */

import { createLinkedTask } from '@/lib/tasks/create-task'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import type { TaskEntityType } from '@/lib/tasks/types'

// ---- Typen ----

export type ZahlungsproblemArt = 'refund' | 'dispute' | 'canceled'

export interface ZahlungsproblemParams {
  art: ZahlungsproblemArt
  partnerTyp: 'sv' | 'org' | 'unbekannt'
  partnerId: string | null
  partnerName: string
  betragCent: number
  grund?: string | null
  stripeRef: string
}

// ---- Reiner Textbauer (testbar ohne Seiteneffekte) ----

const ARTLABELS: Record<ZahlungsproblemArt, string> = {
  refund: 'Rückerstattung',
  dispute: 'Chargeback',
  canceled: 'Zahlung storniert',
}

/**
 * Baut den deutschen Alert-Text für Admins. Pure Funktion, keine Seiteneffekte.
 * Verwendet echte Umlaute (AGENTS.md §Sprache).
 */
export function buildZahlungsproblemText(p: ZahlungsproblemParams): string {
  const euro = (p.betragCent / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const label = ARTLABELS[p.art]
  const grundTeil = p.grund ? ` (Grund: ${p.grund})` : ''
  return (
    `Stripe ${label}: ${p.partnerName} — ${euro} €${grundTeil}. ` +
    `Bitte Portal-Zugang + Werbebudget des Partners prüfen (kein automatischer Entzug).`
  )
}

// ---- Alert-Dispatcher ----

/**
 * Feuert den Admin-Alert (Task + optional Team-WhatsApp für Disputes).
 * NON-FATAL: wirft nie — Fehler werden geloggt und als { ok: false } zurückgegeben,
 * damit ein Alert-Fehlschlag den Webhook-Flow nicht unterbricht (AGENTS.md §Server-Actions).
 */
export async function meldePartnerZahlungsproblem(
  p: ZahlungsproblemParams,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const text = buildZahlungsproblemText(p)
    const prioritaet = p.art === 'dispute' ? 'kritisch' : 'dringend'

    // Entity-Verknüpfung nur wenn Partner bekannt (SV-Onboarding-Flow)
    const entityType: TaskEntityType | undefined =
      p.partnerTyp === 'sv' ? 'sv_onboarding' : undefined
    const entityId: string | undefined =
      p.partnerTyp === 'sv' && p.partnerId ? p.partnerId : undefined

    await createLinkedTask({
      titel: `Stripe ${ARTLABELS[p.art]}: ${p.partnerName}`,
      beschreibung: text,
      prioritaet,
      typ: 'zahlung-problem',
      trigger_event: `stripe_${p.art}`,
      auto_erstellt: true,
      ...(entityType ? { entity_type: entityType } : {}),
      ...(entityId ? { entity_id: entityId } : {}),
    })

    // Nur bei Disputes: zusätzlich Team-WhatsApp (Bank-forciertes Fraud-Signal)
    if (p.art === 'dispute') {
      await notifyTeamWhatsApp(text)
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[zahlungsproblem-alert] Alert fehlgeschlagen:', msg)
    return { ok: false, error: msg }
  }
}

// ---- Partner-Resolver ----

/**
 * Löst aus einem Stripe-Event heraus den betroffenen Partner auf.
 * Reihenfolge: meta.gutachter_id -> piId-Lookup auf sachverstaendige -> unbekannt.
 *
 * @param db  Supabase Admin-Client
 * @param meta  event.data.object.metadata
 * @param piId  payment_intent id (aus charge oder pi-Objekt)
 */
export async function resolvePartnerFromStripe(
  db: any,
  meta: Record<string, string>,
  piId: string | null,
): Promise<{ partnerTyp: 'sv' | 'org' | 'unbekannt'; partnerId: string | null; partnerName: string }> {
  // Pfad 1: gutachter_id direkt in Metadata (SV-Onboarding-Flow)
  if (meta.gutachter_id) {
    const svId = meta.gutachter_id
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id, profile_id')
      .eq('id', svId)
      .maybeSingle()
    const name = sv ? await resolveSvName(db, sv) : `SV ${svId}`
    return { partnerTyp: 'sv', partnerId: svId, partnerName: name }
  }

  // Pfad 2: piId-Lookup via stripe_anzahlung_payment_intent_id
  if (piId) {
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id, profile_id')
      .eq('stripe_anzahlung_payment_intent_id', piId)
      .maybeSingle()

    if (sv) {
      const name = await resolveSvName(db, sv)
      return { partnerTyp: 'sv', partnerId: sv.id, partnerName: name }
    }

    return { partnerTyp: 'unbekannt', partnerId: null, partnerName: `PI ${piId}` }
  }

  // Pfad 3: gänzlich unbekannt
  return { partnerTyp: 'unbekannt', partnerId: null, partnerName: 'unbekannter Partner' }
}

// ---- intern ----

async function resolveSvName(
  db: any,
  sv: { id: string; profile_id: string | null },
): Promise<string> {
  if (!sv.profile_id) return `SV ${sv.id}`

  const { data: profile } = await db
    .from('profiles')
    .select('vorname, nachname, email')
    .eq('id', sv.profile_id)
    .maybeSingle()

  if (!profile) return `SV ${sv.id}`

  const { vorname, nachname, email } = profile as {
    vorname: string | null
    nachname: string | null
    email: string | null
  }

  if (vorname || nachname) {
    return [vorname, nachname].filter(Boolean).join(' ')
  }
  if (email) return email
  return `SV ${sv.id}`
}
