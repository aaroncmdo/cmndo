'use client'
// Vertrieb-CRM P2: vollstaendige Partner-Detailflaeche (SV/Makler/Werkstatt) — Naechster-
// Schritt-Hinweis, Felder, editierbare Notiz (updateVertriebFeld, Whitelist pro kind), Deep-
// Link in die tiefe Akte. Login-Mail (Makler+Werkstatt) + QR-Codes folgen in P5.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button } from '@/components/primitives'
import { STUFE_HINT } from '../_lib/labels'
import { detailLink } from '../_lib/detail-link'
import { updateVertriebFeld } from '../_actions/update-vertrieb-feld'
import { resendWerkstattWelcome } from '../_actions/resend-werkstatt-welcome'
import { resendMaklerWelcome } from '@/app/admin/makler/actions'
import { useUrlDrawerParam } from '@/lib/navigation/use-url-drawer-param'
import type { VertriebKontakt, VertriebKontaktRow } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

function Feld({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert && wert.trim() ? wert : '—'}</p>
    </div>
  )
}

export default function PartnerCockpit({
  kontakt,
  onPatchKontakt,
}: {
  kontakt: VertriebKontakt
  // Optimistisch: den Roster-Stand nachziehen (kein router.refresh -> kein Neu-Load).
  onPatchKontakt: (patch: Partial<VertriebKontaktRow>) => void
}) {
  const router = useRouter()
  const aktionDrawer = useUrlDrawerParam('aktion')
  const [notiz, setNotiz] = useState(kontakt.notizen ?? '')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const dirty = notiz !== (kontakt.notizen ?? '')
  const link = detailLink(kontakt.kind, kontakt.id)
  // Audit Slice 2 (Onboarding): Ein SV, der noch nicht ins Portal freigeschaltet und
  // nicht gesperrt ist, braucht als naechsten Schritt Verifizierung/Freischaltung —
  // bisher NANNTE der Hinweis (STUFE_HINT) die drei Schritte nur, ohne einen Weg dorthin
  // ("der Admin muss den Weg raten"). Deep-Link auf den Verifizierungs-Tab der Akte, wo
  // Dokument-Review + Freischaltung (gibBasicSvFrei) tatsaechlich leben.
  const svBrauchtFreischaltung =
    kontakt.kind === 'sv' && !kontakt.roh_portal_zugang && !kontakt.roh_gesperrt
  const [mailBusy, setMailBusy] = useState(false)
  const [mailStatus, setMailStatus] = useState<string | null>(null)

  async function sendeLoginMail() {
    setMailBusy(true)
    setMailStatus(null)
    const res =
      kontakt.rolle === 'makler'
        ? await resendMaklerWelcome(kontakt.id)
        : await resendWerkstattWelcome(kontakt.id)
    setMailBusy(false)
    setMailStatus(res.ok ? 'Login-Mail gesendet.' : res.error ?? 'Konnte nicht gesendet werden.')
  }

  async function speichern() {
    setBusy(true)
    setFehler(null)
    const res = await updateVertriebFeld(kontakt.kind, kontakt.id, 'notizen', notiz.trim() || null)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    // Optimistisch: Roster-Notiz nachziehen -> `dirty` wird sauber false, kein Neu-Load.
    onPatchKontakt({ notizen: notiz.trim() || null })
  }

  return (
    <div className="space-y-5">
      <Card p={4} radius="lg">
        <p className="text-caption text-claimondo-ondo/60 mb-1">Nächster Schritt</p>
        <p className="text-sm text-claimondo-navy">{STUFE_HINT[kontakt.stufe]}</p>
        {svBrauchtFreischaltung && (
          <div className="mt-3">
            <Button
              variant="navy"
              size="sm"
              onClick={() =>
                router.push(`/admin/vertrieb/sachverstaendige/${kontakt.id}?tab=verifizierung`)
              }
            >
              Verifizierung & Freischaltung öffnen
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Feld label="E-Mail" wert={kontakt.email} />
        <Feld label="Telefon" wert={kontakt.telefon} />
        <Feld label="PLZ" wert={kontakt.plz} />
        <Feld label="Ort" wert={kontakt.ort} />
        <Feld label="Quelle" wert={kontakt.quelle} />
        <Feld
          label="Angelegt"
          wert={kontakt.erstellt_am ? new Date(kontakt.erstellt_am).toLocaleDateString('de-DE') : null}
        />
      </div>

      {(kontakt.rolle === 'makler' || kontakt.rolle === 'werkstatt') && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" loading={mailBusy} onClick={sendeLoginMail}>
            ✉️ Login-Mail neu senden
          </Button>
          {kontakt.rolle === 'werkstatt' && (
            // B1/a4: QR-Pool als Cockpit-Drawer statt Full-Page-Absprung. Ein History-Schritt:
            // ?aktion=qrpool ersetzt ?kontakt=… -> Back fuehrt zurueck zum Kontakt-Drawer.
            <Button
              variant="ghost"
              size="sm"
              onClick={() => aktionDrawer.open('qrpool', { alsoRemove: ['kontakt'] })}
            >
              🔳 QR-Codes
            </Button>
          )}
          {mailStatus && <span className="text-caption text-claimondo-ondo/60">{mailStatus}</span>}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-caption text-claimondo-ondo/60">Notizen (intern)</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          rows={3}
          placeholder="Interne Notiz zu diesem Partner…"
          className={`${FELD_CLS} w-full resize-y`}
        />
        {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
        <Button variant="navy" size="sm" onClick={speichern} loading={busy} disabled={!dirty || busy}>
          Speichern
        </Button>
      </div>

      {(() => {
        const partnerTyp: PartnerTyp | null =
          kontakt.kind === 'firmen-flotte' ? 'flotte'
          : kontakt.kind === 'partner-lead' ? null
          : kontakt.kind
        return partnerTyp ? (
          <div className="space-y-2">
            <p className="text-caption text-claimondo-ondo/60">Aktivität</p>
            <PartnerCockpitPanel partnerTyp={partnerTyp} partnerId={kontakt.id} compact />
          </div>
        ) : null
      })()}

      <Button variant="navy" fullWidth onClick={() => router.push(link.href)}>
        {link.label}
      </Button>
    </div>
  )
}
