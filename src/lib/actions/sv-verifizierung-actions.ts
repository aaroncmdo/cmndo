'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { getKatalogSlot } from '@/lib/dokumente/katalog'
import { istSignaturSlot } from '@/lib/sv/unterschriftsfeld'
import type { PdfMasse, SignaturPosition } from '@/lib/sv/unterschriftsfeld'
import {
  ladeDokumentVorschau,
  speichereSignaturPosition,
  wrapBildZuPdf,
} from '@/lib/sv/unterschriftsfeld-server'
import { revalidatePath } from 'next/cache'

async function requireGutachter() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const sv = await getGutachterForUser<{ id: string; firmenname: string | null }>(
    supabase,
    user.id,
    'id, firmenname',
  )
  if (!sv) throw new Error('Kein SV-Profil')
  // AAR-647: supabase mitgeben — uploadSvPflichtdokument nutzt es für den
  // Katalog-Lookup statt einen zweiten Client aufzumachen.
  return { supabase, userId: user.id, svId: sv.id, svFirmenname: sv.firmenname }
}

function revalidiereSvSichten(svId: string) {
  revalidatePath('/gutachter/verifizierung')
  revalidatePath('/gutachter/willkommen')
  revalidatePath(`/admin/vertrieb/sachverstaendige/${svId}`)
  revalidatePath(`/admin/sachverstaendige/${svId}`)
}

// AAR-647: Generische Upload-Action für alle SV-Pflicht-Slots aus dem Katalog.
// AAR-360: Der frühere sv_sa_vorlage-Sonderendpoint (uploadSaVorlage) wurde
// entfernt — alle SV-Pflicht-Slots laufen über diesen generischen Pfad.
//
// Zielgruppe: Tier-2-Verifizierung (sv_berufshaftpflicht, sv_gewerbeanmeldung,
// sv_bvsk_mitgliedschaft, sv_ihk_zertifikat, sv_bestellungsurkunde_oebuv,
// sv_dat_nachweis) + SV-Abtretungen (sv_abtretungserklaerung, sv_sicherungsabtretung).
//
// Flow pro Upload:
//   1. Slot aus dokument_katalog laden — validiert slotId + uploadbar_von
//   2. Bei einem Signatur-Slot: Bild (JPG/PNG) zu einem einseitigen PDF wandeln
//   3. Datei in Storage (fall-dokumente/sv-pflicht/${svId}/${slot}/${ts}.${ext})
//   4. pflichtdokumente-Row upsert
//
// 20.09.2026 (Aaron: „ja aber das Unterschriftsfeld muss gesetzt werden"): Für die vier
// Unterlagen, die der Kunde mit-signiert, wirkt ein frischer Upload NICHT sofort im
// Kundenflow. Er landet auf status='ausstehend' mit signatur_position=null; erst
// setzeSvUnterschriftsfeld hebt ihn auf 'hochgeladen'. Grund: seit dem 19.09. prüft kein
// Admin mehr, was hochgeladen wird — das gesetzte Feld ist die einzige Sicherung, dass die
// Kunden-Unterschrift AUF dem Dokument landet statt auf einer angehängten Extra-Seite.
// Bestandsdokumente (schon 'hochgeladen', ohne Feld) bleiben unberührt und aktiv.
//
// 2026-05-07 (Andreas-Kloss-Bug-Fix): Result-Object-Pattern. Vorher
// throw — Next.js Production-Build maskiert Server-Action-Errors zu
// generischem „Error", der SV sah „Upload fehlgeschlagen" ohne Detail.
// Jetzt: detaillierte error-Messages kommen 1:1 beim Client an, plus
// Server-side console.error für Vercel-Logs.
export type UploadSvPflichtdokumentResult =
  | {
      ok: true
      slot_id: string
      storage_path: string
      /** true = der Slot wartet jetzt auf das Kunden-Unterschriftsfeld (nicht im Kundenflow). */
      braucht_unterschriftsfeld: boolean
    }
  | { ok: false; error: string }

