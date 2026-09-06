import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'
import { CLOSED_OPERATIVE_STATUS } from '@/lib/claims/terminal-status'

// WS6c (Reduced-Repair-Onboarding): Repair-Nudge-Cron.
//
// Ein reparatur-only-Claim (selbstzahler / kasko-frei) ist per Design UNBETREUT
// (kundenbetreuer_id IS NULL, convert-lead-to-claim.ts:194-196). `send-lead-reminders`
// feuert nur VOR der Claim-Konversion — post-conversion gibt es keinen Antrieb, der die
// Reparatur vorantreibt → die Claims verrotten still. Dieser Cron ist der ERSATZ-ANTRIEB
// ohne KB (Spec §WS6 6c).
//
// Drei Steckenblieb-Zustaende (je eigene Kohorte + Nudge, JEDER Claim je Zustand HOECHSTENS
// EINMAL genudged — Idempotenz via mitteilungen-Marker, kein DDL):
//   1. Keine Werkstatt gewaehlt (reparatur_werkstatt_id IS NULL, >=24h nach Konversion)  -> Kunde
//   2. Termin nicht bestaetigt (reparatur_termine.status='angefragt', >48h)               -> Werkstatt (Fallback Kunde)
//   3. Termin vorbei, nicht erledigt (bestaetigter_termin in der Vergangenheit)           -> Kunde
//
// Muster: send-lead-reminders (Bearer CRON_SECRET, force-dynamic, Admin-Client, Kohorten
// mit Alters-Fenstern, non-fatale Einzel-Sends, JSON-Summary) + re-termin-eskalation
// (Idempotenz-Marker) + werkstatt-auftrag-phase (Reparatur-Lifecycle).
//
// Schedule: NICHT vercel.json (existiert nicht) — der einzige Trigger ist die VPS-Crontab
// (docs/vps-crontab.md). Diese Route MUSS dort noch registriert werden (Ops-Task):
//   0 * * * *  cron-call.sh /api/cron/repair-reminders
// Vorher liefert der Endpoint sauber 404 und feuert nie.

export const dynamic = 'force-dynamic'

type NudgeState = 'keine-werkstatt' | 'termin-unbestaetigt' | 'termin-ueberfaellig'

// Terminale operative_status-Werte (state-machine.ts: leere Transition + faktisch erledigt).
// Fuer diese Claims ist kein Nudge sinnvoll.
//
// B4-slice-1b: Basis ist jetzt die SSoT CLOSED_OPERATIVE_STATUS. Das behebt zwei Fehler des
// handgerollten Sets: (a) 'abgelehnt' ist NICHT terminal (einfache, nachforderbare Ablehnung —
// der Fall laeuft weiter) und haette nach dem endzustand-Write-Flip die Reparatur-Nudges still
// abgewuergt; (b) die feinen B2-Terminals (reguliert_vollstaendig etc.) fehlten → ein per
// endzustand geschlossener Reparatur-Claim bekam weiter Nudges. 'vs-abgelehnt' bleibt bewusst
// zusaetzlich drin (VS hat abgelehnt → Nudge sinnlos), es ist kein CLOSED_*-Wert.
const TERMINAL_STATUS = new Set([...CLOSED_OPERATIVE_STATUS, 'vs-abgelehnt'])

