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
import { parseStorageUrl } from '@/lib/storage/url'

/** Der Bucket, in dem Fall-Dokumente liegen. Eine URL auf einen anderen ist nicht unsere Datei. */
const BUCKET = 'fall-dokumente'

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
 * Zieht den Storage-Pfad aus dem, was in `pflichtdokumente.dokument_url` steht. Pure.
 *
 * ⭐⭐ Das Feld heißt „url", trägt aber **zwei Formen** — auf prod gemessen (28.08., 10 belegte
 * Slots), und die zweite ist die häufigere:
 *
 *   1) volle URL      `https://….supabase.co/storage/v1/object/public/fall-dokumente/claims/…`   3×
 *   2) nackter Pfad   `leads/bea4fa1d…/zb1_flow_….webp`                                          7×
 *
 * Eine erste Fassung suchte nur nach `fall-dokumente/` und lieferte für Form 2 `null` — der
 * Fix hätte also **die Mehrheit der realen Fälle nicht getroffen**, obwohl er korrekt aussah
 * und seine Tests grün waren. Aufgefallen ist es erst am Backfill-Vorschaulauf: 1 statt 3
 * erwarteter Zeilen. **Ein Feldname ist kein Formatvertrag.**
 *
 * Signierte URLs (`/object/sign/…?token=…`) sind ebenfalls abgedeckt; Query-String und
 * Fragment gehören nicht zum Pfad.
 */
