// NOT 'use server' — plain module imported by the schaden/[token]/actions.ts Server-Action.
// Stores opponent-submitted photos + signature into fall_dokumente, mirroring the
// insertFallDokument pattern from src/app/upload/dokumente/[token]/actions.ts.
//
// Signature bucket: 'unterschriften' (mirrors uploadFlowSignatur in unterschrift-upload.ts).
// Photo bucket:     'fall-dokumente'  (mirrors the /upload flow).
//
// All functions are fail-soft: they return { ok, error } and never throw.
// The caller (submitSchadenGegner) wraps each call in try/catch and continues
// on failure — the claim already exists at that point.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getStorageUrl } from '@/lib/storage/url'
import type { GegnerFoto } from '@/app/schaden/[token]/gegner-form-types'

// Match the AnyDb alias used across the flotte-domain helpers.
type AnyDb = SupabaseClient<any, any, any>

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map foto.typ to a canonical dokument_typ stored in fall_dokumente. */
function dokTypFromFotoTyp(typ: GegnerFoto['typ']): string {
  switch (typ) {
    case 'gegner_fahrzeug':  return 'gegner_fahrzeug_foto'
    case 'eigenes_fahrzeug': return 'eigenes_fahrzeug_foto'
    case 'unfallort':        return 'unfallort_foto'
  }
}

/** Human-readable beschreibung for each foto typ (user-facing label in German). */
function beschreibungFromFotoTyp(typ: GegnerFoto['typ']): string {
  switch (typ) {
    case 'gegner_fahrzeug':  return 'Foto Fahrzeug des Gegners'
    case 'eigenes_fahrzeug': return 'Foto eigenes Fahrzeug'
    case 'unfallort':        return 'Foto Unfallort'
  }
}

/** Decode a data-URI, returning raw bytes + actual MIME. Returns null on invalid input. */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mime = match[1]
  try {
    const buf = Buffer.from(match[2], 'base64')
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null // 5 MB guard
    return { bytes: new Uint8Array(buf), mime }
  } catch {
    return null
  }
}

// ─── Photo upload ────────────────────────────────────────────────────────────

// Server-seitige Allowlists (Hostile-Client-Schutz): der Server-Action-Boundary
// bedeutet, ein Angreifer koennte den Wizard umgehen und beliebige Werte senden.
//   - typ: schliesst Path-Injection (der Storage-Pfad interpoliert foto.typ)
//   - MIME: nur echte Bilder (compressImage liefert image/jpeg)
//   - Byte-Cap: analog Unterschrift (compressImage haelt ~200-500 KB)
const ALLOWED_FOTO_TYPEN = new Set<GegnerFoto['typ']>(['gegner_fahrzeug', 'eigenes_fahrzeug', 'unfallort'])
const ALLOWED_FOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FOTO_BYTES = 5 * 1024 * 1024

/**
 * Stores a single opponent-submitted photo in 'fall-dokumente' storage and
 * inserts a fall_dokumente row.
 *
 * Opponent photos are evidence for our side + the fleet manager —
 * NOT visible to 'kunde' (the opposing party is the uploader, NOT our Kunde).
 * sichtbar_fuer excludes 'kunde' intentionally.
 */
