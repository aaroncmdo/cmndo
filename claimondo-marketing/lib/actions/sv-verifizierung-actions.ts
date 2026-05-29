'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { getKatalogSlot } from '@/lib/dokumente/katalog'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { revalidatePath } from 'next/cache'

// AAR-359 W3: SA-Vorlage-Upload im Willkommen-Flow.
//
// Der SV lädt seine Schadenaufnahme-Muster-PDF hoch. Status wird auf
// `ausstehend` gesetzt, Admin-Task wird erzeugt. Erst nach Admin-Freigabe
// (W6) geht der Status auf `geprueft` und öffnet das Dispatch-Gate.
//
// Storage: Wir reusen den bestehenden `dokumente`-Bucket mit Pfad-Prefix
// `sv-vorlagen/${svId}/...` statt eines neuen Buckets — spart Migration
// und nutzt die schon existierenden RLS-Policies (Admin-Client schreibt
// eh server-side).

const MAX_MB = 15
const MAX_BYTES = MAX_MB * 1024 * 1024
const ALLOWED_EXT = ['pdf'] as const
const ALLOWED_MIME = ['application/pdf'] as const

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

export type UploadSaVorlageResult =
  | { ok: true; storage_path: string; status: 'ausstehend' }
  | { ok: false; error: string }

export async function uploadSaVorlage(formData: FormData): Promise<UploadSaVorlageResult> {
  const { userId, svId, svFirmenname } = await requireGutachter()

  const file = formData.get('sa_vorlage') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Keine Datei ausgewählt' }
  if (file.size > MAX_BYTES) return { ok: false, error: `Datei zu groß (max ${MAX_MB} MB)` }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return { ok: false, error: 'Nur PDF erlaubt' }
  }
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    // Browser liefert manchmal application/octet-stream — akzeptieren nur
    // wenn die Datei-Endung stimmt. Wir haben ext oben schon geprüft.
    if (file.type && file.type !== 'application/octet-stream') {
      return { ok: false, error: 'MIME-Type ungültig — bitte PDF hochladen' }
    }
  }

  // Profil für Task-Titel laden
  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('vorname, nachname')
    .eq('id', userId)
    .maybeSingle()
  const svName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ').trim()
    || svFirmenname
    || 'Unbekannter SV'

  // Upload in 'fall-dokumente'-Bucket mit sv-vorlagen-Prefix (AAR-553)
  const path = `sv-vorlagen/${svId}/${Date.now()}.${ext}`
  const { error: uploadErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (uploadErr) return { ok: false, error: `Upload fehlgeschlagen: ${uploadErr.message}` }

  // SV-Row updaten: Status ausstehend, Path + Zeitstempel
  const { error: updErr } = await db
    .from('sachverstaendige')
    .update({
      sa_vorlage_status: 'ausstehend',
      sa_vorlage_storage_path: path,
      sa_vorlage_hochgeladen_am: new Date().toISOString(),
      // Re-Upload-Fall: alte Prüfungs-Felder zurücksetzen
      sa_vorlage_geprueft_am: null,
      sa_vorlage_geprueft_von_user_id: null,
      sa_vorlage_admin_notiz: null,
    })
    .eq('id', svId)
  if (updErr) return { ok: false, error: `DB-Update fehlgeschlagen: ${updErr.message}` }

  // Admin-Task erzeugen (typ=sv_dokument_review, entity_type=gutachter)
  // Wird im Admin-Verifizierungs-Tab (W6) auto-resolved sobald Freigabe.
  await createLinkedTask({
    titel: `Neue SA-Vorlage von ${svName} zu prüfen`,
    beschreibung: `${svName} hat im Willkommen-Flow eine SA-Vorlage hochgeladen. Bitte prüfen und freigeben (öffnet Dispatch-Gate).`,
    prioritaet: 'normal',
    typ: 'sv_dokument_review',
    entity_type: 'gutachter',
    entity_id: svId,
    empfaenger_rolle: 'admin',
    task_code: 'sv_sa_vorlage_review',
    trigger_event: 'sa_vorlage_uploaded',
    auto_erstellt: true,
  })

  // AAR-613: Broadcast-Mitteilung an ALLE Admin-User. Ohne expliziten
  // empfaenger_user_id an createLinkedTask feuert dessen interner
  // createMitteilung-Call nicht — daher hier manuell pro Admin.
  // Non-blocking: Upload + Task sind bereits persistiert; Notification-
  // Fehler dürfen den Upload-Flow nicht brechen.
  try {
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .eq('rolle', 'admin')
    if (admins && admins.length > 0) {
      const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilungMulti(
        admins.map((a) => ({ id: a.id, rolle: 'admin' as const })),
        {
          kategorie: 'task',
          titel: `Neue SA-Vorlage von ${svName} zu prüfen`,
          inhalt: 'Bitte im Admin-Portal prüfen und freigeben, damit das Dispatch-Gate öffnet.',
          route_url: `/admin/sachverstaendige/${svId}?tab=verifizierung`,
          icon: 'bell',
          prioritaet: 'normal',
        },
      )
    }
  } catch (err) {
    console.error('[AAR-613] Admin-Mitteilung nach SA-Upload fehlgeschlagen:', err)
  }

  revalidatePath('/gutachter/willkommen')
  revalidatePath('/gutachter/verifizierung')
  revalidatePath('/admin/aufgaben/alle')

  return { ok: true, storage_path: path, status: 'ausstehend' }
}

