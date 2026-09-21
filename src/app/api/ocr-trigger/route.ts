import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verarbeiteDokumentOcr } from '@/lib/ocr/verarbeite-dokument'

// KFZ-172 / Aaron 13.07.: OCR-Trigger fuer fall_dokumente — Claude Vision statt
// Google Cloud Vision. Die eigentliche Verarbeitung liegt seit 21.09.2026 in
// @/lib/ocr/verarbeite-dokument; diese Route ist nur noch der HTTP-Eingang.
//
// Wer ruft hier an: der Offline-Handler (src/lib/offline/handlers/
// fall-dokument-upload.ts) schickt einen RELATIVEN Request aus dem BROWSER — der
// traegt Cookies, die Wache unten greift also wie gedacht.
//
// Wer NICHT mehr anruft: uploadFallDokument. Eine Server-Action rief diese Route
// frueher per fetch() auf der eigenen oeffentlichen Adresse auf; ein server-seitiger
// fetch() hat keinen Cookie-Jar, also antwortete die Wache mit 401 — VOR dem ersten
// Status-Schreiben, weshalb es kein einziges 'processing' gab. Sie ruft die Funktion
// jetzt direkt auf (#6017 -> Folge-PR). Der HTTP-Vertrag hier bleibt unveraendert.
//
// ACHTUNG: Die Wache unten prueft nur die ANMELDUNG, keine Berechtigung auf das
// konkrete Dokument. Wer diesen Eingang erweitert, prueft das mit.

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const dokumentId: string | undefined = body?.dokument_id
  if (!dokumentId) return NextResponse.json({ error: 'dokument_id fehlt' }, { status: 400 })

  const ergebnis = await verarbeiteDokumentOcr(dokumentId)
  if (ergebnis.ok) return NextResponse.json({ success: true, extracted: ergebnis.extracted })

  // Statuscodes unveraendert gegenueber der Fassung vor dem Herausloesen:
  // Dokument fehlt -> 404, Datei nicht lesbar -> 500, OCR selbst gescheitert -> 502.
  const status = ergebnis.grund === 'nicht_gefunden' ? 404 : ergebnis.grund === 'datei_nicht_lesbar' ? 500 : 502
  return NextResponse.json({ error: ergebnis.fehler }, { status })
}
