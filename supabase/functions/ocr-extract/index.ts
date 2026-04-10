// KFZ-172 Phase 3: OCR Edge Function fuer Fall-Dokumente.
// Liest Datei aus Storage, schickt an Google Vision API, parsed das
// Ergebnis basierend auf dokument_typ, speichert in fall_dokumente.
//
// Deploy: npx supabase functions deploy ocr-extract
// Trigger: POST /functions/v1/ocr-extract mit { dokument_id }
//
// Wenn GOOGLE_VISION_API_KEY nicht in Supabase Secrets gesetzt ist,
// returned die Funktion einen STUB (echo-back mit dokument_typ als
// extracted_data) damit der Frontend-Flow testbar bleibt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { dokument_id } = await req.json()
    if (!dokument_id) {
      return new Response(JSON.stringify({ error: 'dokument_id fehlt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Dokument laden
    const { data: dok, error: dokErr } = await supabase
      .from('fall_dokumente')
      .select('id, fall_id, dokument_typ, storage_path, mime_type, ocr_status')
      .eq('id', dokument_id)
      .single()

    if (dokErr || !dok) {
      return new Response(JSON.stringify({ error: 'Dokument nicht gefunden' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Status auf processing setzen
    await supabase
      .from('fall_dokumente')
      .update({ ocr_status: 'processing' })
      .eq('id', dokument_id)

    // 2. Datei aus Storage lesen
    const { data: fileData, error: fileErr } = await supabase.storage
      .from('fall-dokumente')
      .download(dok.storage_path)

    if (fileErr || !fileData) {
      await supabase.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokument_id)
      return new Response(JSON.stringify({ error: 'Datei nicht lesbar' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Google Vision API aufrufen (oder Stub)
    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY')
    let extractedData: Record<string, unknown> = {}

    if (apiKey) {
      // LIVE: Google Vision API text_detection
      const arrayBuffer = await fileData.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      const visionResp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            }],
          }),
        },
      )

      const visionData = await visionResp.json()
      const fullText = visionData?.responses?.[0]?.fullTextAnnotation?.text ?? ''

      // Parse basierend auf dokument_typ
      extractedData = {
        raw_text: fullText.slice(0, 2000),
        dokument_typ: dok.dokument_typ,
        parsed: parseByType(dok.dokument_typ, fullText),
      }
    } else {
      // STUB: kein API Key — liefere Test-Daten zurueck
      extractedData = {
        stub: true,
        dokument_typ: dok.dokument_typ,
        hinweis: 'GOOGLE_VISION_API_KEY nicht in Supabase Secrets gesetzt. Dies sind Stub-Daten.',
        parsed: getStubData(dok.dokument_typ),
      }
    }

    // 4. Ergebnis speichern
    await supabase
      .from('fall_dokumente')
      .update({
        ocr_status: 'done',
        ocr_extracted_data: extractedData,
        ocr_processed_at: new Date().toISOString(),
      })
      .eq('id', dokument_id)

    return new Response(JSON.stringify({ success: true, extracted: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Parsing nach Dokument-Typ ────────────────────────────────────────────────

function parseByType(typ: string, text: string): Record<string, string | null> {
  switch (typ) {
    case 'fahrzeugschein':
      return parseFahrzeugschein(text)
    case 'versicherungsschein_eigener':
      return parseVersicherungsschein(text)
    default:
      return { raw_excerpt: text.slice(0, 500) }
  }
}

function parseFahrzeugschein(text: string): Record<string, string | null> {
  const all = text.replace(/\n/g, ' ')
  const finMatch = all.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  const kzMatch = all.match(/\b([A-ZÄÖÜ]{1,3}[\s-][A-Z]{1,2}\s?\d{1,4})\b/)
  const ezMatch = all.match(/\b(\d{2}[./]\d{2}[./]\d{4})\b/)
  return {
    fin: finMatch?.[1] ?? null,
    kennzeichen: kzMatch?.[1] ?? null,
    erstzulassung: ezMatch?.[1] ?? null,
  }
}

function parseVersicherungsschein(text: string): Record<string, string | null> {
  const all = text.replace(/\n/g, ' ')
  const vsMatch = all.match(/(?:VS|Police)[-.:\s]*Nr\.?\s*[:\s]?\s*(\S+)/i)
  const versichererMatch = all.match(/(?:Allianz|HUK|DEVK|AXA|Generali|ADAC|HDI|LVM|VHV)/i)
  return {
    versicherer: versichererMatch?.[0] ?? null,
    vsnummer: vsMatch?.[1] ?? null,
  }
}

// ─── Stub-Daten fuer Tests ohne API-Key ──────────────────────────────────────

function getStubData(typ: string): Record<string, string | null> {
  switch (typ) {
    case 'fahrzeugschein':
      return { fin: 'WBAPH5C55BA123456', kennzeichen: 'K-AB 1234', erstzulassung: '01.06.2020', hersteller: 'BMW', modell: '320d' }
    case 'versicherungsschein_eigener':
      return { versicherer: 'HUK-COBURG', vsnummer: 'VS-2024-987654', versicherter: 'Max Mustermann' }
    case 'personalausweis':
      return { vorname: 'Max', nachname: 'Mustermann', geburtsdatum: '15.03.1985' }
    default:
      return { info: `Stub-Daten fuer ${typ}` }
  }
}
