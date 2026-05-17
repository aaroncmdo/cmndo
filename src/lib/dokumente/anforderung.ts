// AAR-327 (Child 7 von AAR-320): Dokument-Anforderung durch Kanzlei/SV/KB/Admin.
//
// Flow:
//   1. Rolle-Check: Nur Kanzlei/SV/KB/Admin dürfen anfordern.
//   2. Katalog-Lookup: Slot muss existieren UND rolle IN anforderbar_von.
//   3. INSERT pflichtdokumente (status='ausstehend', pflicht=true,
//      angefordert_von_rolle, angefordert_von_user_id, angefordert_am,
//      begruendung, frist, quelle=<rolle>).
//   4. INSERT tasks (task_typ='dokument-nachreichen') für den Kunden, inkl.
//      createLinkedTask → automatische Mitteilung an Kunden via AAR-229 W4.
//   5. Smart-Channel-Mitteilung (WA/SMS/Email) mit Template
//      'dokumente_nachreichen' — der Kunde bekommt neben der In-App-Mitteilung
//      auch eine Push-Nachricht, damit die Frist nicht übersehen wird.
//
// revalidatePath triggert:
//   - /admin/faelle/[id] (KB/Admin sieht neue Anforderung in Liste)
//   - /gutachter/fall/[id] (SV sieht seine eigene Anforderung)
//   - /kunde (Kunde sieht neuen Task)

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getKatalogSlot } from './katalog'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { sendSmartChannel } from '@/lib/communications/channel-router'

export type AnforderungsRolle = 'kanzlei' | 'sachverstaendiger' | 'kundenbetreuer' | 'admin'

const ERLAUBTE_ROLLEN: AnforderungsRolle[] = [
  'kanzlei',
  'sachverstaendiger',
  'kundenbetreuer',
  'admin',
]

const ROLLE_LABELS: Record<AnforderungsRolle, string> = {
  kanzlei: 'der Kanzlei',
  sachverstaendiger: 'dem Gutachter',
  kundenbetreuer: 'Ihrem Ansprechpartner',
  admin: 'Claimondo',
}

/**
 * Fordert ein Dokument beim Kunden an. Legt einen pflichtdokumente-Row an,
 * erstellt einen Kunden-Task + verschickt eine Mitteilung.
 *
 * @param fallId — UUID des Falls
 * @param slotId — dokument_katalog.slot_id (z.B. 'fahrzeugschein')
 * @param begruendung — wird dem Kunden angezeigt (Pflicht, min 20 Zeichen)
 * @param fristIso — ISO-Datum (YYYY-MM-DD) der Frist
 */
