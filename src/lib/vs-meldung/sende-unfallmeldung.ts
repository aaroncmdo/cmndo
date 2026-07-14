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

// Grosszuegig ausgelegt: zwischen staging und einer echten Versicherer-Mail darf nicht
// eine einzige exakte Zeichenkette stehen. Ein leerer Wert (kopierte .env) zaehlt als AUS.
function sendAktiv(): boolean {
  const v = (process.env.VS_MELDUNG_ENABLED ?? 'true').trim().toLowerCase()
  return !(v === '' || v === 'false' || v === '0' || v === 'off' || v === 'no')
}

type Anhang = { filename: string; content: Buffer; contentType?: string }

const MIME_ENDUNG: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/**
 * Der Resend-Pfad in sendEmail (client.ts:140) reicht contentType NICHT durch und leitet
 * den MIME-Typ aus dem Dateinamen ab. Der Upload speichert original_filename aber immer als
 * "<typ>_upload" — ohne Endung (gegner-dokumente.ts:123). Ohne die Endung kommen die Fotos
 * beim Versicherer als application/octet-stream an und sind nicht anzeigbar.
 */
export function anhangDateiname(basis: string | null, dokumentTyp: string, mimeType: string | null): string {
  const name = basis?.trim() || dokumentTyp
  if (/\.[a-z0-9]{2,4}$/i.test(name)) return name
  const endung = MIME_ENDUNG[(mimeType ?? '').toLowerCase()] ?? 'jpg'
  return `${name}.${endung}`
}

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
      // getStorageUrl liefert null, wenn das Signieren scheitert — dann gibt es nichts
      // anzuhaengen. Lieber ein Foto weniger als eine Meldung, die gar nicht rausgeht.
      if (!url) {
        console.error('[vs-meldung] Keine Storage-URL fuer', d.storage_path)
        continue
      }
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (summe + buf.byteLength > MAX_ANHANG_BYTES) {
        console.warn('[vs-meldung] Anhang-Limit erreicht, weitere Fotos ausgelassen')
        break
      }
      summe += buf.byteLength
      anhaenge.push({
        filename: anhangDateiname(d.original_filename as string | null, d.dokument_typ as string, d.mime_type as string | null),
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
  if (!daten) {
    // ladeVsMeldungDaten liefert null nicht nur bei "gibt's nicht", sondern bei JEDEM
    // DB-Fehler (inkl. kaputter Parteien-Query). Der Aufrufer hat den CAS bereits gewonnen
    // -> responded_at ist gesetzt -> der Nachfass-Cron greift den Invite NIE mehr auf.
    // Ohne diesen Task wuerde der Claim also still nie gemeldet. -> Mensch uebernimmt.
    await erstelleVsDispatchTask({ claimId, grund: 'send_fehler', detail: 'Claim-/Parteien-Daten nicht ladbar' })
    return { ok: false, error: 'Claim nicht gefunden' }
  }

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
      // Schuetzt gegen den zweiten Send, falls Resend nach Annahme timeoutet und die
      // 3x-Retry-Schleife erneut feuert — eine Dublette an einen Versicherer ist nicht
      // zurueckholbar. Der CAS des Aufrufers schuetzt nur VOR dieser Funktion.
      idempotencyKey: `vs_meldung:${claimId}`,
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