export async function uploadSvPflichtdokument(
  formData: FormData,
): Promise<UploadSvPflichtdokumentResult> {
  let svId = ''
  let slotId = ''
  try {
    const ctx = await requireGutachter()
    svId = ctx.svId
    const { supabase } = ctx

    slotId = (formData.get('slot_id') as string | null)?.trim() ?? ''
    const file = formData.get('datei') as File | null
    if (!slotId) return { ok: false, error: 'Kein Slot angegeben' }
    if (!file || file.size === 0) return { ok: false, error: 'Keine Datei ausgewählt' }

    const slot = await getKatalogSlot(supabase, slotId)
    if (!slot || !slot.aktiv) return { ok: false, error: `Unbekannter oder deaktivierter Slot: ${slotId}` }
    if (!slot.uploadbar_von.includes('sachverstaendiger')) {
      return { ok: false, error: `Slot „${slot.label}" ist nicht SV-uploadbar` }
    }
    if (slot.kategorie !== 'gutachter_verifizierung') {
      return { ok: false, error: `Slot „${slot.label}" ist kein Verifizierungs-Dokument` }
    }

    const maxBytes = slot.max_mb * 1024 * 1024
    if (file.size > maxBytes) {
      return { ok: false, error: `Datei zu groß — max ${slot.max_mb} MB, Ihre Datei: ${(file.size / 1024 / 1024).toFixed(1)} MB` }
    }
    if (slot.akzeptierte_mime_types.length > 0 && file.type && !slot.akzeptierte_mime_types.includes(file.type)) {
      if (file.type !== 'application/octet-stream') {
        return { ok: false, error: `Datei-Typ „${file.type}" nicht erlaubt — erwartet: ${slot.akzeptierte_mime_types.join(', ')}` }
      }
    }

    const signaturSlot = istSignaturSlot(slotId)
    let ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    let contentType = file.type || 'application/octet-stream'
    let payload: Blob = file

    // Ein Foto/Scan wird für die vier Kunden-Unterlagen zu einem PDF: der Editor zeigt
    // ausschließlich PDFs, und das SA-Tool kann nur PDFs mergen (pdf-lib wirft bei Bildern).
    if (signaturSlot && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      try {
        const pdfBytes = await wrapBildZuPdf(new Uint8Array(await file.arrayBuffer()), file.type)
        payload = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        ext = 'pdf'
        contentType = 'application/pdf'
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: `Das Bild konnte nicht in ein PDF umgewandelt werden: ${msg}` }
      }
    }

    const db = createAdminClient()
    const path = `sv-pflicht/${svId}/${slotId}/${Date.now()}.${ext}`
    const { error: uploadErr } = await db.storage
      .from('fall-dokumente')
      .upload(path, payload, { contentType, upsert: true })
    if (uploadErr) {
      console.error('[uploadSvPflichtdokument] storage upload error', { svId, slotId, msg: uploadErr.message })
      return { ok: false, error: `Storage-Upload fehlgeschlagen: ${uploadErr.message}` }
    }

    const { data: existing } = await db
      .from('pflichtdokumente')
      .select('id, status, signatur_position')
      .eq('sv_id', svId)
      .eq('dokument_typ', slotId)
      .maybeSingle()

    // Signatur-Slots: neue Datei = neues Layout → die alte Position ist ungültig und wird
    // verworfen; der Slot wartet wieder auf das Feld. Nachweis-Slots wirken wie bisher sofort.
    const status = signaturSlot ? 'ausstehend' : 'hochgeladen'
    const braucht = signaturSlot

    if (existing) {
      const { error: updErr } = await db
        .from('pflichtdokumente')
        .update({
          status,
          dokument_url: path,
          hochgeladen_am: new Date().toISOString(),
          ...(signaturSlot ? { signatur_position: null } : {}),
        })
        .eq('id', existing.id)
      if (updErr) {
        console.error('[uploadSvPflichtdokument] db update error', { svId, slotId, msg: updErr.message })
        return { ok: false, error: `DB-Update fehlgeschlagen: ${updErr.message}` }
      }
    } else {
      const { error: insErr } = await db
        .from('pflichtdokumente')
        .insert({
          sv_id: svId,
          dokument_typ: slotId,
          status,
          pflicht: true,
          quelle: 'sachverstaendiger',
          dokument_url: path,
          hochgeladen_am: new Date().toISOString(),
        })
      if (insErr) {
        console.error('[uploadSvPflichtdokument] db insert error', { svId, slotId, msg: insErr.message })
        return { ok: false, error: `DB-Insert fehlgeschlagen: ${insErr.message}` }
      }
    }

    // Bis 19.09.2026 entstand hier je Upload ein Admin-Pruef-Task + eine Mitteilung an alle
    // Admins („bitte pruefen und freigeben"). Aaron: „ich moechte nicht mehr verifizieren und
    // ich moechte auch nicht mehr nachhalten muessen, ob die Dokumente fehlen oder nicht."
    // Der Admin sieht den Stand in der SV-Akte und kann dort weiterhin zurueckweisen oder
    // sperren — er muss nicht.

    revalidiereSvSichten(svId)

    return { ok: true, slot_id: slotId, storage_path: path, braucht_unterschriftsfeld: braucht }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[uploadSvPflichtdokument] uncaught', { svId, slotId, msg, err })
    return { ok: false, error: msg }
  }
}

