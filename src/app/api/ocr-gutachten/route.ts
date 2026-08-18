import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ─── Regex patterns for German damage assessment reports ─────────────────────

const PATTERNS = {
  schadenhoehe_netto: [
    /(?:Netto[- ]?Reparaturkosten|Reparaturkosten\s*(?:\(netto\))?|Schadenhöhe\s*(?:netto)?)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /(?:Netto-RK|Netto RK)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  wiederbeschaffungswert: [
    /Wiederbeschaffungswert\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /WBW\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  restwert: [
    /Restwert\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /RW\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  nutzungsausfall_tage: [
    /Nutzungsausfall\s*(?:dauer)?\s*[:\s]*(\d+)\s*(?:Tage?|Kalendertage)/i,
    /Ausfallzeit\s*[:\s]*(\d+)\s*(?:Tage?)/i,
  ],
  nutzungsausfall_tagessatz: [
    /Nutzungsausfall\s*(?:Tagessatz|pro Tag)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /Tagessatz\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  reparaturdauer_tage: [
    /Reparaturdauer\s*[:\s]*(\d+)\s*(?:Arbeitstage|Tage)/i,
    /(?:voraussichtliche\s*)?Reparaturzeit\s*[:\s]*(\d+)/i,
  ],
  gutachter_honorar: [
    /(?:Gutachter[- ]?Honorar|Sachverständigenkosten|SV-Kosten|Honorar)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  fin_vin: [
    /(?:FIN|VIN|Fahrzeug-Ident(?:ifikations)?-?Nr|Fahrgestellnummer)\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    /\b(W[A-Z0-9]{2}[A-HJ-NPR-Z0-9]{14})\b/, // German VINs start with W
  ],
}

function parseGermanNumber(str: string): number {
  // "1.234,56" → 1234.56
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

function extractField(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

// ─── POST /api/ocr-gutachten ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Write-Path-Audit (28.06.): interner Server-to-Server-Endpoint (vom gutachter/fall-
    // Action nach Gutachten-Upload getriggert). Vorher 0 Auth → anon konnte Gutachten-/
    // Claim-Finanzwerte (schadens_hoehe_netto, restwert, WBW, …) auf JEDE fall_id schreiben
    // (createAdminClient/RLS-Bypass) + eine beliebige pdf_url serverseitig fetchen (SSRF).
    // Jetzt Bearer-CRON_SECRET-Gate (der Caller sendet ihn).
    const authHeader = request.headers.get('authorization') ?? ''
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { fall_id, pdf_url } = await request.json()
    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Download PDF from Supabase Storage
    let pdfText = ''
    if (pdf_url) {
      try {
        const response = await fetch(pdf_url)
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          // pdf-parse v2 (2.4.x): Klassen-API — new PDFParse({data}).getText().
          // Die alte v1-Funktions-API (require('pdf-parse')(buffer)) existiert
          // nicht mehr; ihr Aufruf warf "pdfParse is not a function" und liess
          // pdfText leer -> Route stieg immer mit "PDF konnte nicht ..." aus.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse')
          const parser = new PDFParse({ data: buffer })
          try {
            pdfText = (await parser.getText()).text
          } finally {
            await parser.destroy()
          }
        }
      } catch (e) {
        console.error('PDF parse error:', e)
      }
    }

    if (!pdfText) {
      return NextResponse.json({
        success: false,
        message: 'PDF konnte nicht ausgelesen werden. Bitte Werte manuell eingeben.',
        extracted: {},
      })
    }

    // Extract fields
    const schadenhoehe_raw = extractField(pdfText, PATTERNS.schadenhoehe_netto)
    const wbw_raw = extractField(pdfText, PATTERNS.wiederbeschaffungswert)
    const restwert_raw = extractField(pdfText, PATTERNS.restwert)
    const nutzungsausfall_tage_raw = extractField(pdfText, PATTERNS.nutzungsausfall_tage)
    const nutzungsausfall_tagessatz_raw = extractField(pdfText, PATTERNS.nutzungsausfall_tagessatz)
    const reparaturdauer_raw = extractField(pdfText, PATTERNS.reparaturdauer_tage)
    const honorar_raw = extractField(pdfText, PATTERNS.gutachter_honorar)
    const fin_raw = extractField(pdfText, PATTERNS.fin_vin)

    const schadenhoehe_netto = schadenhoehe_raw ? parseGermanNumber(schadenhoehe_raw) : null
    const wiederbeschaffungswert = wbw_raw ? parseGermanNumber(wbw_raw) : null
    const restwert = restwert_raw ? parseGermanNumber(restwert_raw) : null
    const nutzungsausfall_tage = nutzungsausfall_tage_raw ? parseInt(nutzungsausfall_tage_raw) : null
    const nutzungsausfall_tagessatz = nutzungsausfall_tagessatz_raw ? parseGermanNumber(nutzungsausfall_tagessatz_raw) : null
    const reparaturdauer_tage = reparaturdauer_raw ? parseInt(reparaturdauer_raw) : null
    const gutachter_honorar = honorar_raw ? parseGermanNumber(honorar_raw) : null
    const fin_vin = fin_raw ?? null

    // Determine if total loss. Bleibt null wenn weder aus WBW/Schadenhoehe
    // ableitbar noch das Wort "totalschaden" im PDF vorkommt — sonst wuerde ein
    // unbedingtes false beim apply_gutachten_ocr-COALESCE-Merge ein bereits
    // gesetztes Totalschaden-Flag ueberschreiben.
    const totalschaden: boolean | null =
      wiederbeschaffungswert != null && schadenhoehe_netto != null
        ? schadenhoehe_netto > wiederbeschaffungswert
        : pdfText.toLowerCase().includes('totalschaden')
          ? true
          : null

    const extracted = {
      schadenhoehe_netto,
      wiederbeschaffungswert,
      restwert,
      nutzungsausfall_tage,
      nutzungsausfall_tagessatz,
      reparaturdauer_tage,
      gutachter_honorar,
      fin_vin,
      totalschaden,
    }

    // Routing der OCR-Werte (kein faelle-Write mehr — s. Bridge-Block + Begruendung unten):
    //   5 G-Werte (restwert/WBW/nutzungsausfall_tage/totalschaden/gutachter_honorar) -> gutachten via RPC apply_gutachten_ocr;
    //   schadens_hoehe_netto -> claims (SSoT); fin_vin -> vehicles. Analog lib/ai/gutachten-ocr.ts.
    // CMM-49 faelle-DROP: der faelle-Write war komplett reader-frei -> entfernt. Wir holen nur noch
    // die claim_id aus der Bridge (fall_id == bridge.fall_id) fuer die gutachten-RPC / claims /
    // vehicles-Writes unten. Reader-frei-Begruendung der entfallenen Felder:
    //   - ocr_rohdaten / ocr_extrahiert_am : 0 Reader (OCR-Audit).
    //   - fin_vin                          : v_claim_full liest vehicles.fin; unten eh -> vehicles.
    //   - nutzungsausfall_tagessatz        : accept-loss (fall-finanzen); canonical = AI-OCR-Feld
    //                                        gutachten_nutzungsausfall_tagessatz_eur.
    //   - reparaturdauer_tage              : reader-frei (nur Test-Seed).
    const { data: bridge } = await admin
      .from('faelle_claim_bridge')
      .select('claim_id')
      .eq('fall_id', fall_id)
      .maybeSingle()
    const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null

    // Die 4 G-Werte (restwert, WBW, nutzungsausfall_tage, totalschaden) gehen in
    // die gutachten-Sub-Tabelle. apply_gutachten_ocr legt/aktualisiert den Row
    // per ON CONFLICT mit COALESCE-Merge. Non-critical — ein RPC-Fehler darf den
    // bereits erfolgten faelle-Write nicht zuruecknehmen.
    const gutachtenWerte: Record<string, unknown> = {}
    if (wiederbeschaffungswert != null) gutachtenWerte.wiederbeschaffungswert = wiederbeschaffungswert
    if (restwert != null) gutachtenWerte.restwert = restwert
    if (nutzungsausfall_tage != null) gutachtenWerte.nutzungsausfall_tage = nutzungsausfall_tage
    if (totalschaden != null) gutachtenWerte.totalschaden = totalschaden
    // CMM-49: gutachter_honorar kanonisch -> gutachten.gutachten_sv_honorar_netto
    // (Reader v_faelle_mit_aktuellem_termin.gutachter_honorar liest genau diese Spalte;
    //  Editor-Override via GUTACHTEN_FIELD_MAP in stammdaten.ts).
    if (gutachter_honorar != null) gutachtenWerte.gutachten_sv_honorar_netto = gutachter_honorar

    // gutachten.gutachten_ocr_manuell_ueberschrieben ist NOT NULL DEFAULT false;
    // apply_gutachten_ocr inserted die Spalte beim Fresh-Row explizit aus
    // p_values -> beim expliziten Insert greift der Spalten-DEFAULT nicht, ohne
    // den Key schlaegt der Insert mit not-null-violation fehl. Automatisierte
    // OCR-Werte sind per Definition nicht manuell ueberschrieben -> false.
    if (Object.keys(gutachtenWerte).length > 0) {
      gutachtenWerte.gutachten_ocr_manuell_ueberschrieben = false
    }

    // CMM-68: fin_vin gehoert auf vehicles (Gutachten-OCR war eine Luecke — schrieb faelle.fin_vin,
    // aber nie vehicles; analog zur ocr-fahrzeugschein-Luecke in #2818). FIN -> dedup-Row via RPC +
    // claims.vehicle_id verlinken (FIN ist autoritativ -> Merge auf bestehendes Fahrzeug).
    // CMM-49 faelle-DROP: der faelle.fin_vin-Write oben ist jetzt ENTFERNT — vehicles ist der einzige Pfad.
    if (fin_vin && claimId) {
      try {
        const { ensureVehicleFromFin } = await import('@/lib/vehicles/ensure-vehicle')
        const veh = await ensureVehicleFromFin({
          fin: fin_vin,
          snapshot: { finQuelle: 'gutachten_ocr', finExtrahiertAm: new Date().toISOString() },
          db: admin,
        })
        if (veh.ok) {
          const { error: vehFehler } = await admin.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', claimId)
          if (vehFehler) console.error(`[CMM-68] vehicle_id nicht verknuepft (Claim ${claimId}):`, vehFehler.message)
        } else {
          console.warn('[CMM-68] ocr-gutachten vehicles (FIN):', veh.error)
        }
      } catch (err) {
        console.error('[CMM-68] ocr-gutachten vehicles-Write fehlgeschlagen (non-fatal):', err)
      }
    }

    // CMM-44 SP-B PR2c: schadens_hoehe_netto auf claims schreiben (SSoT).
    if (claimId && schadenhoehe_netto != null) {
      const { error: claimOcrErr } = await admin
        .from('claims')
        .update({ schadens_hoehe_netto: schadenhoehe_netto })
        .eq('id', claimId)
      if (claimOcrErr) {
        console.error('[ocr-gutachten] claims-Update (schadens_hoehe_netto) fehlgeschlagen:', claimOcrErr.message)
      }
    }

    if (claimId && Object.keys(gutachtenWerte).length > 0) {
      const { error: gutachtenError } = await admin.rpc('apply_gutachten_ocr', {
        p_claim_id: claimId,
        p_values: gutachtenWerte,
      })
      if (gutachtenError) {
        console.error('[ocr-gutachten] apply_gutachten_ocr fehlgeschlagen:', gutachtenError.message)
      }
    } else if (!claimId) {
      console.warn(`[ocr-gutachten] Fall ${fall_id} ohne claim_id — G-Werte nicht in gutachten gespeichert`)
    }

    return NextResponse.json({
      success: true,
      extracted,
      fieldsFound: Object.entries(extracted).filter(([, v]) => v != null).length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
