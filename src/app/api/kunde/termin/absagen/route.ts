// AAR-448: POST /api/kunde/termin/absagen
// Kunde sagt Termin ab — Status auf 'abgesagt' + Task für KB + Timeline.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('id, fall_id, typ, status, start_zeit')
      .eq('id', body.termin_id)
      .maybeSingle()
    if (!termin || !termin.fall_id) {
      return NextResponse.json(
        { success: false, error: 'Termin nicht gefunden.' },
        { status: 404 },
      )
    }

    // CMM-44 SP-A: kundenbetreuer_id ist eine faelle<->claims-DUP-Spalte —
    // wird über den claims-Embed gelesen (claims.kundenbetreuer_id ist SSoT).
    // CMM-44 SP-A3: Aktennummer kommt aus claims.claim_nummer (gleiches Embed).
    const { data: fall } = await admin
      .from('faelle')
      .select('id, kunde_id, lead_id, claims:claim_id(kundenbetreuer_id, claim_nummer)')
      .eq('id', termin.fall_id)
      .maybeSingle()
    if (!fall) {
      return NextResponse.json(
        { success: false, error: 'Fall nicht gefunden.' },
        { status: 404 },
      )
    }
    const claim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    const kundenbetreuerId = (claim?.kundenbetreuer_id as string | null) ?? null

    let owned = fall.kunde_id === user.id
    if (!owned && fall.lead_id) {
      const { data: lead } = await admin
        .from('leads')
        .select('email')
        .eq('id', fall.lead_id)
        .maybeSingle()
      owned = !!(
        lead?.email &&
        user.email &&
        lead.email.toLowerCase() === user.email.toLowerCase()
      )
    }
    if (!owned) {
      return NextResponse.json(
        { success: false, error: 'Keine Berechtigung.' },
        { status: 403 },
      )
    }

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

    const empfaengerRolle = termin.typ === 'kb_beratung' ? 'kundenbetreuer' : 'dispatch'
    const fallNr = claim?.claim_nummer ?? fall.id.slice(0, 8)
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
      await admin.from('tasks').insert({
        fall_id: fall.id,
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
    } catch (e) {
      console.error('[termin/absagen] Task-Insert fehlgeschlagen:', e)
    }

    try {
      await admin.from('timeline').insert({
        fall_id: fall.id,
        typ: 'termin',
        titel: 'Kunde hat Termin abgesagt',
        beschreibung,
        erstellt_von: user.id,
      })
    } catch { /* non-critical */ }

    revalidatePath(`/kunde/faelle/${fall.id}`)
    revalidatePath('/kunde')
    revalidatePath('/kunde/faelle')
    // AAR-628: KB + Admin teilen sich /faelle/[id] nach Route-Konsolidierung.
    if (kundenbetreuerId) revalidatePath(`/faelle/${fall.id}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[termin/absagen] Unbekannter Fehler:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
