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

    // Write-Path-Audit (28.06.): Auth-Gate VOR dem fetch(datei_url) (SSRF-Vektor) + dem
    // admin-client-vehicles-Write. War vorher 0 Auth → anon konnte OCR auf jede fall_id
    // triggern, eine beliebige URL serverseitig fetchen + Fahrzeugdaten schreiben. Die Caller
    // sind Browser-Fetches (kunde-Onboarding, SV-Tools) → User-Cookie vorhanden.
    const supabase = await createClient()
    const ocrUser = (await supabase.auth.getUser())?.data?.user ?? null
    if (!ocrUser) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
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

    // ─── Step 4: claim_id via Bridge (CMM-49 faelle-DROP) ───────────────────
    // Frueher schrieb diese Route ocr_rohdaten/ocr_extrahiert_am + halter_* nach faelle und holte
    // dabei die claim_id. Beide Gruppen sind reader-frei: die OCR-Audit-Spalten haben 0 Reader, die
    // halter_* liest niemand direkt (v_claim_full.halter_* sourct aus der ist_halter-Party-Person;
    // das eigentliche halter_*->Person-Routing ist CMM-67-Domaene). Der faelle-Write war also tot
    // -> entfernt. Wir holen nur noch die claim_id aus der Bridge (fall_id == bridge.fall_id) fuer
    // die claims/vehicles-Writes unten -> Route ist faelle-frei (DROP-Enabler). Das extrahierte
    // Halter-Feld bleibt im Timeline-Eintrag (Step 5) human-readable sichtbar.
    const { data: bridge } = await supabase
      .from('faelle_claim_bridge')
      .select('claim_id')
      .eq('fall_id', fall_id)
      .maybeSingle()
    const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null

    // Parallel auf claims schreiben — FIN/HSN/TSN/Kennzeichen sind nicht
    // im faelle↔claims Sync-Trigger (CMM Phase 1.5a). Direkt in claims schreiben
    // damit die SSoT für SV/Kanzlei/Reports konsistent ist.
    if (claimId) {
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
          .eq('id', claimId)
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
          // Vehicle-Unifikation: das aktuelle Claim-Fahrzeug (oft ein FIN-loser Stub aus Flotte/
          // Erstanlage) VOR dem FIN-Upsert lesen und als supersedesVehicleId durchreichen -> die
          // FIN-Row absorbiert den Stub (flotten_fahrzeuge/schadenkarten/... werden umgehaengt).
          const { data: claimRow } = await vehDb.from('claims').select('vehicle_id').eq('id', claimId).maybeSingle()
          const altesFahrzeug = (claimRow?.vehicle_id as string | null) ?? null
          const veh = await ensureVehicleFromFin({ fin: extracted.fin_vin, snapshot: vehSnapshot, db: vehDb, supersedesVehicleId: altesFahrzeug ?? undefined })
          if (veh.ok) {
            const { error: vehFehler } = await vehDb.from('claims').update({ vehicle_id: veh.vehicleId }).eq('id', claimId)
            if (vehFehler) console.error(`[CMM-68] vehicle_id nicht verknuepft (Claim ${claimId}):`, vehFehler.message)
          } else {
            console.warn('[CMM-68] OCR vehicles (FIN):', veh.error)
          }
        } else {
          const veh = await ensureVehicleForClaim({ claimId, snapshot: vehSnapshot, db: vehDb })
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
