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

import { InboxIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

type AnforderungItem = {
  slot_id: string
  label: string
  beschreibung: string
  pflicht: boolean
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

  // Defensive: alle Loader in try/catch wrappen damit ein Edge-Case
  // (RLS, Schema-Drift, etc.) nicht den ganzen SV-Page-Server-Render killt.
  let offen: AnforderungItem[]
  try {
    const supabase = await createClient()
    const claimId = await resolveClaimId(supabase, fallId)
    if (!claimId) return null
    const claim = await getClaimForRole(supabase, claimId, 'sv')
    if (!claim) return null

    const admin = createAdminClient()
    const { data: katalog } = await admin
      .from('dokument_katalog')
      .select('slot_id, label, beschreibung, uploadbar_von')
    const katalogMap = new Map(
      (katalog ?? []).map((k) => [
        k.slot_id as string,
        {
          label: k.label as string,
          beschreibung: (k.beschreibung as string | null) ?? null,
          uploadbar_von: ((k.uploadbar_von as string[] | null) ?? []) as string[],
        },
      ]),
    )

    const pflichtDocs: PflichtdokumentStand[] = pflichtRows
      .filter((r) => {
        const slot = r.dokument_typ ?? ''
        const k = katalogMap.get(slot)
        if (!k) return true
        return k.uploadbar_von.includes('kunde')
      })
      .map((r) => {
        const k = katalogMap.get(r.dokument_typ ?? '')
        return {
          id: r.id,
          slot_id: r.dokument_typ ?? '',
          label: k?.label ?? r.dokument_typ ?? '',
          beschreibung: k?.beschreibung ?? null,
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
        }
      })

    const anforderungen = getOffeneDokumentAnforderungen(claim, pflichtDocs)
    offen = anforderungen
      .filter((a) => a.status !== 'erfuellt')
      .map((a) => ({
        slot_id: a.slot_id,
        label: a.label ?? a.slot_id,
        beschreibung: a.beschreibung ?? '',
        pflicht: !!a.pflicht,
      }))
  } catch (err) {
    console.error('[AuftragDokumenteBanner] crashed, hiding banner:', err)
    return null
  }

  if (offen.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-50/40 p-5 shadow-sm">
      <div className="flex items-center gap-3 pb-3 border-b border-amber-200/70">
        <div className="w-10 h-10 rounded-ios-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <InboxIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-amber-900">Noch einzuholen</p>
          <p className="text-xs text-amber-800/90 mt-0.5">
            Der Kunde reicht folgende {offen.length === 1 ? 'Unterlage' : 'Unterlagen'} noch nach
            — bis zum Gutachten-Upload.
          </p>
        </div>
        <span className="ml-auto inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-amber-500 text-white text-sm font-bold shadow-sm">
          {offen.length}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {offen.map((a) => (
          <li
            key={a.slot_id}
            className="flex items-start gap-2.5 text-sm text-claimondo-navy"
          >
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="font-medium">{a.label}</span>
              {a.beschreibung && (
                <span className="block text-xs text-amber-900/70 mt-0.5">
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
  )
}
