// CMM-24: Auftrags-Banner beim Gutachter mit den noch offenen Doku-
// Anforderungen vom Kunden. Zeigt eine Liste der Slots die der Kunde
// vorab nicht hochgeladen hat — der SV weiß damit beim Termin was er
// vor Ort selbst dokumentieren und ins Gutachten einbauen muss.
//
// Nutzt dieselbe Smart-Filter-Logik wie der OffeneDatenBanner (CMM-22)
// im Kunden-Portal: getOffeneDokumentAnforderungen aus
// src/lib/claims/data-requirements.ts. Damit verkürzt sich die Liste
// automatisch sobald der Kunde im Onboarding nachreicht (revalidatePath
// muss den SV-Pfad treffen — siehe uploadPflichtdokument).

import { AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getClaimForRole, resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getOffeneDokumentAnforderungen } from '@/lib/claims/data-requirements'
import type { PflichtdokumentStand } from '@/app/kunde/onboarding/actions'

type DbRow = {
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

export default async function AuftragDokumenteBanner({
  fallId,
  pflichtRows,
  gutachtenEingegangen,
}: {
  fallId: string
  pflichtRows: DbRow[]
  /** CMM-23 Aaron-Spec: Banner verschwindet sobald Gutachten da ist —
      "so lange bis das Gutachten da ist". Kunde kann zwar danach noch
      nachreichen, aber für den SV ist die Anforderungsliste nicht mehr
      relevant. */
  gutachtenEingegangen?: boolean
}) {
  if (gutachtenEingegangen) return null
  const supabase = await createClient()

  let claimId: string | null = null
  try {
    claimId = await resolveClaimId(supabase, fallId)
  } catch { return null }
  if (!claimId) return null

  const claim = await getClaimForRole(supabase, claimId, 'sv')
  if (!claim) return null

  // CMM-24: pflichtdokumente in den PflichtdokumentStand-Shape übersetzen
  // den getOffeneDokumentAnforderungen erwartet. Katalog-Felder sind hier
  // nicht erforderlich — Smart-Filter nutzt nur slot_id + status + pflicht
  // + dokument_url.
  const pflichtDocs: PflichtdokumentStand[] = pflichtRows.map((r) => ({
    id: r.id,
    slot_id: r.dokument_typ ?? '',
    label: '',
    beschreibung: null,
    status: r.status ?? 'ausstehend',
    pflicht: !!r.pflicht,
    dokument_url: r.dokument_url ?? null,
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
  }))

  const anforderungen = getOffeneDokumentAnforderungen(claim, pflichtDocs)
  const offen = anforderungen.filter((a) => a.status !== 'erfuellt')
  if (offen.length === 0) return null

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
          <AlertTriangleIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Noch einzuholen
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Folgende Unterlagen reicht der Kunde noch nach. Solange das
            Gutachten nicht hochgeladen ist, kann er weiter ergänzen.
          </p>
          <ul className="mt-3 space-y-1.5">
            {offen.map((a) => (
              <li key={a.slot_id} className="flex items-start gap-2 text-sm text-claimondo-navy">
                <span className="text-amber-600 mt-0.5">•</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{a.label}</span>
                  {a.beschreibung && (
                    <span className="block text-xs text-amber-800/90 mt-0.5">
                      {a.beschreibung}
                    </span>
                  )}
                </span>
                {a.pflicht && (
                  <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 flex-shrink-0">
                    Pflicht
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