export async function dokumentAnfordern(
  fallId: string,
  slotId: string,
  begruendung: string,
  fristIso: string,
): Promise<{ success: boolean; error?: string; pflichtdokId?: string }> {
  // --- 1. Auth + Rolle --------------------------------------------------
  const supabase = await createClient()
  const userRes = await supabase.auth.getUser()
  const user = userRes.data?.user
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as AnforderungsRolle | null
  if (!rolle || !ERLAUBTE_ROLLEN.includes(rolle)) {
    return { success: false, error: 'Keine Berechtigung zum Anfordern' }
  }

  // --- 2. Input validieren ---------------------------------------------
  const trimmed = (begruendung ?? '').trim()
  if (trimmed.length < 20) {
    return { success: false, error: 'Begründung muss mindestens 20 Zeichen lang sein' }
  }
  if (!fristIso || Number.isNaN(new Date(fristIso).getTime())) {
    return { success: false, error: 'Ungültige Frist' }
  }

  // --- 3. Katalog-Lookup + anforderbar_von-Check -----------------------
  const slot = await getKatalogSlot(supabase, slotId)
  if (!slot) return { success: false, error: `Unbekannter Dokumententyp: ${slotId}` }
  if (!slot.anforderbar_von.includes(rolle)) {
    return {
      success: false,
      error: `Ihre Rolle (${rolle}) darf "${slot.label}" nicht anfordern`,
    }
  }

  // --- 4. Fall laden (für Lead-Kontaktdaten + revalidate) --------------
  const admin = createAdminClient()
  // CMM-44 SP-A: kundenbetreuer_id wird hier nicht genutzt — aus dem
  // faelle-Select entfernt (die Spalte liegt jetzt auf claims als SSoT).
  const { data: fall, error: fallErr } = await admin
    .from('faelle')
    .select(
      'id, kunde_id, lead_id, bevorzugter_kanal',
    )
    .eq('id', fallId)
    .single()
  if (fallErr || !fall) {
    return { success: false, error: 'Fall nicht gefunden' }
  }

  let leadTelefon: string | null = null
  let leadEmail: string | null = null
  let leadVorname: string | null = null
  let leadBevorzugterKanal: 'whatsapp' | 'sms' | 'email' | null = null
  if (fall.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('telefon, email, vorname, bevorzugter_kanal')
      .eq('id', fall.lead_id)
      .single()
    leadTelefon = (lead?.telefon as string | null) ?? null
    leadEmail = (lead?.email as string | null) ?? null
    leadVorname = (lead?.vorname as string | null) ?? null
    leadBevorzugterKanal =
      (lead?.bevorzugter_kanal as 'whatsapp' | 'sms' | 'email' | null) ?? null
  }

  // --- 5. pflichtdokumente INSERT --------------------------------------
  // sort_order: Ans Ende hängen (max + 1) — Anforderungen erscheinen nach
  // den automatisch erzeugten Pflichtdokumenten.
  const { data: maxRow } = await admin
    .from('pflichtdokumente')
    .select('sort_order')
    .eq('fall_id', fallId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = ((maxRow?.sort_order as number | null) ?? 0) + 1

  const { data: inserted, error: insErr } = await admin
    .from('pflichtdokumente')
    .insert({
      fall_id: fallId,
      dokument_typ: slotId,
      status: 'ausstehend',
      pflicht: true,
      quelle: rolle,
      angefordert_von_rolle: rolle,
      angefordert_von_user_id: user.id,
      angefordert_am: new Date().toISOString(),
      begruendung: trimmed,
      frist: new Date(fristIso).toISOString(),
      sort_order: nextSort,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    console.error('[AAR-327] pflichtdokumente insert failed:', insErr)
    return { success: false, error: insErr?.message ?? 'Anforderung konnte nicht gespeichert werden' }
  }

  // --- 6. Kunden-Task erzeugen -----------------------------------------
  // createLinkedTask triggert per AAR-229 W4 automatisch eine In-App-
  // Mitteilung an den Kunden (wenn empfaenger_user_id gesetzt).
  const rolleLabel = ROLLE_LABELS[rolle]
  const taskTitel = `${slot.label} — von ${rolleLabel} angefordert`
  // entity_type='fall' (Fallback via createLinkedTask) — die tasks-CHECK-
  // Constraint kennt 'pflichtdokumente' nicht. Verknüpfung zum
  // pflichtdokumente-Row gebe ich via beschreibung (für UI-Resolution genügt).
  await createLinkedTask({
    fall_id: fallId,
    titel: taskTitel,
    beschreibung: trimmed,
    prioritaet: 'normal',
    typ: 'dokument-nachreichen',
    empfaenger_rolle: 'kunde',
    empfaenger_user_id: fall.kunde_id as string | null,
    faellig_am: new Date(fristIso),
    auto_erstellt: false,
    trigger_event: 'dokument-anforderung',
  })

  // --- 7. Smart-Channel-Push (WA/SMS/Email) ----------------------------
  // Non-critical: Wenn der Kanal-Router failed, bleibt die Anforderung
  // trotzdem bestehen (Kunde sieht sie im Portal via In-App-Mitteilung).
  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/kunde/onboarding`
    : '/kunde/onboarding'
  try {
    await sendSmartChannel(
      'dokumente_nachreichen',
      {
        '1': leadVorname ?? 'Kunde',
        '2': slot.label,
        '3': portalUrl,
      },
      {
        telefon: leadTelefon,
        email: leadEmail,
        leadId: fall.lead_id as string | null,
        fallId,
        bevorzugterKanal: leadBevorzugterKanal,
      },
      {
        emailSubject: `Dokument angefordert: ${slot.label}`,
        emailText:
          `Hallo ${leadVorname ?? ''},\n\n${rolleLabel} benötigt von Ihnen:\n` +
          `${slot.label}\n\nBegründung: ${trimmed}\n\n` +
          `Bitte laden Sie das Dokument bis spätestens ${new Date(fristIso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} ` +
          `in Ihrem Portal hoch: ${portalUrl}`,
      },
    )
  } catch (err) {
    console.warn('[AAR-327] sendSmartChannel failed (non-critical):', err)
  }

  // --- 8. Cache invalidieren -------------------------------------------
  revalidatePath(`/faelle/${fallId}`)
  revalidatePath(`/gutachter/fall/${fallId}`)
  revalidatePath('/kunde')
  revalidatePath('/kunde/onboarding')

  return { success: true, pflichtdokId: inserted.id as string }
}
