// AAR-kanzlei-portal PR 2a Stub — Fall-Detail kommt in PR 2b als
// Read-only-Ansicht über die shared FallakteShell (userRolle='kanzlei').
// Hier nur Grundgerüst damit die Dashboard-Links nicht 404en.

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

export default async function KanzleiFallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: fall } = await supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, aktuelle_phase, mandatsnummer, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_strasse, kunde_plz, kunde_stadt, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, service_typ, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (!fall) notFound()

  const kunde = [fall.kunde_vorname, fall.kunde_nachname].filter(Boolean).join(' ') || '—'
  const adresse =
    [fall.kunde_strasse, [fall.kunde_plz, fall.kunde_stadt].filter(Boolean).join(' ')]
      .filter((v) => v && String(v).trim().length > 0)
      .join(', ') || '—'
  const fahrzeug =
    [fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || '—'

  return (
    <div className="space-y-4">
      <Link
        href="/kanzlei/dashboard"
        className="inline-flex items-center gap-1 text-sm text-[#4573A2] hover:underline"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Zurück zur Mandat-Liste
      </Link>

      <div className="rounded-xl border border-[#e4e7ef] bg-white p-6 space-y-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400">
            Fall-Nummer
          </p>
          <h1 className="text-xl font-semibold text-[#0D1B3E] font-mono">
            {fall.fall_nummer ?? fall.id}
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#e4e7ef]">
          <DetailRow label="Kunde" value={kunde} />
          <DetailRow label="Adresse" value={adresse} />
          <DetailRow label="Email" value={fall.kunde_email ?? '—'} />
          <DetailRow label="Telefon" value={fall.kunde_telefon ?? '—'} />
          <DetailRow label="Kennzeichen" value={fall.kennzeichen ?? '—'} mono />
          <DetailRow
            label="Fahrzeug"
            value={`${fahrzeug}${fall.fahrzeug_baujahr ? ` (${fall.fahrzeug_baujahr})` : ''}`}
          />
          <DetailRow label="Mandat-Nr" value={fall.mandatsnummer ?? '—'} mono />
          <DetailRow label="Status" value={(fall.status as string | null) ?? '—'} />
        </div>

        <div className="pt-4 border-t border-[#e4e7ef] rounded-lg bg-[#f8f9fb] p-4">
          <p className="text-xs text-gray-500">
            Die vollständige Fallakte (Schadensbericht, Dokumente, Timeline,
            Gutachten) wird in Kürze hier ergänzt. Für dringende Rückfragen
            wendet euch bitte direkt an den zuständigen Kundenbetreuer.
          </p>
        </div>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`text-sm text-[#0D1B3E] mt-0.5 ${mono ? 'font-mono' : 'font-medium'}`}
      >
        {value}
      </p>
    </div>
  )
}