// AAR-647: Generische Upload-Action für alle SV-Pflicht-Slots aus dem Katalog
// (außer sv_sa_vorlage — das hat eigenen Endpoint mit spezifischen Side-Effects).
//
// Zielgruppe: Tier-2-Verifizierung (sv_berufshaftpflicht, sv_gewerbeanmeldung,
// sv_bvsk_mitgliedschaft, sv_ihk_zertifikat, sv_bestellungsurkunde_oebuv,
// sv_dat_nachweis) + SV-Abtretungen (sv_abtretungserklaerung, sv_sicherungsabtretung).
//
// Flow pro Upload:
//   1. Slot aus dokument_katalog laden — validiert slotId + uploadbar_von
//   2. Datei in Storage (fall-dokumente/sv-pflicht/${svId}/${slot}/${ts}.${ext})
//   3. pflichtdokumente-Row upsert (status='hochgeladen')
//   4. Admin-Task + Mitteilung analog uploadSaVorlage
// 2026-05-07 (Andreas-Kloss-Bug-Fix): Result-Object-Pattern. Vorher
// throw — Next.js Production-Build maskiert Server-Action-Errors zu
// generischem „Error", der SV sah „Upload fehlgeschlagen" ohne Detail.
// Jetzt: detaillierte error-Messages kommen 1:1 beim Client an, plus
// Server-side console.error für Vercel-Logs.
export type UploadSvPflichtdokumentResult =
  | { ok: true; slot_id: string; storage_path: string }
  | { ok: false; error: string }

export async function uploadSvPflichtdokument(
  formData: FormData,
): Promise<UploadSvPflichtdokumentResult> {
  let svId = ''
  let slotId = ''
  try {
    const ctx = await requireGutachter()
    svId = ctx.svId
    const { userId, svFirmenname, supabase } = ctx

    slotId = (formData.get('slot_id') as string | null)?.trim() ?? ''
    const file = formData.get('datei') as File | null
    if (!slotId) return { ok: false, error: 'Kein Slot angegeben' }
    if (slotId === 'sv_sa_vorlage') {
      return { ok: false, error: 'SA-Vorlage nutzt eigenen Endpoint (uploadSaVorlage)' }
    }
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
      return { ok: false, error: `Datei zu groß — max ${slot.max_mb} MB, deine Datei: ${(file.size / 1024 / 1024).toFixed(1)} MB` }
    }
    if (slot.akzeptierte_mime_types.length > 0 && file.type && !slot.akzeptierte_mime_types.includes(file.type)) {
      if (file.type !== 'application/octet-stream') {
        return { ok: false, error: `Datei-Typ „${file.type}" nicht erlaubt — erwartet: ${slot.akzeptierte_mime_types.join(', ')}` }
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const db = createAdminClient()

    const { data: profile } = await db
      .from('profiles')
      .select('vorname, nachname')
      .eq('id', userId)
      .maybeSingle()
    const svName =
      [profile?.vorname, profile?.nachname].filter(Boolean).join(' ').trim()
      || svFirmenname
      || 'Unbekannter SV'

    const path = `sv-pflicht/${svId}/${slotId}/${Date.now()}.${ext}`
    const { error: uploadErr } = await db.storage
      .from('fall-dokumente')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (uploadErr) {
      console.error('[uploadSvPflichtdokument] storage upload error', { svId, slotId, msg: uploadErr.message })
      return { ok: false, error: `Storage-Upload fehlgeschlagen: ${uploadErr.message}` }
    }

    const { data: existing } = await db
      .from('pflichtdokumente')
      .select('id')
      .eq('sv_id', svId)
      .eq('dokument_typ', slotId)
      .maybeSingle()

    if (existing) {
      const { error: updErr } = await db
        .from('pflichtdokumente')
        .update({
          status: 'hochgeladen',
          dokument_url: path,
          hochgeladen_am: new Date().toISOString(),
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
          status: 'hochgeladen',
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

    // Admin-Task: Review-Pflicht nach Upload
    await createLinkedTask({
      titel: `${slot.label} von ${svName} zu prüfen`,
      beschreibung: `${svName} hat „${slot.label}" hochgeladen. Bitte im Verifizierungs-Tab prüfen und freigeben.`,
      prioritaet: 'normal',
      typ: 'sv_dokument_review',
      entity_type: 'gutachter',
      entity_id: svId,
      empfaenger_rolle: 'admin',
      task_code: `sv_${slotId}_review`,
      trigger_event: 'sv_pflichtdokument_hochgeladen',
      auto_erstellt: true,
    })

    // Mitteilung an alle Admins (non-blocking)
    try {
      const { data: admins } = await db
        .from('profiles')
        .select('id')
        .eq('rolle', 'admin')
      if (admins && admins.length > 0) {
        const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
        await createMitteilungMulti(
          admins.map((a) => ({ id: a.id, rolle: 'admin' as const })),
          {
            kategorie: 'task',
            titel: `${slot.label} von ${svName}`,
            inhalt: 'Bitte im SV-Verifizierungs-Tab prüfen und freigeben.',
            route_url: `/admin/sachverstaendige/${svId}?tab=verifizierung`,
            icon: 'bell',
            prioritaet: 'normal',
          },
        )
      }
    } catch (err) {
      console.error('[AAR-647] Admin-Mitteilung nach SV-Upload fehlgeschlagen:', err)
    }

    revalidatePath('/gutachter/verifizierung')
    revalidatePath('/admin/aufgaben/alle')
    revalidatePath(`/admin/sachverstaendige/${svId}`)

    return { ok: true, slot_id: slotId, storage_path: path }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('[uploadSvPflichtdokument] uncaught', { svId, slotId, msg, err })
    return { ok: false, error: msg }
  }
}
