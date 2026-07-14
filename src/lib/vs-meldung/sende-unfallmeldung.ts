// Slice 2c — Herzstueck: die Unfallmeldung an die Haftpflicht des Unfallgegners.
//
// ⚠ KILL-SWITCH (VS_MELDUNG_ENABLED, Default true): Diese Funktion schickt E-Mails an ECHTE
// Versicherer. Der projektweite SIDE_EFFECT_MODE schuetzt hier NICHT — er steht per Default
// auf 'live' und filtert nur INTERNE Empfaenger (@claimondo.de); sachschaden@allianz.de ist
// extern und wuerde real zugestellt. Auf staging MUSS VS_MELDUNG_ENABLED=false stehen,
// sonst schreibt ein Smoke-Test eine echte Versicherung an.
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { UnfallmeldungVsEmail, subject } from '@/lib/email/google/templates/UnfallmeldungVs'
import { recordFailedOperation } from '@/lib/reliability/dead-letter'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeVsMeldungDaten } from './claim-daten'
import { erstelleVsDispatchTask } from './dispatch-task'
import { resolveVsEmpfaenger } from './empfaenger'

const ABSENDER = 'Claimondo GmbH — Schadenmanagement'
const MAX_ANHANG_BYTES = 20 * 1024 * 1024 // Gmail bounct ueber ~25 MB (Muster: flows.ts:553)
const FOTO_TYPEN = ['gegner_fahrzeug_foto', 'eigenes_fahrzeug_foto', 'unfallort_foto']

export type SendeErgebnis =
  | { ok: true; gesendet: true; empfaenger: string; anhaenge: number }
  | { ok: true; gesendet: false; grund: 'kill_switch' | 'dispatch_task' }
  | { ok: false; error: string }

function sendAktiv(): boolean {
  return (process.env.VS_MELDUNG_ENABLED ?? 'true') !== 'false'
}

type Anhang = { filename: string; content: Buffer; contentType?: string }

async function ladeFotoAnhaenge(claimId: string): Promise<Anhang[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('fall_dokumente')
    .select('id, dokument_typ, storage_path, original_filename, mime_type, groesse_bytes')
    .eq('claim_id', claimId)

  const fotos = ((data ?? []) as Array<Record<string, unknown>>).filter((d) =>
    FOTO_TYPEN.includes(d.dokument_typ as string),
  )

  const anhaenge: Anhang[] = []
  let summe = 0

  for (const d of fotos) {
    try {
      const url = await getStorageUrl(admin, 'fall-dokumente', d.storage_path as string, {
        ttl: STORAGE_TTL.download,
      })
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (summe + buf.byteLength > MAX_ANHANG_BYTES) {
        console.warn('[vs-meldung] Anhang-Limit erreicht, weitere Fotos ausgelassen')
        break
      }
      summe += buf.byteLength
      anhaenge.push({
        // Der Dateiname MUSS die Endung tragen: der Resend-Pfad in sendEmail reicht
        // contentType nicht durch (client.ts:140) und leitet den MIME-Typ aus dem Namen ab.
        filename: (d.original_filename as string) ?? `${d.dokument_typ}-${d.id}.jpg`,
        content: buf,
        contentType: (d.mime_type as string) ?? 'image/jpeg',
      })
    } catch (err) {
      console.error('[vs-meldung] Anhang konnte nicht geladen werden:', err)
    }
  }
  return anhaenge
}

async function protokolliere(
  claimId: string,
  versicherungId: string,
  versicherungName: string,
  betreff: string,
  status: 'wartet_auf_antwort' | 'archiviert',
  notiz: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('vs_korrespondenz').insert({
    claim_id: claimId,
    richtung: 'ausgehend',
    kanal: 'email',
    typ: 'unfallmeldung_gegner',
    status,
    datum: new Date().toISOString(),
    versicherung_id: versicherungId,
    versicherung: versicherungName,
    betreff,
    notiz,
  })
  if (error) console.error('[vs-meldung] vs_korrespondenz-Insert fehlgeschlagen:', error.message)
}

/**
 * Meldet den Schaden der Haftpflicht des Unfallgegners. Wird ausgeloest, sobald der Gegner
 * seine Handynummer per SMS-Link bestaetigt hat (siehe app/unfallmeldung/[token]).
 *
 * ⚠ Der AUFRUFER garantiert die Idempotenz (Compare-and-Swap auf
 * airdrop_invitations.responded_at) — diese Funktion selbst ist NICHT gegen Doppelaufruf
 * geschuetzt. Eine zweite Mail an einen Versicherer waere nicht zurueckholbar.
 */
export async function sendeUnfallmeldungAnGegnerVs(claimId: string): Promise<SendeErgebnis> {
  const daten = await ladeVsMeldungDaten(claimId)
  if (!daten) return { ok: false, error: 'Claim nicht gefunden' }

  const empfaenger = await resolveVsEmpfaenger(daten.gegnerVersicherungId)

  if (!empfaenger.kann) {
    await erstelleVsDispatchTask({
      claimId,
      grund: empfaenger.grund,
      detail: empfaenger.versicherungName ?? undefined,
    })
    return { ok: true, gesendet: false, grund: 'dispatch_task' }
  }

  const betreff = subject(daten)

  if (!sendAktiv()) {
    await protokolliere(
      claimId,
      empfaenger.versicherungId,
      empfaenger.name,
      betreff,
      'archiviert',
      `[DRY-RUN] VS_MELDUNG_ENABLED=false — nicht versendet. Empfänger wäre: ${empfaenger.email}`,
    )
    console.warn(`[vs-meldung] DRY-RUN — kein Versand an ${empfaenger.email} (VS_MELDUNG_ENABLED=false)`)
    return { ok: true, gesendet: false, grund: 'kill_switch' }
  }

  const anhaenge = await ladeFotoAnhaenge(claimId)

  try {
    const html = await render(UnfallmeldungVsEmail({ ...daten, absender: ABSENDER }))
    await sendEmail({
      to: empfaenger.email,
      subject: betreff,
      html,
      attachments: anhaenge.length > 0 ? anhaenge : undefined,
      fallId: claimId,
      template: 'unfallmeldung_vs',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[vs-meldung] Versand fehlgeschlagen:', msg)
    // Kein vs_korrespondenz-Eintrag: nichts als "gesendet" protokollieren, was nie ankam.
    await recordFailedOperation({
      operationType: 'vs_meldung_email',
      dedupKey: `vs_meldung:${claimId}`,
      entityType: 'claim',
      entityId: claimId,
      payload: { empfaenger: empfaenger.email, versicherungId: empfaenger.versicherungId },
      error: msg,
    })
    await erstelleVsDispatchTask({ claimId, grund: 'send_fehler', detail: msg })
    return { ok: false, error: msg }
  }

  await protokolliere(
    claimId,
    empfaenger.versicherungId,
    empfaenger.name,
    betreff,
    'wartet_auf_antwort',
    `Automatische Unfallmeldung nach SMS-Bestätigung des Gegners. ${anhaenge.length} Foto-Anhänge.`,
  )

  return { ok: true, gesendet: true, empfaenger: empfaenger.email, anhaenge: anhaenge.length }
}
