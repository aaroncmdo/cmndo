import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * AAR-147 / Spec §3 Phase 6: Inaktiv-Cron für FlowLinks.
 *
 * Läuft alle 30 Minuten. Wenn ein FlowLink seit mehr als 2 Stunden erstellt
 * ist und noch nicht geöffnet wurde (geoeffnet_am IS NULL),
 * dann wird für den zuständigen Dispatcher ein Task „Token-Link inaktiv"
 * angelegt — damit der MA den Kunden nachträglich anruft.
 *
 * Dedupe: Pro Lead gibt es höchstens EINEN nicht erledigten Inaktiv-Task.
 * Solange er offen (oder in Bearbeitung) ist, kommt kein neuer dazu — erst
 * wenn er erledigt wurde und der Link immer noch ungeöffnet ist, entsteht
 * wieder einer. Siehe den Kommentar an der Dedupe-Query.
 *
 * NOTE: flow_links hat die Spalte `erstellt_am` (nicht `created_at`) —
 * siehe Schema. Das wurde im ursprünglichen page.tsx-Refactor übersehen.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  // FlowLinks die seit >2h inaktiv sind (nie geöffnet). WICHTIG (Aaron 27.07., FlowLink-Audit):
  // KEIN .eq('status','offen') — 'offen' wird NIE geschrieben (Default 'erstellt', danach nur
  // 'geoeffnet'/'abgeschlossen'), der Filter lieferte 0 Zeilen => der Cron feuerte NIE. Ein nie
  // geoeffneter Link hat geoeffnet_am IS NULL; ein abgeschlossener wurde immer erst geoeffnet.
  // geoeffnet_am IS NULL ist also die korrekte + hinreichende Bedingung.
  const { data: stale } = await db
    .from('flow_links')
    .select('id, lead_id, erstellt_am, leads(vorname, nachname, telefon)')
    .is('geoeffnet_am', null)
    .lt('erstellt_am', twoHoursAgo)

  let created = 0
  let skipped = 0

  for (const fl of (stale ?? []) as Array<{
    id: string
    lead_id: string | null
    erstellt_am: string
    leads: unknown
  }>) {
    if (!fl.lead_id) continue

    // Dedupe: Es gibt bereits einen NICHT ERLEDIGTEN Task fuer diesen Lead.
    //
    // ⚠ Vorher stand hier `.gte('created_at', fourHoursAgo)` — es zaehlte also nur, ob in
    // den letzten 4 Stunden einer angelegt wurde, NICHT ob noch einer offen ist. Ein Task,
    // den niemand abgearbeitet hat, wurde damit alle 4 Stunden erneut erzeugt, und der alte
    // blieb offen daneben stehen. Prod-Messung 13.08.: **1483 offene „Token-Link inaktiv"-
    // Tasks** aus 18 Tagen fuer eine Handvoll Leads — 86 % aller 1729 offenen Dispatch-Tasks.
    // Das Dashboard zeigt die 10 neuesten; jede andere Aufgabe war damit unsichtbar
    // (gefunden, weil die Haenger-Tasks aus #5223 nicht mehr ankamen).
    //
    // Der Funktions-Kommentar oben beschrieb das richtige Verhalten bereits („wenn bereits
    // ein offener Task existiert ODER in den letzten 4h einer angelegt wurde") — nur der
    // Code prueft es nicht. Jetzt gilt: solange der Task nicht erledigt ist, kommt kein
    // neuer dazu. `neq('erledigt')` statt `eq('offen')`, damit ein Task in Bearbeitung
    // ebenfalls keinen Nachschub ausloest.
    const { count: existing } = await db
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', fl.lead_id)
      .eq('task_typ', 'inaktiv_followup')
      .neq('status', 'erledigt')

    if ((existing ?? 0) > 0) {
      skipped++
      continue
    }

    // Lead-Info für die Task-Beschreibung (nested-FK normalisieren)
    const leadRel = fl.leads
    const lead = (Array.isArray(leadRel) ? leadRel[0] : leadRel) as
      | { vorname: string | null; nachname: string | null; telefon: string | null }
      | null
    const name = `${lead?.vorname ?? ''} ${lead?.nachname ?? ''}`.trim() || 'Kunde'
    const tel = lead?.telefon ?? '—'
    const hoursInactive = Math.floor((Date.now() - new Date(fl.erstellt_am).getTime()) / (60 * 60 * 1000))

    await db.from('tasks').insert({
      typ: 'dispatch',
      task_typ: 'inaktiv_followup',
      titel: `Token-Link inaktiv — Kunde anrufen: ${name}`,
      beschreibung: `FlowLink seit ${hoursInactive}h inaktiv. Telefon: ${tel}. Bitte Kunde anrufen und Status klären.`,
      status: 'offen',
      // Ops-Test 13.08.: war 'dringend'. Ein Kunde, der seinen Link noch nicht
      // geoeffnet hat, ist Nachfass-ROUTINE, kein Notfall. Weil dieser Cron und
      // dispatch-lead-alert zusammen ~94 % aller offenen Dispatch-Aufgaben stellen
      // und beide pauschal 'dringend' setzten, stand am Ende JEDE Aufgabe auf
      // 'dringend' -- das Feld trug kein Signal mehr. 'normal' gibt ihm eines zurueck.
      prioritaet: 'normal',
      entity_type: 'lead',
      entity_id: fl.lead_id,
      lead_id: fl.lead_id,
      faellig_am: new Date().toISOString(),
      auto_erstellt: true,
    })

    created++
  }

  return NextResponse.json({
    ok: true,
    checked: stale?.length ?? 0,
    created,
    skipped,
  })
}