export type SvDokumentVorschauResult =
  | {
      ok: true
      slot_id: string
      status: string | null
      signed_url: string
      masse: PdfMasse
      position: SignaturPosition | null
    }
  | { ok: false; error: string }

/**
 * Liefert dem Unterschriftsfeld-Editor das hochgeladene Dokument: befristeter Vorschau-Link,
 * Seitenzahl/Seitenmaße aus der echten Datei und die bereits gesetzte Position.
 * Nur für die vier Slots, die der Kunde mit-signiert.
 */
export async function holeSvDokumentVorschau(slotId: string): Promise<SvDokumentVorschauResult> {
  let svId = ''
  try {
    const ctx = await requireGutachter()
    svId = ctx.svId
    const res = await ladeDokumentVorschau(createAdminClient(), svId, slotId)
    if (!res.ok) return res
    return {
      ok: true,
      slot_id: res.vorschau.slotId,
      status: res.vorschau.status,
      signed_url: res.vorschau.signedUrl,
      masse: res.vorschau.masse,
      position: res.vorschau.position,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[holeSvDokumentVorschau] uncaught', { svId, slotId, msg })
    return { ok: false, error: msg }
  }
}

export type SetzeUnterschriftsfeldResult =
  | { ok: true; slot_id: string; status: string }
  | { ok: false; error: string }

/**
 * Speichert, wo der Kunde auf diesem Dokument unterschreibt (Aaron 20.09.2026), und hebt den
 * Slot damit auf 'hochgeladen' — ab da legt der Flow ihn dem Kunden vor und das SA-Tool
 * setzt die Unterschrift genau dorthin.
 */
export async function setzeSvUnterschriftsfeld(
  slotId: string,
  position: unknown,
): Promise<SetzeUnterschriftsfeldResult> {
  let svId = ''
  try {
    const ctx = await requireGutachter()
    svId = ctx.svId
    const res = await speichereSignaturPosition(createAdminClient(), svId, slotId, position, 'hochgeladen')
    if (!res.ok) return res
    revalidiereSvSichten(svId)
    return { ok: true, slot_id: slotId, status: res.status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[setzeSvUnterschriftsfeld] uncaught', { svId, slotId, msg })
    return { ok: false, error: msg }
  }
}