export function storagePfadAusUrl(url: string | null | undefined): string | null {
  if (!url) return null

  // Form 1 über den zentralen Helfer — der kennt alle drei Supabase-Varianten
  // (`/object/public|sign|authenticated/…`) und dekodiert prozent-kodierte Segmente.
  // Ein eigener Parser hier hätte `%20` in Dateinamen verschluckt.
  const geparst = parseStorageUrl(url)
  if (geparst) return geparst.bucket === BUCKET ? geparst.path : null

  // Form 2: bereits ein Storage-Pfad. Alles mit Host ist dagegen eine FREMDE URL
  // (anderer Dienst) — daraus einen Pfad zu raten wäre falsch.
  const ohneQuery = url.split('?')[0]?.split('#')[0] ?? ''
  if (ohneQuery.length === 0 || /^[a-z]+:\/\//i.test(ohneQuery)) return null
  const pfad = ohneQuery.replace(/^\/+/, '')
  return pfad.includes('/') ? pfad : null
}

/**
 * Entscheidet, welche Akten-Zeilen fehlen. Pure — der Write liegt beim Aufrufer.
 *
 * ⭐ Zwei Quellen von Doppeleinträgen, beide real:
 *  1. **Slot-Aliase**: `polizeibericht` + `polizeiliche_unfallmitteilung` (und
 *     `schadensfotos` + `unfallfotos`) zeigen auf DIESELBE Datei. Ohne Dedup läge sie
 *     zweimal in der Akte.
 *  2. **Der unfallfotos-Nachzug in `convert-lead-to-fall` (Schritt 5) läuft VORHER** und legt
 *     `schadensfotos` bereits an. Deshalb wird gegen die vorhandenen Pfade geprüft, nicht
 *     blind eingefügt.
 */
export function fehlendeAktenZeilen(
  slots: ReadonlyArray<{ id: string; dokument_typ: string | null; url: string }>,
  vorhandenePfade: ReadonlySet<string>,
): Array<{ pflichtdokument_id: string; dokument_typ: string; storage_path: string }> {
  const out: Array<{ pflichtdokument_id: string; dokument_typ: string; storage_path: string }> = []
  const gesehen = new Set(vorhandenePfade)
  for (const s of slots) {
    if (!s.dokument_typ) continue
    const pfad = storagePfadAusUrl(s.url)
    if (!pfad || gesehen.has(pfad)) continue
    gesehen.add(pfad)
    out.push({ pflichtdokument_id: s.id, dokument_typ: s.dokument_typ, storage_path: pfad })
  }
  return out
}

/**
 * Setzt pflichtdokumente.status auf 'hochgeladen' für jeden Slot wo der
 * Lead bereits eine URL liefert. Updates nur Rows mit status='ausstehend'
 * (idempotent gegenüber später hochgeladenen oder geprüften Slots).
 *
 * ⭐⭐ Legt ZUSÄTZLICH die fehlende `fall_dokumente`-Zeile an. Vorher endete der Weg hier:
 * der Slot stand auf „hochgeladen" mit URL, in der **Dokumentenliste der Akte** tauchte die
 * Datei aber nie auf — SV und KB arbeiteten ohne ein Dokument, das längst vorlag.
 *
 * Prod-Messung 28.08. (der Anlass): `convert-lead-to-fall` zog nur `unfallfotos` nach
 * `fall_dokumente` nach; alles andere blieb allein im Slot.
 *
 *   CLM-2026-03507  fahrzeugschein   Slot 'hochgeladen' + URL  →  0 Zeilen in fall_dokumente
 *   CLM-2026-03507  polizeibericht   Slot 'hochgeladen' + URL  →  0
 *   CLM-2026-05265  fahrzeugschein   Slot 'hochgeladen' + URL  →  0
 *
 * Zwischen Upload und Fall-Anlage lagen real 1–4 Minuten — das ist der normale Ablauf,
 * wenn der Kunde den Magic-Link sofort bedient, kein Randfall.
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
  // Alle Slots, die am Ende eine URL tragen — egal ob sie sie schon hatten oder gerade
  // bekommen. Der Akten-Nachzug unten braucht BEIDE: der gemessene Fehlerfall war genau
  // der Slot, der bereits auf 'hochgeladen' stand und trotzdem keine Akten-Zeile hatte.
  const mitUrl: Array<{ id: string; dokument_typ: string | null; url: string }> = []

  for (const row of pflichtRows as Array<{
    id: string
    dokument_typ: string | null
    status: string | null
    dokument_url: string | null
  }>) {
    const mapping = slotMappings.find((m) => m.slotId === row.dokument_typ)
    const bereitsErledigt = row.status === 'hochgeladen' || row.status === 'geprueft'

    // Slot-Update nur wenn wirklich offen (idempotent wie bisher).
    if (!bereitsErledigt && !row.dokument_url && mapping) {
      // Ohne diesen Write gilt der Slot weiter als unbefuellt, obwohl das Dokument
      // vorliegt — der Vorgang haengt dann an einem Dokument, das laengst da ist.
      const { error: slotFehler } = await supabase
        .from('pflichtdokumente')
        .update({ status: 'hochgeladen', dokument_url: mapping.url, hochgeladen_am: now })
        .eq('id', row.id)
      if (slotFehler) {
        console.error(`[sync-lead-zu-pflicht] Slot ${row.dokument_typ} nicht befuellt (${row.id}):`, slotFehler.message)
      }
    }

    const url = row.dokument_url ?? mapping?.url ?? null
    if (url) mitUrl.push({ id: row.id, dokument_typ: row.dokument_typ, url })
  }

  await ziehteAkteNach(supabase, fallId, mitUrl)
}

/**
 * Legt für jeden belegten Slot die fehlende `fall_dokumente`-Zeile an (s. Kommentar oben).
 * Non-critical: ein Fehlschlag wird geloggt, bricht den Sync aber nicht ab — der Slot selbst
 * ist bereits korrekt gesetzt.
 */
async function ziehteAkteNach(
  supabase: SupabaseClient,
  fallId: string,
  mitUrl: ReadonlyArray<{ id: string; dokument_typ: string | null; url: string }>,
): Promise<void> {
  if (mitUrl.length === 0) return

  const { data: vorhanden, error: leseFehler } = await supabase
    .from('fall_dokumente')
    .select('storage_path')
    .eq('fall_id', fallId)
  if (leseFehler) {
    console.error('[sync-lead-zu-pflicht] Akten-Bestand nicht lesbar:', leseFehler.message)
    return // lieber nichts anlegen als Duplikate riskieren
  }

  const vorhandenePfade = new Set(
    ((vorhanden ?? []) as Array<{ storage_path: string | null }>)
      .map((d) => d.storage_path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0),
  )

  const fehlend = fehlendeAktenZeilen(mitUrl, vorhandenePfade)
  if (fehlend.length === 0) return

  const { error: insertFehler } = await supabase.from('fall_dokumente').insert(
    fehlend.map((f) => ({
      fall_id: fallId,
      pflichtdokument_id: f.pflichtdokument_id,
      dokument_typ: f.dokument_typ,
      storage_path: f.storage_path,
      original_filename: f.storage_path.split('/').pop() ?? f.dokument_typ,
      uploaded_by_kunde: true,
      beschreibung: 'Vor der Fall-Anlage hochgeladen',
      hochgeladen_am: new Date().toISOString(),
    })),
  )
  if (insertFehler) {
    console.error(
      `[sync-lead-zu-pflicht] Akten-Nachzug fehlgeschlagen (fall ${fallId}, ${fehlend.length} Zeile(n)):`,
      insertFehler.message,
    )
  }
}
