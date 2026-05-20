import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

// ─── POST /api/schadenkalkulation ─────────────────────────────────────────────
// Modus A: Fotos → Claude Vision analysiert Schadensfotos
// Modus B: Text  → Claude schätzt anhand Beschreibung + Fahrzeugdaten

const SYSTEM_PROMPT = `Du bist ein KFZ-Schadensexperte. Antworte IMMER als valides JSON mit exakt diesem Schema:
{
  "beschaedigte_teile": ["string"],
  "schweregrad": "leicht" | "mittel" | "schwer",
  "geschaetzte_kosten_min": number,
  "geschaetzte_kosten_max": number,
  "beschreibung": "string"
}
Schätze die Reparaturkosten in Euro basierend auf deutschen Marktpreisen (Markenwerkstatt).
Keine Markdown-Blöcke, kein erläuternder Text – nur das JSON-Objekt.`

type KiResult = {
  beschaedigte_teile: string[]
  schweregrad: 'leicht' | 'mittel' | 'schwer'
  geschaetzte_kosten_min: number
  geschaetzte_kosten_max: number
  beschreibung: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { fall_id, modus, bild_urls, schadensbeschreibung, fahrzeug_typ, fahrzeug_hersteller, fahrzeug_baujahr } = body

    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }
    if (modus !== 'fotos' && modus !== 'text') {
      return NextResponse.json({ error: 'modus muss "fotos" oder "text" sein' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey })
    let result: KiResult

    if (modus === 'fotos') {
      // ── Modus A: Fotos ──────────────────────────────────────────────────────
      if (!bild_urls || !Array.isArray(bild_urls) || bild_urls.length === 0) {
        return NextResponse.json({ error: 'bild_urls Array erforderlich' }, { status: 400 })
      }

      const imageContent: Anthropic.Messages.ImageBlockParam[] = bild_urls.slice(0, 8).map((url: string) => ({
        type: 'image' as const,
        source: { type: 'url' as const, url },
      }))

      const response = await anthropic.messages.create({
        model: AI_MODELS.ocr,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: 'Analysiere diese KFZ-Schadensfotos. Beschreibe den sichtbaren Schaden. Schätze die Reparaturkosten in Euro basierend auf deutschen Marktpreisen.',
            },
          ],
        }],
      })

      const text = response.content.find(b => b.type === 'text')?.text ?? '{}'
      result = JSON.parse(text)
    } else {
      // ── Modus B: Text ───────────────────────────────────────────────────────
      if (!schadensbeschreibung) {
        return NextResponse.json({ error: 'schadensbeschreibung erforderlich' }, { status: 400 })
      }

      const prompt = `Basierend auf dieser Schadensbeschreibung an einem ${fahrzeug_hersteller ?? 'unbekannt'} ${fahrzeug_typ ?? ''} Baujahr ${fahrzeug_baujahr ?? 'unbekannt'}, schätze die Reparaturkosten in Euro:\n\n${schadensbeschreibung}`

      const response = await anthropic.messages.create({
        model: AI_MODELS.ocr,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content.find(b => b.type === 'text')?.text ?? '{}'
      result = JSON.parse(text)
    }

    // ── Ergebnis speichern ──────────────────────────────────────────────────
    // CMM-44 SP-G PR2: ki_kalkulation/* → gutachten (SSoT). claim_id + sv_id zuerst laden.
    // sv_id zwingend, weil gutachten.sv_id NOT NULL ohne Default — sonst NOT-NULL-Verstoss
    // bei Fällen ohne existierende gutachten-Row.
    const supabase = await createClient()
    const { data: fallRow } = await supabase
      .from('faelle')
      .select('claim_id, sv_id')
      .eq('id', fall_id)
      .maybeSingle()
    if (fallRow?.claim_id) {
      const { error: gErr } = await supabase.from('gutachten').upsert(
        {
          claim_id: fallRow.claim_id as string,
          sv_id: fallRow.sv_id as string,
          ki_kalkulation: result,
          ki_kalkulation_am: new Date().toISOString(),
          ki_geschaetzte_kosten_min: result.geschaetzte_kosten_min,
          ki_geschaetzte_kosten_max: result.geschaetzte_kosten_max,
        },
        { onConflict: 'claim_id' },
      )
      if (gErr) {
        console.error('[CMM-44 SP-G] schadenkalkulation gutachten-upsert fehlgeschlagen:', gErr.message)
        return NextResponse.json({ success: false, error: gErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('KI-Schadenkalkulation Fehler:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
