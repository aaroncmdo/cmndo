'use server'

// E3b (Ops-Test #23, Aaron-Entscheid 13.08.): OCR-Einstieg im Vermittlungs-Formular.
//
// Der SV tippt dort heute elf Felder ab, die alle im Gutachten stehen, das er ohnehin
// hochlaedt. Diese Action liest sie aus dem PDF — als reiner LESE-Vorgang: sie legt
// nichts an, schreibt nichts und aendert nichts. Der Claim entsteht weiterhin erst mit
// `vermittlePartnerWerkstatt`, und zwar aus dem, was der SV im Formular BESTAETIGT hat.
//
// Warum nicht `/api/ocr-gutachten`: der Endpoint ist claim-gebunden (verlangt `fall_id`,
// schreibt via RPC direkt auf den Claim). Hier existiert der Claim noch gar nicht — er
// soll ja erst aus diesen Daten entstehen. Deshalb die DB-freie `extractGutachtenFelder`.

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { extractGutachtenFelder } from '@/lib/ai/gutachten-ocr'

/**
 * Was vorgeschlagen wird — bewusst nur, was das OCR-Schema EINDEUTIG hergibt.
 *
 * Gegen den Formularbestand geprueft (13.08.): das Schema kennt `kennzeichen`,
 * `fahrzeug_typ` und `reparaturkosten_netto`. Es kennt **kein** getrenntes
 * `fahrzeug_hersteller`/`fahrzeug_modell` — `fahrzeug_typ` traegt beides in einem String
 * ("BMW 320d"). Ein automatischer Split am ersten Leerzeichen waere geraten und bei
 * "Mercedes-Benz C 200" oder "VW Golf GTI" schlicht falsch; deshalb wandert der Wert
 * unveraendert ins Modell-Feld, wo der SV ihn sieht und zurechtruecken kann.
 */
export type GutachtenVorschlag = {
  kennzeichen: string | null
  /** Roher `fahrzeug_typ` aus dem Gutachten — NICHT in Hersteller/Modell zerlegt. */
  fahrzeug_typ: string | null
  /** Aus `reparaturkosten_netto` — das Formularfeld heisst dort „Schadenshöhe netto". */
  betrag: number | null
}

export type LiesGutachtenFelderResult =
  | { ok: true; vorschlag: GutachtenVorschlag; gefunden: number }
  | { ok: false; error: string }

// Anthropic akzeptiert base64-Dokumente bis ~28 MB Rohbytes (siehe gutachten-ocr.ts).
const MAX_PDF_BYTES = 28 * 1024 * 1024

export async function liesGutachtenFelder(formData: FormData): Promise<LiesGutachtenFelderResult> {
  // Auth wie im Vermittlungs-Flow: nur ein Sachverstaendigen-Profil darf das ausloesen.
  // Ohne diesen Guard waere die Action ein offener OCR-Dienst auf Kosten des API-Keys.
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein Sachverständigen-Profil gefunden' }

  const datei = formData.get('datei')
  if (!(datei instanceof File) || datei.size === 0) {
    return { ok: false, error: 'Bitte zuerst das Gutachten als PDF auswählen.' }
  }
  if (datei.type && datei.type !== 'application/pdf') {
    return { ok: false, error: 'Nur PDF-Dateien können ausgelesen werden.' }
  }
  if (datei.size > MAX_PDF_BYTES) {
    return { ok: false, error: 'Die Datei ist zu groß zum Auslesen — bitte die Felder von Hand ausfüllen.' }
  }

  const base64 = Buffer.from(await datei.arrayBuffer()).toString('base64')
  const ocr = await extractGutachtenFelder({ base64 })
  if (!ocr.ok) {
    // Bewusst KEIN Werfen: das Auslesen ist eine Hilfe, kein Muss. Schlaegt es fehl,
    // fuellt der SV wie bisher von Hand aus — der Vermittlungs-Flow bleibt benutzbar.
    return { ok: false, error: `Auslesen fehlgeschlagen: ${ocr.error}` }
  }

  const f = ocr.felder
  const vorschlag: GutachtenVorschlag = {
    kennzeichen: f.kennzeichen ?? null,
    fahrzeug_typ: f.fahrzeug_typ ?? null,
    betrag: f.reparaturkosten_netto ?? null,
  }
  const gefunden = Object.values(vorschlag).filter((v) => v !== null && v !== '').length

  return { ok: true, vorschlag, gefunden }
}
