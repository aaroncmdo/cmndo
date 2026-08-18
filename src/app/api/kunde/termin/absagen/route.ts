// AAR-448: POST /api/kunde/termin/absagen
// Kunde sagt Termin ab — Status auf 'abgesagt' + Task für KB + Timeline.
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
      | { termin_id?: string; grund?: string | null }
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
    const auth = await kannTerminFallVerwalten(admin, { id: user.id, email: user.email ?? null }, effFallId)
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: 'Keine Berechtigung.' },
        { status: 403 },
      )
    }
    const kundenbetreuerId = auth.kundenbetreuerId

    const grund = body.grund ? String(body.grund).slice(0, 500) : null

    const { error: updErr } = await admin
      .from('gutachter_termine')
      .update({
        status: 'abgesagt',
        cancelled_at: new Date().toISOString(),
        notiz_kunde: grund,
      })
      .eq('id', termin.id)
    if (updErr) {
      return NextResponse.json(
        { success: false, error: `Termin-Update fehlgeschlagen: ${updErr.message}` },
        { status: 500 },
      )
    }

    // SP2c: abgesagtes KB-Beratungs-Event aus Google + CalDAV entfernen. Fail-soft.
    if (termin.typ === 'kb_beratung') await entferneKbTerminOut(termin.id)

    const empfaengerRolle = termin.typ === 'kb_beratung' ? 'kundenbetreuer' : 'dispatch'
    const fallNr = auth.claimNummer ?? effFallId.slice(0, 8)
    const titel =
      termin.typ === 'kb_beratung'
        ? `Kunde hat Beratungstermin abgesagt (${fallNr})`
        : `Kunde hat Besichtigungstermin abgesagt (${fallNr})`
    const beschreibung = [
      grund ? `Grund: ${grund}` : 'Kein Grund angegeben.',
      termin.start_zeit ? `War geplant: ${new Date(termin.start_zeit).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      // Ueber diesen Task erfaehrt das Team von der Absage. Das try faengt ihn nicht.
      const { error: absageTaskFehler } = await admin.from('tasks').insert({
        fall_id: effFallId,
        titel,
        beschreibung,
        typ: 'termin_absage',
        status: 'offen',
        prioritaet: 'dringend',
        empfaenger_rolle: empfaengerRolle,
        empfaenger_user_id: empfaengerRolle === 'kundenbetreuer' ? kundenbetreuerId : null,
        entity_type: 'termin',
        entity_id: termin.id,
        auto_erstellt: true,
        erstellt_von_id: user.id,
      })
      if (absageTaskFehler) {
        console.error(`[termin/absagen] Task NICHT erstellt (Fall ${effFallId}) — Absage bleibt unbemerkt:`, absageTaskFehler.message)
      }
    } catch (e) {
      console.error('[termin/absagen] Task-Insert fehlgeschlagen:', e)
    }

    try {
      await admin.from('timeline').insert({
        fall_id: effFallId,
        typ: 'termin',
        titel: 'Kunde hat Termin abgesagt',
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
    console.error('[termin/absagen] Unbekannter Fehler:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
