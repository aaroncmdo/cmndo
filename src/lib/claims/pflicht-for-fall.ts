// CMM-23: Loader für die Pflichtdokumente-Liste pro Fall.
// Identische Filter-Logik wie der Customer-Onboarding-Pfad
// (uploadbar_von='kunde' Katalog-Filter + Smart-Filter conditions in
// data-requirements.ts) — damit der SV/KB exakt das sieht was der
// Kunde sieht, plus die Files mit Download-URL.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { Rolle } from '@/lib/claims/types'
import { getOffeneDokumentAnforderungen } from '@/lib/claims/data-requirements'
import type { PflichtdokumentStand } from '@/app/kunde/onboarding/actions'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'
import { getStorageUrl, resignStorageUrl } from '@/lib/storage/url'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { buildDokumentKontext } from '@/lib/dokumente/build-kontext'

type PflichtRow = {
  id: string
  dokument_typ: string | null
  status: string | null
  pflicht: boolean | null
  dokument_url: string | null
  hochgeladen_am: string | null
  frist: string | null
  begruendung: string | null
  angefordert_von_rolle: string | null
  angefordert_am: string | null
  sort_order: number | null
}

/**
 * Liefert die für SV/KB relevanten Pflichtdokumente-Slots eines Falls
 * inkl. hochgeladener Files mit Download-URL. Filter: nur Slots wo der
 * Kunde uploaden kann (inkl. Legacy-Slots ohne Katalog-Eintrag).
 */
