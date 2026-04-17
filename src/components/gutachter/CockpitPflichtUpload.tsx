'use client'

// AAR-355: Vor-Ort-Fallback — SV kann fehlende Pflichtdokumente direkt aus
// dem GutachterCockpit (mode='onsite') hochladen. Lädt für den aktiven Fall
// alle Katalog-Slots mit `uploadbar_von @> ['sachverstaendiger']`, zeigt
// offene Pflichtslots als DokumentSlot-Karten und nutzt die bestehende
// Upload-Outbox (AAR-363), sodass Uploads auch offline funktionieren.
//
// Visuell kompakter als die Fallakten-Ansicht, damit sie in den schmalen
// Vor-Ort-Streifen passt.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DokumentenListe, { type SlotRow } from '@/components/fall/DokumentenListe'
import { FileTextIcon, CheckCircle2Icon } from 'lucide-react'

type Props = {
  fallId: string
}

type KatalogSlot = {
  slot_id: string
  label: string
  beschreibung: string | null
  uploadbar_von: string[]
  sort_order: number
  aktiv: boolean
}

type PflichtRow = {
  id: string
  dokument_typ: string
  status: string
  pflicht: boolean
  dokument_url: string | null
}

const GEDECKTE_STATUSSE = new Set([
  'ausstehend',
  'hochgeladen',
  'geprueft',
  'abgelehnt',
  'nachgereicht_angefordert',
  'optional',
])

export default function CockpitPflichtUpload({ fallId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Katalog (clientseitig — RLS liefert aktive Slots).
    const { data: katalog } = await supabase
      .from('dokument_katalog')
      .select('slot_id, label, beschreibung, uploadbar_von, sort_order, aktiv')
      .eq('aktiv', true)
      .order('sort_order', { ascending: true })

    // Pflichtdokumente für diesen Fall (RLS: SV sieht nur seinen Fall).
    const { data: pflicht } = await supabase
      .from('pflichtdokumente')
      .select('id, dokument_typ, status, pflicht, dokument_url')
      .eq('fall_id', fallId)

    const pflichtMap = new Map<string, PflichtRow>()
    for (const p of (pflicht ?? []) as PflichtRow[]) {
      pflichtMap.set(p.dokument_typ, p)
    }

    const rows: SlotRow[] = ((katalog ?? []) as KatalogSlot[])
      .filter((s) => s.uploadbar_von?.includes('sachverstaendiger'))
      .map((s) => {
        const match = pflichtMap.get(s.slot_id)
        const rawStatus = match?.status ?? 'ausstehend'
        const status = (
          GEDECKTE_STATUSSE.has(rawStatus) ? rawStatus : 'ausstehend'
        ) as SlotRow['status']
        return {
          id: match?.id ?? null,
          slotId: s.slot_id,
          label: s.label,
          beschreibung: s.beschreibung,
          istPflicht: match?.pflicht ?? false,
          status,
          currentFile: match?.dokument_url
            ? { name: s.label, url: match.dokument_url, size: null }
            : null,
        }
      })

    setSlots(rows)
    setLoading(false)
  }, [supabase, fallId])

  useEffect(() => {
    load()
  }, [load])

  // Nur Pflicht-Slots anzeigen, die noch offen sind — der SV soll vor Ort
  // fokussiert fehlende Belege einsammeln, keine ganze Kataloge durchklicken.
  const offeneSlots = useMemo(
    () =>
      slots.filter(
        (s) =>
          s.istPflicht &&
          s.status !== 'hochgeladen' &&
          s.status !== 'geprueft',
      ),
    [slots],
  )

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-16 bg-gray-50 rounded animate-pulse" />
      </div>
    )
  }

  // Wenn keine offenen Pflicht-Slots → schlanker Erfolgs-Hinweis.
  if (offeneSlots.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
        <CheckCircle2Icon className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-xs text-green-700">
          Alle Pflichtdokumente für diesen Fall sind vollständig.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <FileTextIcon className="w-4 h-4 text-[#4573A2] flex-shrink-0" />
        <p className="text-sm font-semibold text-[#0D1B3E]">
          Fehlende Dokumente einsammeln
        </p>
        <span className="ml-auto text-[10px] text-gray-500">
          {offeneSlots.length} offen
        </span>
      </div>
      <p className="text-[11px] text-gray-500">
        Falls der Kunde etwas nicht hochgeladen hat — jetzt vor Ort per Kamera
        einsammeln. Uploads funktionieren auch offline und werden bei
        Wieder-Online automatisch synchronisiert.
      </p>
      <DokumentenListe
        slots={offeneSlots}
        fallId={fallId}
        rolle="sachverstaendiger"
      />
    </div>
  )
}
