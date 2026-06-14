// AAR-166 / AAR-182: ZB1-OCR für Fall-Uploads (Admin Fallakte / Gutachter).
// Shared Parser + Vision-Call liegt in @/lib/ocr/zb1-parser.
// Der Lead-Pfad (Twilio-Inbound-Webhook) nutzt denselben Parser direkt.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runZB1Ocr } from '@/lib/ocr/zb1-parser'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { fall_id, datei_url, image_base64 } = body

    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }
    if (!datei_url && !image_base64) {
      return NextResponse.json({ error: 'datei_url oder image_base64 erforderlich' }, { status: 400 })
    }

    // ─── Step 1: Get image as base64 ────────────────────────────────────────
    let base64Image = image_base64 ?? ''
    if (!base64Image && datei_url) {
      const imgResponse = await fetch(datei_url)
      if (!imgResponse.ok) {
        return NextResponse.json({ error: `Bild konnte nicht geladen werden: ${imgResponse.status}` }, { status: 400 })
      }
      const buffer = await imgResponse.arrayBuffer()
      base64Image = Buffer.from(buffer).toString('base64')
    }

    // ─── Step 2+3: Shared Vision-Call + Parser ─────────────────────────────
    const ocrResult = await runZB1Ocr(base64Image)
    if ('error' in ocrResult) {
      return NextResponse.json(
        { error: ocrResult.error },
        { status: ocrResult.status ?? 500 },
      )
    }
    const { fullText, extracted } = ocrResult

    if (!fullText) {
      return NextResponse.json({
        success: false,
        message: 'Kein Text im Bild erkannt. Bitte besseres Foto hochladen.',
        extracted: null,
        raw_text: '',
      })
    }

    // ─── Step 4: Write to faelle table ──────────────────────────────────────
    const supabase = await createClient()

    const updateData: Record<string, unknown> = {
      ocr_rohdaten: { raw_text: fullText, extracted, timestamp: new Date().toISOString() },
      ocr_extrahiert_am: new Date().toISOString(),
    }

    if (extracted.fin_vin) {
      updateData.fin_vin = extracted.fin_vin
      updateData.fin_quelle = 'fahrzeugschein_ocr'
      updateData.fin_extrahiert_am = new Date().toISOString()
    }
    if (extracted.kennzeichen) updateData.kennzeichen = extracted.kennzeichen
    if (extracted.erstzulassung) updateData.erstzulassung = extracted.erstzulassung
    if (extracted.fahrzeug_baujahr != null) updateData.fahrzeug_baujahr = extracted.fahrzeug_baujahr
    if (extracted.halter_vorname) updateData.halter_vorname = extracted.halter_vorname
    if (extracted.halter_nachname) updateData.halter_nachname = extracted.halter_nachname
    if (extracted.halter_strasse) updateData.halter_strasse = extracted.halter_strasse
    if (extracted.halter_plz) updateData.halter_plz = extracted.halter_plz
    if (extracted.halter_stadt) updateData.halter_stadt = extracted.halter_stadt
    if (extracted.fahrzeug_hersteller) updateData.fahrzeug_hersteller = extracted.fahrzeug_hersteller
    if (extracted.fahrzeug_modell) updateData.fahrzeug_modell = extracted.fahrzeug_modell
    if (extracted.fahrzeug_farbe) updateData.fahrzeug_farbe = extracted.fahrzeug_farbe
    // CMM-48 PR-E: brn ist eine faelle<->claims-Duplikat-Spalte — wird unten
    // direkt auf claims geschrieben (claimUpdate.brn), nicht mehr auf faelle.
    if (extracted.hsn) updateData.hsn = extracted.hsn
    if (extracted.tsn) updateData.tsn = extracted.tsn

    const { data: fallRow, error: updateError } = await supabase
      .from('faelle')
      .update(updateData)
      .eq('id', fall_id)
      .select('claim_id')
      .single()

    if (updateError) {
      console.error('[OCR-ZB1] DB update error:', updateError)
    }

    // Parallel auf claims schreiben — FIN/HSN/TSN/Kennzeichen sind nicht
    // im faelle↔claims Sync-Trigger (CMM Phase 1.5a). Direkt in claims schreiben
    // damit die SSoT für SV/Kanzlei/Reports konsistent ist.
    if (fallRow?.claim_id) {
      // CMM-68 Fix: Fahrzeugdaten (fin_vin/kennzeichen/fahrzeug_*/hsn/tsn/erstzulassung) gehoeren
      // auf vehicles, NICHT auf claims — diese Spalten existieren auf claims gar nicht, der alte
      // claimUpdate failte komplett still (PostgREST lehnt unbekannte Spalten ab). claims behaelt
      // NUR brn (echte claims-Dup-Spalte, CMM-48). Fahrzeug -> vehicles unten.
      const claimUpdate: Record<string, unknown> = {}
      if (extracted.brn) claimUpdate.brn = extracted.brn
      if (Object.keys(claimUpdate).length > 0) {
        const { error: claimError } = await supabase
          .from('claims')
          .update(claimUpdate)
          .eq('id', fallRow.claim_id)
        if (claimError) {
          console.error('[OCR-ZB1] claims update error:', claimError)
        }
      }

      // CMM-68: vehicles-Write-Path. Der Fahrzeugschein-OCR war eine Luecke — schrieb Fahrzeugdaten
      // auf faelle (+ kaputt auf claims), aber NIE auf vehicles. Mit FIN -> dedup-Row (RPC); ohne FIN
      // -> FIN-loser Stub. claims.vehicle_id verlinken. Admin-Client (direkter vehicles-Write/RPC,
      // RLS-frei). Non-critical: ein Fehler bricht den OCR-Lauf nicht.
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const { ensureVehicleFromFin, ensureVehicleForClaim } = await import('@/lib/vehicles/ensure-vehicle')
        const vehDb = createAdminClient()
        const vehSnapshot = {
          kennzeichen: extracted.kennzeichen ?? null,
          hersteller: extracted.fahrzeug_hersteller ?? null,
          modell: extracted.fahrzeug_modell ?? null,
          hsn: extracted.hsn ?? null,
          tsn: extracted.tsn ?? null,
          farbe: extracted.fahrzeug_farbe ?? null,
          baujahr: extracted.fahrzeug_baujahr ?? null,
          erstzulassung: extracted.erstzulassung ?? null,
          finQuelle: 'fahrzeugschein_ocr',
          finExtrahiertAm: new Date().toISOString(),
        }
        if (extracted.fin_vin) {
          const veh = await ensureVehicleFromFin({ fin: extracted.fin_vin, snapshot: vehSnapshot, db: vehDb })
          if (veh.ok) {
            await vehDb.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', fallRow.claim_id)
          } else {
            console.warn('[CMM-68] OCR vehicles (FIN):', veh.error)
          }
        } else {
          const veh = await ensureVehicleForClaim({ claimId: fallRow.claim_id, snapshot: vehSnapshot, db: vehDb })
          if (!veh.ok) console.warn('[CMM-68] OCR vehicles (Stub):', veh.error)
        }
      } catch (err) {
        console.error('[CMM-68] OCR vehicles-Write fehlgeschlagen (non-fatal):', err)
      }
    }

    // ─── Step 5: Timeline entry ─────────────────────────────────────────────
    await supabase.from('timeline').insert({
      fall_id,
      typ: 'ocr-fahrzeugschein',
      titel: extracted.fin_vin
        ? `ZB1 OCR: FIN ${extracted.fin_vin} extrahiert`
        : 'ZB1 OCR durchgeführt (FIN nicht erkannt)',
      beschreibung: [
        extracted.kennzeichen && `KZ: ${extracted.kennzeichen}`,
        extracted.halter_nachname && `Halter: ${extracted.halter_vorname ?? ''} ${extracted.halter_nachname}`,
        extracted.fahrzeug_hersteller && `Fahrzeug: ${extracted.fahrzeug_hersteller} ${extracted.fahrzeug_modell ?? ''}`,
      ].filter(Boolean).join(' · ') || 'Keine Felder erkannt',
    })

    // Cardentity (Vorschaden + erweiterte Fahrzeugdaten) wird NICHT mehr
    // automatisch ausgeloest — die kostenpflichtige VIN-Abfrage ist manuell
    // ueber den Cardentity-Button (dispatch/KB/admin/SV) abrufbar (2026-05-31,
    // Aaron-Entscheidung). Die ZB1-OCR-Erkennung bleibt automatisch (gratis).

    return NextResponse.json({
      success: true,
      extracted,
      raw_text: fullText,
      fin_found: !!extracted.fin_vin,
      fields_found: Object.entries(extracted).filter(([, v]) => v !== null).length,
      message: extracted.fin_vin
        ? `FIN ${extracted.fin_vin} erkannt.`
        : 'Fahrzeugschein ausgelesen. FIN nicht erkannt — bitte manuell eingeben.',
    })
  } catch (err) {
    console.error('[OCR-ZB1] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
