'use client'

// AAR-841 Frontend Phase C/4: KB-Sidebar-Override-Dropdown
//
// Separate Component (kein Form-Reuse, Aaron-Hinweis 4): KB klickt direkt auf
// einen der drei Quick-Action-Items, partnerkanzlei + keine_kanzlei werden
// sofort persistiert. Bei eigene_kanzlei öffnet sich ein Modal mit
// KanzleiWunschForm (Kontaktdaten-Pflicht).
//
// Sichtbarkeit: Admin (immer) + KB (eigener Claim).
// Bei bereits versendetem Paket → setKanzleiWunsch wirft Error mit
// klarem Admin-Eskalations-Hinweis (siehe AAR-841-actions.ts).

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDownIcon, ScaleIcon, BuildingIcon, XIcon, HelpCircleIcon, PackageIcon } from 'lucide-react'
import { Modal } from '@/components/primitives'
import { setKanzleiWunsch, sendKanzleiPaket } from '@/lib/kanzlei/actions'
import { KanzleiWunschForm } from './KanzleiWunschForm'

type Props = {
  claimId: string
  currentWunsch: string | null
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde'
  /** AAR-844: Wenn true, zeigt zusätzlich "Paket jetzt versenden"-Quick-Action.
   *  Server-side via isKanzleiPaketPending(claimId) berechnet. */
  paketVersandPending?: boolean
}

const QUICK_ACTIONS: {
  wunsch: 'partnerkanzlei' | 'keine_kanzlei' | 'noch_unentschieden'
  label: string
  icon: typeof ScaleIcon
  tone: string
}[] = [
  { wunsch: 'partnerkanzlei',     label: 'Partnerkanzlei einbinden',  icon: ScaleIcon,        tone: 'text-[#0D1B3E]' },
  { wunsch: 'keine_kanzlei',      label: 'Keine Kanzlei',             icon: XIcon,            tone: 'text-[#7BA3CC]' },
  { wunsch: 'noch_unentschieden', label: 'Auf "noch unentschieden" zurücksetzen', icon: HelpCircleIcon, tone: 'text-[#7BA3CC]' },
]

export function KanzleiWunschDropdown({ claimId, currentWunsch, viewerRole, paketVersandPending = false }: Props) {
  const [open, setOpen]     = useState(false)
  const [eigeneOpen, setEigeneOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const isAuthorized = viewerRole === 'admin' || viewerRole === 'kb'

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!isAuthorized) return null

  // AAR-844: "Paket jetzt versenden" — nutzt persistierten Wunsch aus claim
  function handlePaketJetztVersenden() {
    setOpen(false)
    if (currentWunsch !== 'partnerkanzlei' && currentWunsch !== 'eigene_kanzlei') {
      toast.error('Kein versendbarer Kanzlei-Wunsch gesetzt')
      return
    }
    startTransition(async () => {
      const res = await sendKanzleiPaket({
        claim_id:       claimId,
        empfaenger_typ: currentWunsch as 'partnerkanzlei' | 'eigene_kanzlei',
      })
      if (res.ok) toast.success('Kanzlei-Paket versendet')
      else        toast.error(res.error)
    })
  }

  function handleQuickAction(wunsch: 'partnerkanzlei' | 'keine_kanzlei' | 'noch_unentschieden') {
    setOpen(false)
    startTransition(async () => {
      const res = await setKanzleiWunsch({
        claim_id:         claimId,
        wunsch,
        gefragt_in_phase: 'kb_override',
      })
      if (res.ok) {
        const autoVersendet = res.data?.auto_paket_versendet === true
        toast.success(autoVersendet ? `${wunsch} — Paket versendet` : `${wunsch} gesetzt`)
      } else {
        toast.error(res.error)
      }
    })
  }

  const labelMap: Record<string, string> = {
    partnerkanzlei:     'Partnerkanzlei',
    eigene_kanzlei:     'Eigene Kanzlei',
    keine_kanzlei:      'Keine Kanzlei',
    noch_unentschieden: 'Unentschieden',
    nicht_gefragt:      'Nicht gefragt',
  }
  const currentLabel = labelMap[currentWunsch ?? 'nicht_gefragt'] ?? 'Nicht gefragt'

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => !isPending && setOpen(!open)}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F3] bg-white text-xs font-medium text-[#0D1B3E] hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
          title="Kanzlei-Wunsch ändern"
        >
          Kanzlei: {currentLabel}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-[#E2E8F3] rounded-xl shadow-lg z-20 py-1">
            {/* AAR-844: Auto-Paket-Trigger — prominent oben wenn Pending */}
            {paketVersandPending && (
              <>
                <button
                  type="button"
                  onClick={handlePaketJetztVersenden}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-left font-medium"
                >
                  <PackageIcon className="w-4 h-4" />
                  Paket jetzt versenden
                </button>
                <div className="border-t border-[#E2E8F3] my-1" />
              </>
            )}
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.wunsch}
                type="button"
                onClick={() => handleQuickAction(a.wunsch)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#0D1B3E] hover:bg-[#f8f9fb] text-left"
              >
                <a.icon className={`w-4 h-4 ${a.tone}`} />
                {a.label}
              </button>
            ))}
            <div className="border-t border-[#E2E8F3] my-1" />
            <button
              type="button"
              onClick={() => { setOpen(false); setEigeneOpen(true) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#0D1B3E] hover:bg-[#f8f9fb] text-left"
            >
              <BuildingIcon className="w-4 h-4 text-[#4573A2]" />
              Eigene Kanzlei einbinden…
            </button>
          </div>
        )}
      </div>

      <Modal open={eigeneOpen} onClose={() => setEigeneOpen(false)} ariaLabel="Eigene Kanzlei einbinden" maxWidth={520}>
        <KanzleiWunschForm
          claimId={claimId}
          gefragtInPhase="kb_override"
          initialWunsch="eigene_kanzlei"
          submitLabel="Kanzlei eintragen"
          variant="plain"
          onSuccess={() => setEigeneOpen(false)}
        />
      </Modal>
    </>
  )
}