export async function getPflichtdokumenteForFall(
  supabase: SupabaseClient,
  fallId: string,
  rolle: Rolle = 'sv',
): Promise<PflichtSlotForView[]> {
  try {
    const claimId = await resolveClaimId(supabase, fallId)
    if (!claimId) return []

    const claim = await getClaimForRole(supabase, claimId, rolle)
    if (!claim) return []

    const admin = createAdminClient()

    // Parallel: pflichtdokumente, Katalog, fall_dokumente
    //
    // Alle drei ueber den Admin-Client: Der Zugriff ist oben bereits
    // rollengeprueft (`getClaimForRole(supabase, claimId, rolle)` — ohne
    // Berechtigung steht die Funktion mit `return []`), und die Slots gehoeren
    // zu genau diesem Claim. Die Slot-Query lief als einzige der drei ueber den
    // RLS-Client, und die SELECT-Policy `pflichtdokumente__b1sel_au` kennt nur
    // admin bzw. den Claim-Bezug (Kunde/SV) — den Kundenbetreuer nicht.
    // Gemessen 29.08. als test-kb: 0 von 5 Zeilen sichtbar. Folge: keine
    // `pflichtdokument_id` in der Ansicht, und der Upload brach mit
    // "Slot noch nicht initialisiert" ab, obwohl die Slots existieren.
    const [pflichtRes, katalogRes, dokRes] = await Promise.all([
      admin
        .from('pflichtdokumente')
        .select('id, dokument_typ, status, pflicht, dokument_url, hochgeladen_am, frist, begruendung, angefordert_von_rolle, angefordert_am, sort_order')
        .eq('fall_id', fallId),
      admin
        .from('dokument_katalog')
        .select('slot_id, label, beschreibung, uploadbar_von'),
      admin
        .from('fall_dokumente')
        .select('id, dokument_typ, pflichtdokument_id, storage_path, original_filename, hochgeladen_am')
        .eq('fall_id', fallId)
        .is('geloescht_am', null),
    ])

    const pflichtRows = (pflichtRes.data ?? []) as PflichtRow[]
    const katalog = (katalogRes.data ?? []) as Array<{
      slot_id: string
      label: string
      beschreibung: string | null
      uploadbar_von: string[] | null
    }>

    const katalogMap = new Map(
      katalog.map((k) => [
        k.slot_id,
        {
          label: k.label,
          beschreibung: k.beschreibung,
          uploadbar_von: (k.uploadbar_von ?? []) as string[],
        },
      ]),
    )

    // Filter wie getPflichtdokumenteStand (AAR-362): nur Slots wo Kunde
    // uploaden kann; Legacy-Slots ohne Katalog-Eintrag durchlassen.
    // `pflichtdokumente` hat KEINEN storage_path — die gespeicherte `dokument_url` ist die
    // EINZIGE Referenz auf die Datei. Sie ist aber kein dauerhafter Zugriff: `fall-dokumente`
    // ist ein PRIVATER Bucket, d.h. eine getPublicUrl darauf liefert HTTP 400, und mit
    // STORAGE_USE_SIGNED_URLS=true laeuft die signierte URL nach ihrer TTL ab. Beim Rendern
    // (DokumenteTab -> href) muss sie daher aus sich selbst heraus FRISCH signiert werden:
    // resignStorageUrl parst Bucket+Pfad aus der URL. Nicht-Storage-URLs parsen nicht und
    // fallen unveraendert durch (graceful).
    const kundeRelevante: PflichtdokumentStand[] = await Promise.all(
      pflichtRows
        .filter((r) => {
          const slot = r.dokument_typ ?? ''
          const k = katalogMap.get(slot)
          if (!k) return true
          return k.uploadbar_von.includes('kunde')
        })
        .map(async (r) => {
          const k = katalogMap.get(r.dokument_typ ?? '')
          return {
            id: r.id,
            slot_id: r.dokument_typ ?? '',
            label: k?.label ?? r.dokument_typ ?? '',
            beschreibung: k?.beschreibung ?? null,
            status: r.status ?? 'ausstehend',
            pflicht: !!r.pflicht,
            dokument_url: (await resignStorageUrl(admin, r.dokument_url)) ?? r.dokument_url ?? null,
            hochgeladen_am: r.hochgeladen_am ?? null,
            frist: r.frist ?? null,
            begruendung: r.begruendung ?? null,
            angefordert_von_rolle: r.angefordert_von_rolle ?? null,
            angefordert_am: r.angefordert_am ?? null,
            multi_file: false,
            max_mb: 10,
            akzeptierte_mime_types: [],
            sort_order: r.sort_order ?? 999,
            hochgeladene_anzahl: 0,
          }
        }),
    )

    // Smart-Filter conditions: polizei_vor_ort, hat_personenschaden, etc.
    // FIX: Lead vollstaendig laden damit konditionale Katalog-Slots korrekt evaluieren
    // (finanzierung_leasing, gewerbe_flag, zb1_status, polizei_vor_ort, fahrerflucht,
    // zeugen_vorhanden, halter_ungleich_fahrer_flag, vorschaden_erkannt etc.)
    let lead: Record<string, unknown> | null = null
    const leadId = (claim as Record<string, unknown>).lead_id as string | null
    if (leadId) {
      const { data } = await admin
        .from('leads')
        .select('id, finanzierung_leasing, gewerbe_flag, vorsteuerabzugsberechtigt, zb1_status, polizei_vor_ort, fahrerflucht, zeugen_vorhanden, halter_ungleich_fahrer_flag, personenschaden_flag, sachschaden_flag')
        .eq('id', leadId)
        .maybeSingle()
      lead = data
    }
    const katalogRows = await getAlleSlots(admin)
    const ctx = buildDokumentKontext({ claim, lead })
    const anforderungen = getOffeneDokumentAnforderungen(katalogRows, ctx, kundeRelevante)

    // Files pro Slot zusammensammeln. Mapping über pflichtdokument_id
    // (CMM-21 FK) — Legacy-Files ohne FK werden über dokument_typ matched.
    const filesByPflichtId = new Map<string, Array<{ name: string; url: string }>>()
    const filesByTyp = new Map<string, Array<{ name: string; url: string }>>()
    for (const d of (dokRes.data ?? []) as Array<{
      id: string
      dokument_typ: string | null
      pflichtdokument_id: string | null
      storage_path: string | null
      original_filename: string | null
      hochgeladen_am: string | null
    }>) {
      if (!d.storage_path) continue
      const url = await getStorageUrl(admin, 'fall-dokumente', d.storage_path)
      if (!url) continue
      const entry = { name: d.original_filename ?? 'Datei', url }
      if (d.pflichtdokument_id) {
        const arr = filesByPflichtId.get(d.pflichtdokument_id) ?? []
        arr.push(entry)
        filesByPflichtId.set(d.pflichtdokument_id, arr)
      } else if (d.dokument_typ) {
        const arr = filesByTyp.get(d.dokument_typ) ?? []
        arr.push(entry)
        filesByTyp.set(d.dokument_typ, arr)
      }
    }

    const result: PflichtSlotForView[] = anforderungen.map((a) => {
      const pflichtId = a.pflichtdoc?.id ?? null
      const filesByFK = pflichtId ? filesByPflichtId.get(pflichtId) ?? [] : []
      const filesByType = filesByTyp.get(a.slot_id) ?? []
      // Bevorzuge FK-Match, fallback Typ-Match (Legacy-Files vor CMM-21).
      const files = filesByFK.length > 0 ? filesByFK : filesByType
      return {
        slot_id: a.slot_id,
        pflichtdokument_id: pflichtId,
        label: a.label,
        beschreibung: a.beschreibung,
        pflicht: a.pflicht,
        status: a.status,
        files,
      }
    })

    return result
  } catch (err) {
    console.error('[getPflichtdokumenteForFall] crashed:', err)
    return []
  }
}