type ReparaturClaim = {
  id: string
  abrechnungsweg: string | null
  reparatur_werkstatt_id: string | null
  operative_status: string | null
  geschaedigter_user_id: string | null
  lead_id: string | null
  created_at: string | null
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  // ── Reparatur-only, UNBETREUT, nicht-terminale Claims laden ──────────────────
  // abrechnungsweg IN ('selbstzahler','kasko') deckt beide Werkstatt-Wege ab; kasko-gebunden
  // (freie_werkstattwahl===false) wird darunter per istWerkstattReparaturWeg wieder ausgefiltert.
  // Die freie_werkstattwahl liegt auf dem Lead → separat laden.
  const { data: claimsRaw, error: claimsErr } = await db
    .from('claims')
    .select('id, abrechnungsweg, reparatur_werkstatt_id, operative_status, geschaedigter_user_id, lead_id, created_at')
    .in('abrechnungsweg', ['selbstzahler', 'kasko'])
    .is('kundenbetreuer_id', null)
    .limit(200)

  if (claimsErr) {
    console.error('[repair-reminders] claims query:', claimsErr.message)
    return NextResponse.json({ error: claimsErr.message }, { status: 500 })
  }

  const claimsAll = (claimsRaw ?? []) as ReparaturClaim[]
  const nichtTerminal = claimsAll.filter(
    (c) => !TERMINAL_STATUS.has((c.operative_status ?? '').trim()),
  )

  if (nichtTerminal.length === 0) {
    return NextResponse.json({ checked: 0, nudged: 0, cohorts: { keineWerkstatt: 0, terminUnbestaetigt: 0, terminUeberfaellig: 0 } })
  }

  // freie_werkstattwahl vom Lead nachladen, um kasko-gebundene auszuschliessen.
  const leadIds = Array.from(new Set(nichtTerminal.map((c) => c.lead_id).filter((x): x is string => !!x)))
  const freieWahlByLead = new Map<string, boolean | null>()
  const konvertiertByLead = new Map<string, string | null>()
  if (leadIds.length > 0) {
    const { data: leads } = await db
      .from('leads')
      .select('id, freie_werkstattwahl, konvertiert_am')
      .in('id', leadIds)
    for (const l of leads ?? []) {
      freieWahlByLead.set(l.id as string, (l.freie_werkstattwahl as boolean | null) ?? null)
      konvertiertByLead.set(l.id as string, (l.konvertiert_am as string | null) ?? null)
    }
  }

  const reparaturClaims = nichtTerminal.filter((c) => {
    const freieWahl = c.lead_id ? freieWahlByLead.get(c.lead_id) ?? null : null
    return istWerkstattReparaturWeg(c.abrechnungsweg, freieWahl)
  })

  if (reparaturClaims.length === 0) {
    return NextResponse.json({ checked: 0, nudged: 0, cohorts: { keineWerkstatt: 0, terminUnbestaetigt: 0, terminUeberfaellig: 0 } })
  }

  // ── Aktive Reparatur-Termine pro Claim laden (fuer State 2 + 3) ──────────────
  const claimIds = reparaturClaims.map((c) => c.id)
  const { data: termineRaw } = await db
    .from('reparatur_termine')
    .select('id, claim_id, werkstatt_id, status, bestaetigter_termin, created_at')
    .in('claim_id', claimIds)
    .order('created_at', { ascending: false })

  const termine = termineRaw ?? []

  // Idempotenz-Marker: bestehende Repair-Nudge-Mitteilungen fuer diese Claims laden.
  // titel-Praefix 'Repair-Nudge: <state>' pro Zustand — ein Marker = schon genudged.
  const { data: markersRaw } = await db
    .from('mitteilungen')
    .select('kontext_id, titel')
    .eq('kontext_typ', 'fall')
    .in('kontext_id', claimIds)
    .like('titel', 'Repair-Nudge:%')

  const alreadyNudged = new Set<string>() // `${claimId}::${state}`
  for (const m of markersRaw ?? []) {
    const cid = m.kontext_id as string | null
    const titel = (m.titel as string | null) ?? ''
    if (!cid) continue
    if (titel.startsWith('Repair-Nudge: keine-werkstatt')) alreadyNudged.add(`${cid}::keine-werkstatt`)
    else if (titel.startsWith('Repair-Nudge: termin-unbestaetigt')) alreadyNudged.add(`${cid}::termin-unbestaetigt`)
    else if (titel.startsWith('Repair-Nudge: termin-ueberfaellig')) alreadyNudged.add(`${cid}::termin-ueberfaellig`)
  }

  // Werkstatt-user_id fuer State-2-Nudges auflösen (Kunde kann werkstaetten nicht lesen,
  // Admin-Client umgeht RLS).
  const werkstattIds = Array.from(
    new Set(termine.map((t) => t.werkstatt_id as string | null).filter((x): x is string => !!x)),
  )
  const werkstattUserById = new Map<string, string | null>()
  if (werkstattIds.length > 0) {
    const { data: werkstaetten } = await db
      .from('werkstaetten')
      .select('id, user_id')
      .in('id', werkstattIds)
    for (const w of werkstaetten ?? []) {
      werkstattUserById.set(w.id as string, (w.user_id as string | null) ?? null)
    }
  }

  // Titel trägt den Idempotenz-Marker (Praefix 'Repair-Nudge: <state> ·'); Inhalt = Nutzertext.
  const TITEL: Record<NudgeState, string> = {
    'keine-werkstatt': 'Repair-Nudge: keine-werkstatt · Werkstatt wählen',
    'termin-unbestaetigt': 'Repair-Nudge: termin-unbestaetigt · Termin bestätigen',
    'termin-ueberfaellig': 'Repair-Nudge: termin-ueberfaellig · Reparatur bestätigen',
  }

  let nudged = 0
  const cohorts = { keineWerkstatt: 0, terminUnbestaetigt: 0, terminUeberfaellig: 0 }

  // Non-fatal Kunden-Nudge (In-App-Mitteilung an den Claim-Owner).
  async function nudgeKunde(claim: ReparaturClaim, state: NudgeState, inhalt: string): Promise<boolean> {
    if (!claim.geschaedigter_user_id) return false // accountloser Lead: kein In-App-Empfaenger
    try {
      const created = await createMitteilung({
        empfaenger_id: claim.geschaedigter_user_id,
        empfaenger_rolle: 'kunde',
        kategorie: 'update',
        titel: TITEL[state],
        inhalt,
        kontext_typ: 'fall',
        kontext_id: claim.id,
        prioritaet: 'hoch',
      })
      return !!created
    } catch (err) {
      console.error(`[repair-reminders] Kunde-Nudge (non-fatal) claim=${claim.id} state=${state}:`, err)
      return false
    }
  }

  // Non-fatal Werkstatt-Nudge (Fallback auf Kunde, wenn keine Werkstatt-user_id auflösbar).
  async function nudgeWerkstattOrKunde(
    claim: ReparaturClaim,
    werkstattUser: string | null,
    werkstattInhalt: string,
    kundeFallbackInhalt: string,
  ): Promise<boolean> {
    if (werkstattUser) {
      try {
        const created = await createMitteilung({
          empfaenger_id: werkstattUser,
          empfaenger_rolle: 'werkstatt',
          kategorie: 'update',
          titel: TITEL['termin-unbestaetigt'],
          inhalt: werkstattInhalt,
          kontext_typ: 'fall',
          kontext_id: claim.id,
          route_url: `/werkstatt/auftraege/${claim.id}`, // W1.7: Deep-Link statt Liste
          prioritaet: 'hoch',
        })
        return !!created
      } catch (err) {
        console.error(`[repair-reminders] Werkstatt-Nudge (non-fatal) claim=${claim.id}:`, err)
        return false
      }
    }
    // Fallback: Kunde nudgen, damit der Vorgang nicht stillsteht.
    return nudgeKunde(claim, 'termin-unbestaetigt', kundeFallbackInhalt)
  }

  for (const claim of reparaturClaims) {
    const claimTermine = termine.filter((t) => t.claim_id === claim.id)

    // ── State 1: Keine Werkstatt gewählt (>=24h nach Konversion) ──────────────
    if (
      !claim.reparatur_werkstatt_id &&
      !alreadyNudged.has(`${claim.id}::keine-werkstatt`)
    ) {
      const konvertiert = claim.lead_id ? konvertiertByLead.get(claim.lead_id) ?? null : null
      const anker = konvertiert ?? claim.created_at
      if (anker && new Date(anker) <= h24) {
        const ok = await nudgeKunde(
          claim,
          'keine-werkstatt',
          'Für Ihre Reparatur fehlt noch die Werkstatt. Wählen Sie jetzt eine Werkstatt in Ihrem Vorgang, damit es weitergeht.',
        )
        if (ok) {
          cohorts.keineWerkstatt += 1
          nudged += 1
        }
      }
    }

    // ── State 2: Termin angefragt, >48h nicht bestätigt ───────────────────────
    if (!alreadyNudged.has(`${claim.id}::termin-unbestaetigt`)) {
      const angefragt = claimTermine.find(
        (t) => (t.status as string | null) === 'angefragt' && t.created_at && new Date(t.created_at as string) <= h48,
      )
      if (angefragt) {
        const wUser = angefragt.werkstatt_id ? werkstattUserById.get(angefragt.werkstatt_id as string) ?? null : null
        const ok = await nudgeWerkstattOrKunde(
          claim,
          wUser,
          'Ein Kunde wartet seit über 48 Stunden auf die Bestätigung seines Reparatur-Wunschtermins. Bitte bestätige oder schlage einen neuen Termin vor.',
          'Ihre Werkstatt hat den Wunschtermin noch nicht bestätigt. Wir haken bei der Werkstatt nach — bei Fragen können Sie uns hier schreiben.',
        )
        if (ok) {
          cohorts.terminUnbestaetigt += 1
          nudged += 1
        }
      }
    }

    // ── State 3: Bestätigter Termin liegt in der Vergangenheit, nicht erledigt ─
    if (!alreadyNudged.has(`${claim.id}::termin-ueberfaellig`)) {
      const ueberfaellig = claimTermine.find((t) => {
        const status = (t.status as string | null) ?? ''
        if (status === 'erledigt' || status === 'storniert') return false
        const best = t.bestaetigter_termin as string | null
        return !!best && new Date(best) < now
      })
      if (ueberfaellig) {
        const ok = await nudgeKunde(
          claim,
          'termin-ueberfaellig',
          'War Ihre Reparatur erfolgreich? Bitte bestätigen Sie den Abschluss in Ihrem Vorgang, damit wir alles Weitere für Sie erledigen können.',
        )
        if (ok) {
          cohorts.terminUeberfaellig += 1
          nudged += 1
        }
      }
    }
  }

  console.log(
    `[repair-reminders] ${reparaturClaims.length} Reparatur-Claims geprüft, ${nudged} genudged`,
    cohorts,
  )

  return NextResponse.json({
    checked: reparaturClaims.length,
    nudged,
    cohorts,
  })
}
