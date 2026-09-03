// AAR-448: POST /api/kunde/termin/absagen
// Kunde sagt Termin ab — Status auf 'abgesagt' + Task für KB + Timeline.
// Termine-Hub Phase 2: Owner-Guard generalisiert (Kunde ODER Flottenmanager-Firma);
// bezug-native Termine (fall_id NULL) via bezug_typ/bezug_id aufgeloest.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kannTerminFallVerwalten } from '@/lib/termine/kann-termin-verwalten'
import { storniereTerminAlsKunde } from '@/lib/termine/storno-kunde'

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

    // Fachlogik geteilt mit /api/v1/termin-stornieren (Token-Weg fuer KI-Assistenten) —
    // beide Wege muessen dieselben Nebenwirkungen ausloesen, siehe lib/termine/storno-kunde.ts.
    const res = await storniereTerminAlsKunde(admin, {
      terminId: termin.id,
      grund: body.grund ?? null,
      quelle: 'portal',
      erstelltVonId: user.id,
      kundenbetreuerId,
      claimNummer: auth.claimNummer,
    })
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error },
        { status: res.code === 'db_fehler' ? 500 : 404 },
      )
    }

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
