// AAR-326 (Child 6 von AAR-320): Server-Actions für die KB-Zuordnungs-UI.
//
// 4 Actions:
//   - zuordneDokument(fallDokumentId, neuerSlotId, notiz?):
//       Ändert fall_dokumente.dokument_typ, aktualisiert pflichtdokumente
//       wenn ein passender ausstehender Slot existiert, schließt den
//       `dokument-zuordnen`-Task.
//   - akzeptiereDokument(fallDokumentId):
//       Setzt pflichtdokumente.status='geprueft' (falls Pflicht) und schließt
//       den `dokument-pruefen`-Task.
//   - ablehneDokument(fallDokumentId, begruendung):
//       Setzt pflichtdokumente.status='abgelehnt', legt einen neuen
//       ausstehenden Pflicht-Eintrag an und benachrichtigt den Kunden.
//   - updateDokumentSortOrder(fallId, items):
//       Persistiert pflichtdokumente.sort_order für drag&drop.
//
// Alle Actions prüfen Rolle (admin oder kundenbetreuer) und revalidieren
// /admin/faelle/[id].

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getKatalogSlot } from './katalog'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { sendSmartChannel } from '@/lib/communications/channel-router'

type ActionResult = { success: boolean; error?: string }

async function requireKbOrAdmin(): Promise<
  { user: { id: string }; rolle: 'admin' | 'kundenbetreuer' } | { error: string }
> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { error: 'Nur Kundenbetreuer/Admin dürfen Dokumente zuordnen' }
  }
  return { user: { id: user.id }, rolle }
}

/**
 * Ordnet ein unzugeordnetes Kunden-Dokument einem Katalog-Slot zu.
 * Wenn ein passender ausstehender Pflicht-Eintrag existiert, wird er auf
 * `hochgeladen` gesetzt und `dokument_url` aus fall_dokumente.storage_path
 * übernommen.
 */
