'use client'

// AAR-162 / W2: Timeline-Tab — Wrapper um FallActivityFeed (existiert).
// buildActivityEvents erwartet timeline + tasks + nachrichten; W2 liefert nur
// die Timeline — Tasks + Nachrichten-Auszug folgen wenn der Shell diese Props
// durchreicht. Für W2 bleibt der Feed auf Timeline-Events beschränkt.

import FallActivityFeed, { buildActivityEvents } from '@/components/faelle/FallActivityFeed'

type TimelineRow = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  erstellt_von: string | null
  metadata: unknown
  lead_id: string | null
  created_at: string
}

export default function TimelineTab({
  timeline,
}: {
  timeline: TimelineRow[]
}) {
  const events = buildActivityEvents(
    timeline.map((t) => ({
      id: t.id,
      typ: t.typ,
      titel: t.titel,
      beschreibung: t.beschreibung ?? null,
      erstellt_von: t.erstellt_von ?? null,
      lead_id: t.lead_id ?? null,
      created_at: t.created_at,
    })),
    [],
    [],
  )
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Timeline</h2>
      <FallActivityFeed events={events} />
    </div>
  )
}
