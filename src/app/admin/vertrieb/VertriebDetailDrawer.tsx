'use client'
// Vertrieb-CRM P2: Detail-Drawer = CRM-Cockpit. Klick auf eine Roster-Zeile öffnet je nach
// Lifecycle: Lead -> LeadCockpit (Ansprechpartner, Stufe, Einstufung, Anruf-Log, Convert),
// Partner -> PartnerCockpit (Profil + Notiz + Deep-Link). Lead-Detail wird on-demand geladen.
//
// Realtime-Ops (Fix Doppel-Reload): Feld-Aenderungen werden OPTIMISTISCH lokal eingetragen
// (patchDetail / appendAktivitaet) statt die ganze Seite per router.refresh() neu zu laden.
// Der Roster-Badge folgt per onKontaktPatch. reloadDetail() ist ein STILLER Hintergrund-
// Refetch (nur Drawer, kein Spinner, kein Remount) fuer server-berechnete Daten (Auto-Log-
// Historie, Website-Anreicherung). Die Fetch-Effect-Deps sind bewusst kind/id (stabil) statt
// des ganzen kontakt-Objekts — ein neues Objekt aus dem Roster-Overlay loest KEINEN Refetch aus.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { KIND_LABEL } from './_lib/labels'
import LeadCockpit from './drawer/LeadCockpit'
import PartnerCockpit from './drawer/PartnerCockpit'
import { getVertriebLeadDetail } from './_actions/get-vertrieb-lead-detail'
import type { VertriebKontakt, VertriebKontaktRow } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebLeadDetail, LeadAktivitaet } from './_lib/lead-detail'

export default function VertriebDetailDrawer({
  kontakt,
  onClose,
  onKontaktPatch,
}: {
  kontakt: VertriebKontakt | null
  onClose: () => void
  onKontaktPatch: (kind: string, id: string, patch: Partial<VertriebKontaktRow>) => void
}) {
  const router = useRouter()
  const istLead = kontakt?.kind === 'partner-lead'
  const [detail, setDetail] = useState<VertriebLeadDetail | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Zuletzt geladene Entity — unterscheidet "andere Zeile geoeffnet" (Detail leeren -> Spinner)
  // von "stiller Refetch derselben Zeile" (Detail behalten -> kein Flackern, kein Remount).
  const letzteEntityRef = useRef<string | null>(null)

  const kind = kontakt?.kind
  const id = kontakt?.id

  useEffect(() => {
    if (!kind || kind !== 'partner-lead' || !id) {
      setDetail(null)
      setLadeFehler(null)
      letzteEntityRef.current = null
      return
    }
    const key = `${kind}:${id}`
    const istNeueEntity = letzteEntityRef.current !== key
    letzteEntityRef.current = key
    // Andere Zeile: alten Stand verwerfen (Spinner). Reload derselben Zeile: Stand behalten.
    if (istNeueEntity) {
      setDetail(null)
      setLadeFehler(null)
    }
    let alive = true
    getVertriebLeadDetail(id).then((res) => {
      if (!alive) return
      if (res.ok) setDetail(res.data)
      else if (istNeueEntity) setLadeFehler(res.error)
      // Stiller Reload-Fehler wird bewusst geschluckt — der optimistische Stand bleibt sichtbar.
    })
    return () => {
      alive = false
    }
    // reloadToken bewusst als Dep -> bumpen loest den stillen Hintergrund-Refetch aus.
  }, [kind, id, reloadToken])

  // Optimistisch: der Client kennt den neuen Wert bereits -> sofort lokal, kein Refetch.
  function patchDetail(partial: Partial<VertriebLeadDetail>) {
    setDetail((d) => (d ? { ...d, ...partial } : d))
    // Status treibt die abgeleitete Roster-Stufe (Badge) — sofort durchreichen.
    if (partial.status !== undefined && kind && id) {
      onKontaktPatch(kind, id, { roh_status: partial.status })
    }
  }

  // Optimistisch neue Aktivitaet oben einfuegen (Anruf/Notiz) — sofort sichtbar.
  function appendAktivitaet(a: LeadAktivitaet) {
    setDetail((d) => (d ? { ...d, aktivitaeten: [a, ...d.aktivitaeten] } : d))
  }

  // Stiller Hintergrund-Refetch (kein Spinner, kein Remount): holt server-berechnete Daten
  // (Auto-Log-Eintraege, Website-Anreicherung, echte Aktivitaets-IDs) nach.
  function reloadDetail() {
    setReloadToken((t) => t + 1)
  }

  // Convert legt einen NEUEN Partner-Account an (Identitaet wechselt Lead -> Partner): ein
  // einmaliger Roster-Refresh ist hier gerechtfertigt (neue Zeile + Reklassifizierung).
  function onConverted() {
    router.refresh()
  }

  return (
    <Drawer open={!!kontakt} onClose={onClose} width={460} ariaLabel="Partner-Detail">
      {kontakt && (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-caption text-claimondo-ondo/60">{KIND_LABEL[kontakt.kind]}</p>
            <h2 className="text-heading-md text-claimondo-navy">{kontakt.name ?? '—'}</h2>
            <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
          </div>

          {istLead ? (
            detail ? (
              <LeadCockpit
                kontakt={kontakt}
                detail={detail}
                onPatchDetail={patchDetail}
                onAppendAktivitaet={appendAktivitaet}
                onReloadDetail={reloadDetail}
                onConverted={onConverted}
              />
            ) : ladeFehler ? (
              <p className="text-sm text-danger">{ladeFehler}</p>
            ) : (
              <p className="text-sm text-claimondo-ondo/60">Lädt…</p>
            )
          ) : (
            <PartnerCockpit
              kontakt={kontakt}
              onPatchKontakt={(patch) => onKontaktPatch(kontakt.kind, kontakt.id, patch)}
            />
          )}
        </div>
      )}
    </Drawer>
  )
}
