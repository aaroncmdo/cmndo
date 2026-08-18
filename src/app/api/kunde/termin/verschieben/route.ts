// AAR-448: POST /api/kunde/termin/verschieben
// Kunde wünscht Terminverschiebung — Flag am Termin + Task für KB/Dispatch +
// Timeline-Eintrag. Kein direkter Kalender-Eingriff; KB koordiniert.
// Termine-Hub Phase 2: Owner-Guard generalisiert (Kunde ODER Flottenmanager-Firma);
// bezug-native Termine (fall_id NULL) via bezug_typ/bezug_id aufgeloest.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { entferneKbTerminOut } from '@/lib/termine/kb-termin-sync'
import { kannTerminFallVerwalten } from '@/lib/termine/kann-termin-verwalten'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { termin_id?: string; wunsch_zeitraum?: string | null }
      | null
    if (!body || !body.termin_id) {
      return NextResponse.json(
        { success: false, error: 'termin_id ist Pflicht.' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Nicht angemeldet.' },
        { status: 401 },
      )
    }

    const admin = createAdminClient()
    const { data: termin } = await admin
      .from('gutachter_termine')
      .select('id, fall_id, typ, status, start_zeit, bezug_typ, bezug_id')
      .eq('id', body.termin_id)
      .maybeSingle()
    if (!termin) {
      return NextResponse.json(
        { success: false, error: 'Termin nicht gefunden.' },
        { status: 404 },
      )
    }
    // Bezug-aware: bezug-native Termine haben fall_id = NULL (bezug_typ/bezug_id kanonisch).
    const effFallId =
      (termin.fall_id as string | null) ??
      (termin.bezug_typ === 'fall' ? (termin.bezug_id as string | null) : null)
    if (!effFallId) {
      return NextResponse.json(
        { success: false, error: 'Termin nicht gefunden.' },
        { status: 404 },
      )
    }
    // Geteilter Owner-Guard: Kunde-Owner ODER Flottenmanager (volle Rechte im Namen der Firma).
    // Liefert zugleich kundenbetreuer/claim_nummer fuer Task + Timeline (kein zweiter v_claim_full-Read).
    const auth = await kannTerminFallVerwalten(admin, { id: user.id, email: user.email ?? null }, effFallId)
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Keine Berechtigung.' },
        { status: 403 },
      )
    }
    const kundenbetreuerId = auth.kundenbetreuerId

    const wunsch = body.wunsch_zeitraum ? String(body.wunsch_zeitraum).slice(0, 500) : null

    // Termin auf 'verschoben' setzen (vom Kunden angefragt).
    const { error: updErr } = await admin
      .from('gutachter_termine')
      .update({ status: 'verschoben', notiz_kunde: wunsch })
      .eq('id', termin.id)
    if (updErr) {
      return NextResponse.json(
        { success: false, error: `Termin-Update fehlgeschlagen: ${updErr.message}` },
        { status: 500 },
      )
    }

    // SP2c: bei KB-Beratung das externe Kalender-Event entfernen. Fail-soft.
    if (termin.typ === 'kb_beratung') await entferneKbTerminOut(termin.id)

    // Task für KB bzw. Dispatch (bei SV-Terminen Dispatch, bei KB-Terminen KB)
    const empfaengerRolle = termin.typ === 'kb_beratung' ? 'kundenbetreuer' : 'dispatch'
    const fallNr = auth.claimNummer ?? effFallId.slice(0, 8)
    const titel =
      termin.typ === 'kb_beratung'
        ? `Kunde wünscht Verschiebung des Beratungstermins (${fallNr})`
        : `Kunde wünscht Verschiebung des Besichtigungstermins (${fallNr})`
    const beschreibung = [
      wunsch ? `Wunsch-Zeitraum: ${wunsch}` : 'Kein Wunsch-Zeitraum angegeben.',
      termin.start_zeit ? `Ursprünglicher Termin: ${new Date(termin.start_zeit).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      // Ueber diesen Task erfaehrt das Team vom Verschiebungswunsch. Das try faengt ihn nicht.
      const { error: verschiebTaskFehler } = await admin.from('tasks').insert({
        fall_id: effFallId,
        titel,
        beschreibung,
        typ: 'termin_verschiebung',
        status: 'offen',
        prioritaet: 'dringend',
        empfaenger_rolle: empfaengerRolle,
        empfaenger_user_id: empfaengerRolle === 'kundenbetreuer' ? kundenbetreuerId : null,
        entity_type: 'termin',
        entity_id: termin.id,
        auto_erstellt: true,
        erstellt_von_id: user.id,
      })
      if (verschiebTaskFehler) {
        console.error(`[termin/verschieben] Task NICHT erstellt (Fall ${effFallId}) — Wunsch bleibt unbemerkt:`, verschiebTaskFehler.message)
      }
    } catch (e) {
      console.error('[termin/verschieben] Task-Insert fehlgeschlagen:', e)
      // non-critical — Termin-Status-Update ist bereits persistiert
    }

    // Timeline
    try {
      await admin.from('timeline').insert({
        fall_id: effFallId,
        typ: 'termin',
        titel: 'Kunde hat Terminverschiebung angefragt',
        beschreibung,
        erstellt_von: user.id,
      })
    } catch { /* non-critical */ }

    revalidatePath(`/kunde/faelle/${effFallId}`)
    revalidatePath('/kunde')
    // AAR-628: KB + Admin teilen sich /faelle/[id] nach Route-Konsolidierung.
    if (kundenbetreuerId) revalidatePath(`/faelle/${effFallId}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[termin/verschieben] Unbekannter Fehler:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