export async function zuordneDokument(
  fallDokumentId: string,
  neuerSlotId: string,
  notiz?: string,
): Promise<ActionResult & { fallId?: string }> {
  const auth = await requireKbOrAdmin()
  if ('error' in auth) return { success: false, error: auth.error }

  const supabase = await createClient()
  const slot = await getKatalogSlot(supabase, neuerSlotId)
  if (!slot) return { success: false, error: `Unbekannter Slot: ${neuerSlotId}` }

  const admin = createAdminClient()
  const { data: dok, error: dokErr } = await admin
    .from('fall_dokumente')
    .select('id, fall_id, storage_path, dokument_typ, beschreibung')
    .eq('id', fallDokumentId)
    .single()
  if (dokErr || !dok) return { success: false, error: 'Dokument nicht gefunden' }

  // 1. fall_dokumente.dokument_typ aktualisieren (+ optional beschreibung
  //    mit Notiz anreichern falls die noch leer ist).
  const neueBeschreibung = notiz?.trim()
    ? dok.beschreibung
      ? `${dok.beschreibung}\n[KB-Notiz] ${notiz.trim()}`
      : notiz.trim()
    : dok.beschreibung
  const { error: updErr } = await admin
    .from('fall_dokumente')
    .update({ dokument_typ: neuerSlotId, beschreibung: neueBeschreibung })
    .eq('id', fallDokumentId)
  if (updErr) return { success: false, error: updErr.message }

  // 2. Passenden ausstehenden Pflicht-Eintrag finden und auf 'hochgeladen' setzen.
  const { data: pflichtRow } = await admin
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', dok.fall_id)
    .eq('dokument_typ', neuerSlotId)
    .in('status', ['ausstehend', 'nachgereicht_angefordert'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (pflichtRow?.id) {
    await admin
      .from('pflichtdokumente')
      .update({
        status: 'hochgeladen',
        hochgeladen_am: new Date().toISOString(),
        dokument_url: dok.storage_path,
      })
      .eq('id', pflichtRow.id)
  }

  // 3. Zuordnen-Task erledigen.
  await admin
    .from('tasks')
    .update({ status: 'erledigt', erledigt_am: new Date().toISOString() })
    .eq('fall_id', dok.fall_id as string)
    .eq('entity_type', 'fall_dokumente')
    .eq('entity_id', fallDokumentId)
    .eq('task_typ', 'dokument-zuordnen')
    .in('status', ['offen', 'in-bearbeitung'])

  revalidatePath(`/faelle/${dok.fall_id}`)
  return { success: true, fallId: dok.fall_id as string }
}

/**
 * QC: Dokument akzeptieren. Schließt den `dokument-pruefen`-Task und setzt
 * den Pflicht-Eintrag (falls vorhanden) auf 'geprueft'.
 */
export async function akzeptiereDokument(
  fallDokumentId: string,
): Promise<ActionResult & { fallId?: string }> {
  const auth = await requireKbOrAdmin()
  if ('error' in auth) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const { data: dok } = await admin
    .from('fall_dokumente')
    .select('id, fall_id, dokument_typ')
    .eq('id', fallDokumentId)
    .single()
  if (!dok) return { success: false, error: 'Dokument nicht gefunden' }

  // Pflicht-Eintrag auf 'geprueft' (falls Slot Pflicht war).
  if (dok.dokument_typ) {
    await admin
      .from('pflichtdokumente')
      .update({ status: 'geprueft' })
      .eq('fall_id', dok.fall_id as string)
      .eq('dokument_typ', dok.dokument_typ as string)
      .eq('status', 'hochgeladen')
  }

  await admin
    .from('tasks')
    .update({ status: 'erledigt', erledigt_am: new Date().toISOString() })
    .eq('fall_id', dok.fall_id as string)
    .eq('entity_type', 'fall_dokumente')
    .eq('entity_id', fallDokumentId)
    .eq('task_typ', 'dokument-pruefen')
    .in('status', ['offen', 'in-bearbeitung'])

  revalidatePath(`/faelle/${dok.fall_id}`)
  return { success: true, fallId: dok.fall_id as string }
}

/**
 * QC: Dokument ablehnen. Markiert den Pflicht-Eintrag als abgelehnt, legt
 * einen neuen ausstehenden Eintrag an (Kunde muss nachliefern) und schickt
 * eine Mitteilung via Smart-Channel-Router.
 */
export async function ablehneDokument(
  fallDokumentId: string,
  begruendung: string,
): Promise<ActionResult & { fallId?: string }> {
  const auth = await requireKbOrAdmin()
  if ('error' in auth) return { success: false, error: auth.error }

  const trimmed = (begruendung ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Begründung muss mindestens 10 Zeichen haben' }
  }

  const admin = createAdminClient()
  const { data: dok } = await admin
    .from('fall_dokumente')
    .select('id, fall_id, dokument_typ')
    .eq('id', fallDokumentId)
    .single()
  if (!dok) return { success: false, error: 'Dokument nicht gefunden' }

  // 1. Bestehenden Pflicht-Eintrag auf 'abgelehnt' setzen.
  let slotLabel = (dok.dokument_typ as string | null) ?? 'Dokument'
  if (dok.dokument_typ) {
    const supabase = await createClient()
    const slot = await getKatalogSlot(supabase, dok.dokument_typ as string)
    if (slot) slotLabel = slot.label

    await admin
      .from('pflichtdokumente')
      .update({
        status: 'abgelehnt',
        begruendung: trimmed,
      })
      .eq('fall_id', dok.fall_id as string)
      .eq('dokument_typ', dok.dokument_typ as string)
      .eq('status', 'hochgeladen')

    // 2. Neuen ausstehenden Pflicht-Eintrag anlegen (Kunde muss erneut).
    await admin.from('pflichtdokumente').insert({
      fall_id: dok.fall_id as string,
      dokument_typ: dok.dokument_typ,
      status: 'ausstehend',
      pflicht: true,
      quelle: 'kundenbetreuer',
      angefordert_von_rolle: 'kundenbetreuer',
      angefordert_von_user_id: auth.user.id,
      angefordert_am: new Date().toISOString(),
      begruendung: `Nachbesserung: ${trimmed}`,
    })
  }

  // 3. QC-Task als erledigt markieren.
  await admin
    .from('tasks')
    .update({ status: 'erledigt', erledigt_am: new Date().toISOString() })
    .eq('fall_id', dok.fall_id as string)
    .eq('entity_type', 'fall_dokumente')
    .eq('entity_id', fallDokumentId)
    .eq('task_typ', 'dokument-pruefen')
    .in('status', ['offen', 'in-bearbeitung'])

  // 4. Kunden-Task erzeugen (Nachreichung) + Mitteilung.
  // CMM-44 SP-B PR2a: bevorzugter_kanal wird hier nicht gelesen — der
  // Smart-Channel-Push nutzt den leads-bevorzugter_kanal weiter unten.
  // Kein claims-Embed nötig.
  const { data: fall } = await admin
    .from('faelle')
    .select('kunde_id, lead_id')
    .eq('id', dok.fall_id as string)
    .single()

  await createLinkedTask({
    fall_id: dok.fall_id as string,
    titel: `${slotLabel} — Nachbesserung erforderlich`,
    beschreibung: trimmed,
    prioritaet: 'dringend',
    typ: 'dokument-nachreichen',
    empfaenger_rolle: 'kunde',
    empfaenger_user_id: (fall?.kunde_id as string | null) ?? null,
    trigger_event: 'dokument-ablehnung',
    auto_erstellt: false,
  })

  // 5. Smart-Channel Push (non-critical).
  if (fall?.lead_id) {
    try {
      const { data: lead } = await admin
        .from('leads')
        .select('vorname, telefon, email, bevorzugter_kanal')
        .eq('id', fall.lead_id as string)
        .single()
      const portalUrl = process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/kunde/onboarding`
        : '/kunde/onboarding'
      await sendSmartChannel(
        'dokumente_nachreichen',
        { '1': (lead?.vorname as string | null) ?? 'Kunde', '2': slotLabel, '3': portalUrl },
        {
          telefon: (lead?.telefon as string | null) ?? null,
          email: (lead?.email as string | null) ?? null,
          leadId: fall.lead_id as string,
          fallId: dok.fall_id as string,
          bevorzugterKanal:
            (lead?.bevorzugter_kanal as 'whatsapp' | 'sms' | 'email' | null) ?? null,
        },
        {
          emailSubject: `Bitte Dokument erneut einreichen: ${slotLabel}`,
          emailText:
            `Hallo ${(lead?.vorname as string | null) ?? ''},\n\n` +
            `Ihr Upload zu "${slotLabel}" benötigt noch eine Nachbesserung:\n\n${trimmed}\n\n` +
            `Bitte laden Sie das Dokument in Ihrem Portal erneut hoch: ${portalUrl}`,
        },
      )
    } catch (err) {
      console.warn('[AAR-326] sendSmartChannel (ablehnen) failed:', err)
    }
  }

  revalidatePath(`/faelle/${dok.fall_id}`)
  revalidatePath('/kunde/onboarding')
  return { success: true, fallId: dok.fall_id as string }
}

/**
 * Persistiert die neue Reihenfolge der Pflicht-Einträge nach einem
 * Drag&Drop. Items enthält `pflichtId` + `sortOrder`-Index in der
 * sichtbaren Liste (nach Kategorie gruppiert).
 */
export async function updateDokumentSortOrder(
  fallId: string,
  items: Array<{ pflichtId: string; sortOrder: number }>,
): Promise<ActionResult> {
  const auth = await requireKbOrAdmin()
  if ('error' in auth) return { success: false, error: auth.error }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Keine Items zum Aktualisieren' }
  }

  const admin = createAdminClient()
  // Einzelne Updates parallel — Supabase hat kein bulk-update. Für 20-30
  // Slots ist das vertretbar.
  const results = await Promise.all(
    items.map((it) =>
      admin
        .from('pflichtdokumente')
        .update({ sort_order: it.sortOrder })
        .eq('id', it.pflichtId)
        .eq('fall_id', fallId),
    ),
  )
  const firstErr = results.find((r) => r.error)
  if (firstErr?.error) {
    return { success: false, error: firstErr.error.message }
  }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}