export async function speichereGegnerFoto(
  db: AnyDb,
  fallId: string,
  claimId: string,
  foto: GegnerFoto,
): Promise<{ ok: boolean; error?: string }> {
  // Allowlist-Guards (Server-Boundary — Wizard-Umgehung moeglich)
  if (!ALLOWED_FOTO_TYPEN.has(foto.typ)) {
    return { ok: false, error: 'Ungueltiger Foto-Typ' }
  }
  if (!ALLOWED_FOTO_MIME.has(foto.contentType)) {
    return { ok: false, error: 'Ungueltiges Bildformat' }
  }

  // Strip optional data-URI prefix
  const b64 = foto.base64.includes(',') ? foto.base64.split(',')[1] : foto.base64

  let buf: Buffer
  try {
    buf = Buffer.from(b64, 'base64')
  } catch {
    return { ok: false, error: 'Ungueltige Bilddaten (base64-Dekodierung fehlgeschlagen)' }
  }
  if (buf.length === 0) {
    return { ok: false, error: 'Bilddaten leer' }
  }
  if (buf.length > MAX_FOTO_BYTES) {
    return { ok: false, error: 'Bilddaten zu gross' }
  }

  const ext =
    foto.contentType === 'image/png' ? 'png' : foto.contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `claims/${fallId}/gegner_${foto.typ}_${Date.now()}.${ext}`

  const { error: upErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType: foto.contentType, upsert: false })
  if (upErr) {
    return { ok: false, error: `Foto-Upload fehlgeschlagen: ${upErr.message}` }
  }

  const dokumentTyp = dokTypFromFotoTyp(foto.typ)
  const beschreibung = beschreibungFromFotoTyp(foto.typ)

  // Mirror the exact columns used by insertFallDokument in /upload/dokumente/[token]/actions.ts.
  // Additional columns present in this insert: claim_id, kategorie, quelle, sichtbar_fuer.
  const { error: insErr } = await db.from('fall_dokumente').insert({
    fall_id:           fallId,
    claim_id:          claimId,
    dokument_typ:      dokumentTyp,
    storage_path:      path,
    original_filename: `${dokumentTyp}_upload`,
    mime_type:         foto.contentType,
    groesse_bytes:     buf.length,
    uploaded_by_kunde: true,
    beschreibung,
    hochgeladen_am:    new Date().toISOString(),
    kategorie:         'schadenfoto',
    quelle:            'schaden-karte',
    // Opponent photos are evidence (admin, KB, SV, Kanzlei, Flottenmanager).
    // Intentionally NOT 'kunde': the opponent is not our Kunde; we do not surface
    // their own submission back to them via the Kunde-Portal.
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'flottenmanager'],
  } as never)

  if (insErr) {
    return { ok: false, error: `Dokument-Eintrag fehlgeschlagen: ${insErr.message}` }
  }

  return { ok: true }
}

// ─── Signature upload ────────────────────────────────────────────────────────

/**
 * Stores the opponent's handwritten signature (PNG data-URI) in the 'unterschriften'
 * bucket (matching uploadFlowSignatur) and inserts a fall_dokumente row.
 */
export async function speichereGegnerUnterschrift(
  db: AnyDb,
  fallId: string,
  claimId: string,
  dataUri: string,
): Promise<{ ok: boolean; error?: string }> {
  const decoded = decodeDataUrl(dataUri)
  if (!decoded) {
    return { ok: false, error: 'Ungueltige oder zu grosse Unterschriftsdaten' }
  }
  // Unterschrift ist immer PNG (SignaturePadInput -> canvas PNG). MIME-Allowlist (Symmetrie zum Foto-Pfad).
  if (decoded.mime !== 'image/png') {
    return { ok: false, error: 'Ungueltiges Unterschriftsformat' }
  }

  const path = `gegner/${fallId}/unterschrift_${Date.now()}.png`

  const { error: upErr } = await db.storage
    .from('unterschriften')
    .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false })
  if (upErr) {
    return { ok: false, error: `Unterschrift-Upload fehlgeschlagen: ${upErr.message}` }
  }

  const url = await getStorageUrl(db, 'unterschriften', path)
  // URL generation failure is non-critical for the row insert — we still store the path.
  if (!url) {
    console.error('[schaden-gegner] getStorageUrl fehlgeschlagen fuer Unterschrift-Pfad:', path)
  }

  const { error: insErr } = await db.from('fall_dokumente').insert({
    fall_id:           fallId,
    claim_id:          claimId,
    dokument_typ:      'gegner_unterschrift',
    storage_path:      path,
    original_filename: 'gegner_unterschrift_upload',
    mime_type:         decoded.mime,
    groesse_bytes:     decoded.bytes.length,
    uploaded_by_kunde: true,
    beschreibung:      'Unterschrift des Unfallgegners',
    hochgeladen_am:    new Date().toISOString(),
    kategorie:         'unterschrift',
    quelle:            'schaden-karte',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'flottenmanager'],
  } as never)

  if (insErr) {
    return { ok: false, error: `Unterschrift-Dokument-Eintrag fehlgeschlagen: ${insErr.message}` }
  }

  return { ok: true }
}
