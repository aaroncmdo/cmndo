// AAR-pflicht-sync: Bridge zwischen Lead-Daten und Pflichtdokumente-Status.
//
// Bug vor diesem Helper: createPflichtdokumenteFromKatalog legt alle Slots
// mit `status='ausstehend'` an — auch dann, wenn der Lead bereits einen
// ZB1, Polizeibericht oder Schadensfoto hochgeladen hat. Der Kunde sah
// danach „X Pflichtdokumente fehlen" obwohl die Files längst da waren.
//
// Der Helper liest alle pflichtdokumente eines Falls, mappt Lead-Felder
// auf Slot-IDs und setzt status='hochgeladen' + dokument_url + hochgeladen_am
// für die Slots wo der Lead einen Wert hat. Idempotent: ändert nichts wenn
// status bereits hochgeladen/geprueft.
//
// Aufrufer: nach jedem createPflichtdokumenteFromKatalog (signSAandCreateFall,
// finalizeKundeSetup, convertLeadToFall) damit Folge-UI (Kunde-Banner,
// SV-Auftrag-Counter) den korrekten Stand zeigt.

import type { SupabaseClient } from '@supabase/supabase-js'

type LeadDocs = Record<string, unknown> | null | undefined

type SlotMapping = {
  slotId: string
  url: string
}

/**
 * Mapped Lead-Felder auf Pflicht-Slot-IDs. Liefert pro Lead-Wert den
 * passenden Slot mit URL — Slots werden nachgelagert mit pflichtdokumente
 * abgeglichen, fehlende Slots ignoriert.
 */
function mapLeadToSlots(lead: LeadDocs): SlotMapping[] {
  if (!lead) return []
  const out: SlotMapping[] = []
  const leadAny = lead as Record<string, unknown>

  const zb1Url = leadAny.zb1_url as string | null | undefined
  if (zb1Url) out.push({ slotId: 'fahrzeugschein', url: zb1Url })

  const polizeiUrl = leadAny.polizeibericht_url as string | null | undefined
  if (polizeiUrl) {
    // Zwei Slot-Aliase je nach Katalog-Version
    out.push({ slotId: 'polizeibericht', url: polizeiUrl })
    out.push({ slotId: 'polizeiliche_unfallmitteilung', url: polizeiUrl })
  }

  const skizzeUrl = leadAny.unfallskizze_url as string | null | undefined
  if (skizzeUrl) out.push({ slotId: 'unfallskizze', url: skizzeUrl })

  // Schadensfotos: jsonb-Array → Slot 'schadensfotos' / 'unfallfotos'
  const fotos = Array.isArray(leadAny.schadensfoto_urls)
    ? (leadAny.schadensfoto_urls as string[])
    : []
  if (fotos.length > 0) {
    const firstFoto = fotos.find((u) => typeof u === 'string' && u.length > 0)
    if (firstFoto) {
      out.push({ slotId: 'schadensfotos', url: firstFoto })
      out.push({ slotId: 'unfallfotos', url: firstFoto })
    }
  }

  return out
}

/**
 * Setzt pflichtdokumente.status auf 'hochgeladen' für jeden Slot wo der
 * Lead bereits eine URL liefert. Updates nur Rows mit status='ausstehend'
 * (idempotent gegenüber später hochgeladenen oder geprüften Slots).
 */
export async function syncLeadDokumenteAnPflicht(
  supabase: SupabaseClient,
  fallId: string,
  lead: LeadDocs,
): Promise<void> {
  const slotMappings = mapLeadToSlots(lead)
  if (slotMappings.length === 0) return

  // Bestehende Pflicht-Rows holen — wir updaten nur was existiert
  const slotIds = Array.from(new Set(slotMappings.map((m) => m.slotId)))
  const { data: pflichtRows } = await supabase
    .from('pflichtdokumente')
    .select('id, dokument_typ, status, dokument_url')
    .eq('fall_id', fallId)
    .in('dokument_typ', slotIds)

  if (!pflichtRows || pflichtRows.length === 0) return

  const now = new Date().toISOString()
  for (const row of pflichtRows as Array<{
    id: string
    dokument_typ: string | null
    status: string | null
    dokument_url: string | null
  }>) {
    // Schon hochgeladen/geprueft → nichts tun
    if (row.status === 'hochgeladen' || row.status === 'geprueft') continue
    // Schon dokument_url gesetzt (z.B. nachträglich gesetzt) → nichts tun
    if (row.dokument_url) continue
    const mapping = slotMappings.find((m) => m.slotId === row.dokument_typ)
    if (!mapping) continue

    await supabase
      .from('pflichtdokumente')
      .update({
        status: 'hochgeladen',
        dokument_url: mapping.url,
        hochgeladen_am: now,
      })
      .eq('id', row.id)
  }
}
