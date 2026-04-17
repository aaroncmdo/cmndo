// AAR-354: Persistenter Banner für offene Pflichtdokumente.
// Server Component — wird im /kunde-Layout eingebunden und erscheint auf
// allen Portal-Seiten solange pflichtdokumente mit dokument_url IS NULL
// und pflicht=true existieren. Verlinkt direkt in den Onboarding-Wizard
// Step 3 (Dokumente), wo die Upload-Cards aus AAR-365 liegen.
import Link from 'next/link'
import { AlertTriangleIcon, UploadCloudIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type OffenerSlot = {
  slot_id: string
  label: string
  fall_id: string
}

export async function PflichtdokumenteBanner() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null

  // Fälle des Kunden
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id')
    .eq('kunde_id', user.id)
  const fallIds = (faelle ?? []).map(f => f.id as string)
  if (fallIds.length === 0) return null

  // Offene Pflichtdokumente = alles was NICHT 'hochgeladen' ist.
  // Deckt 'ausstehend' (keine URL), 'abgelehnt' (URL vorhanden, aber zurückgewiesen)
  // und 'nachgereicht_angefordert' (URL vorhanden, aber neues Dok angefordert) ab.
  const { data: docs } = await supabase
    .from('pflichtdokumente')
    .select('fall_id, dokument_typ, status')
    .in('fall_id', fallIds)
    .eq('pflicht', true)
    .neq('status', 'hochgeladen')

  if (!docs || docs.length === 0) return null

  // Labels aus dokument_katalog nachladen
  const slotIds = Array.from(new Set(docs.map(d => d.dokument_typ as string)))
  const { data: katalog } = await supabase
    .from('dokument_katalog')
    .select('slot_id, label')
    .in('slot_id', slotIds)
  const labelMap = new Map<string, string>(
    (katalog ?? []).map(k => [k.slot_id as string, k.label as string]),
  )

  // Dedupliziert (gleicher slot_id mehrfach pro Fall wird zu einer Zeile)
  const offen: OffenerSlot[] = []
  const seen = new Set<string>()
  for (const d of docs) {
    const key = `${d.fall_id}:${d.dokument_typ}`
    if (seen.has(key)) continue
    seen.add(key)
    offen.push({
      slot_id: d.dokument_typ as string,
      label: labelMap.get(d.dokument_typ as string) ?? (d.dokument_typ as string),
      fall_id: d.fall_id as string,
    })
  }

  // Max 4 Zeilen — Rest wird als "… und N weitere" zusammengefasst
  const shown = offen.slice(0, 4)
  const rest = offen.length - shown.length

  return (
    <div className="mx-4 md:mx-6 mt-4 mb-2 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
          <AlertTriangleIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm md:text-base font-semibold text-amber-900">
            Wir benötigen noch folgende Dokumente:
          </p>
          <ul className="mt-2 space-y-1.5">
            {shown.map(s => (
              <li key={`${s.fall_id}:${s.slot_id}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-amber-900 truncate">• {s.label}</span>
                <Link
                  href={`/kunde/onboarding?step=dokumente`}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-3 min-h-[44px] rounded-lg bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] transition-all"
                >
                  <UploadCloudIcon className="w-3.5 h-3.5" />
                  Jetzt hochladen
                </Link>
              </li>
            ))}
            {rest > 0 && (
              <li className="text-xs text-amber-800 italic">
                … und {rest} weitere{rest === 1 ? 's' : ''}
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Bitte laden Sie diese so bald wie möglich hoch.
          </p>
        </div>
      </div>
    </div>
  )
}
