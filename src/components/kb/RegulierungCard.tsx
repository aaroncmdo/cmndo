'use client'

// CMM-32i: Kanzlei-Fall-Lifecycle in der KB-Fallakte. Zeigt den aktuellen
// Stand (versicherungskontakt → auszahlung) als Mini-Stepper plus zwei
// Buttons. Render-Bedingung: Caller liefert nur Daten, wenn kanzlei_faelle
// für diesen Fall existiert (also nach KB-Freigabe).

import { useState, useTransition } from 'react'
import { CheckIcon, MailIcon, EuroIcon, BriefcaseIcon, RotateCwIcon, FileTextIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  kanzleiVsKontaktErfasst,
  kanzleiAuszahlungEingegangen,
} from '@/lib/kanzlei-fall/actions'
import { setKanzleiWunsch } from '@/lib/kanzlei-wunsch/actions'
import { createNachbesichtigung, createStellungnahme } from '@/lib/auftrag/side-quest'

type Props = {
  fallId: string
  claimId: string | null
  status: 'versicherungskontakt' | 'auszahlung'
  vsKontaktAm: string | null
  ausgezahltAm: string | null
  /** CMM-32 Polish: Wenn 'eigene_kanzlei' wird der Standardweg
   *  (VS-Kontakt → Auszahlung) deaktiviert — der Kunde regelt selbst
   *  nach Kanzleipaket-Versand. */
  kanzleiWunsch: 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei' | 'noch_unentschieden' | 'nicht_gefragt' | null
  kanzleiUebergebenAm: string | null
}

function fmt(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function RegulierungCard({
  fallId,
  claimId,
  status,
  vsKontaktAm,
  ausgezahltAm,
  kanzleiWunsch,
  kanzleiUebergebenAm,
}: Props) {
  const router = useRouter()
  const [betrag, setBetrag] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pendingKontakt, startKontakt] = useTransition()
  const [pendingAuszahlung, startAuszahlung] = useTransition()
  const [pendingWunsch, startWunsch] = useTransition()
  const [pendingSideQuest, startSideQuest] = useTransition()
  const [sideQuestModal, setSideQuestModal] = useState<null | 'nachbesichtigung' | 'stellungnahme'>(null)
  const [sideQuestGrund, setSideQuestGrund] = useState<string>('')

  const vsKontaktDone = !!vsKontaktAm
  const auszahlungDone = !!ausgezahltAm
  const istEigeneKanzlei = kanzleiWunsch === 'eigene_kanzlei'
  const istKeineKanzlei = kanzleiWunsch === 'keine_kanzlei'
  const istUebergeben = !!kanzleiUebergebenAm

  function handleToggleEigeneKanzlei(naechsterWunsch: 'eigene_kanzlei' | 'partnerkanzlei') {
    if (!claimId) {
      setError('Kein Claim — Wunsch kann nicht gesetzt werden')
      return
    }
    setError(null)
    startWunsch(async () => {
      const r = await setKanzleiWunsch(claimId, naechsterWunsch)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  function handleKontakt() {
    setError(null)
    startKontakt(async () => {
      const r = await kanzleiVsKontaktErfasst(fallId)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  function handleAuszahlung() {
    setError(null)
    const parsed = betrag.trim() ? Number(betrag.replace(',', '.')) : undefined
    if (parsed !== undefined && (Number.isNaN(parsed) || parsed <= 0)) {
      setError('Betrag ungültig')
      return
    }
    startAuszahlung(async () => {
      const r = await kanzleiAuszahlungEingegangen(fallId, parsed)
      if (!r.ok) setError(r.error ?? 'Fehler')
      else router.refresh()
    })
  }

  function handleSideQuestSubmit() {
    if (!claimId || !sideQuestModal) return
    const typ = sideQuestModal
    const grund = sideQuestGrund.trim() || undefined
    setError(null)
    startSideQuest(async () => {
      const r = typ === 'nachbesichtigung'
        ? await createNachbesichtigung(claimId, grund)
        : await createStellungnahme(claimId, grund)
      if (!r.ok) {
        setError(r.error ?? 'Fehler')
        return
      }
      setSideQuestModal(null)
      setSideQuestGrund('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">Regulierung</p>
          <p className="text-xs text-claimondo-ondo">Kanzlei-Fall-Lifecycle</p>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${
            status === 'auszahlung'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-violet-50 text-violet-800 border border-violet-200'
          }`}
        >
          {status === 'auszahlung' ? 'Auszahlung' : 'In Regulierung'}
        </span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        <StepperDot
          done={vsKontaktDone}
          icon={<MailIcon className="w-3.5 h-3.5" />}
          label="VS-Kontakt"
          datum={fmt(vsKontaktAm)}
        />
        <div className={`flex-1 h-0.5 ${vsKontaktDone ? 'bg-emerald-400' : 'bg-claimondo-border'}`} />
        <StepperDot
          done={auszahlungDone}
          icon={<EuroIcon className="w-3.5 h-3.5" />}
          label="Auszahlung"
          datum={fmt(ausgezahltAm)}
        />
      </div>

      {/* CMM-32 Polish: Eigene-Kanzlei-Toggle. Setzt kanzlei_wunsch und
          deaktiviert die VS-Kontakt/Auszahlung-Buttons (wir regeln nichts
          mehr selbst, Kunde versendet Paket via eigener Card). */}
      <div className="flex items-start gap-2.5 rounded-lg border border-claimondo-border/60 bg-[#f8f9fb] px-3 py-2">
        <BriefcaseIcon className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-claimondo-navy">
            Hat der Kunde eine eigene Kanzlei beauftragt?
          </p>
          <p className="text-[11px] text-claimondo-ondo">
            Bei „ja" verschwindet die VS-Kommunikation auf unserer Seite. Der Kunde sendet das
            Kanzleipaket eigenständig an seine Kanzlei und der Fall geht nach Versand auf
            Abschluss.
          </p>
          {istEigeneKanzlei && istUebergeben && (
            <p className="text-[11px] text-violet-800 mt-1 font-medium">
              Paket wurde bereits an die externe Kanzlei versendet — Toggle gesperrt.
            </p>
          )}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={istEigeneKanzlei}
            disabled={pendingWunsch || istUebergeben || !claimId}
            onChange={(e) =>
              handleToggleEigeneKanzlei(e.target.checked ? 'eigene_kanzlei' : 'partnerkanzlei')
            }
            className="w-4 h-4 accent-violet-600"
          />
          <span className="font-medium text-claimondo-navy">eigene Kanzlei</span>
        </label>
      </div>

      {/* A3: „Keine Kanzlei"-Hinweis — Kunde reguliert selbst, kein
          Kanzlei-Lifecycle auf unserer Seite. */}
      {istKeineKanzlei && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <BriefcaseIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-900">
              Kunde reguliert selbst
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Kunde hat „Keine Kanzlei" gewählt. Es wird keine VS-Kommunikation auf unserer
              Seite geführt und kein Folge-Auftrag (Nachbesichtigung/Stellungnahme) ist
              möglich, solange diese Wahl steht.
            </p>
          </div>
        </div>
      )}

      {/* Aktionen — bei eigene-Kanzlei oder keine-Kanzlei keine VS-Kontakt/Auszahlung */}
      {!istEigeneKanzlei && !istKeineKanzlei && !auszahlungDone && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-claimondo-border/60">
          {!vsKontaktDone && (
            <button
              type="button"
              onClick={handleKontakt}
              disabled={pendingKontakt}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium px-3 py-2 transition-colors"
            >
              <MailIcon className="w-4 h-4" />
              {pendingKontakt ? 'Wird gespeichert…' : 'VS-Kontakt erfasst'}
            </button>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <input
              type="text"
              inputMode="decimal"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              placeholder="Betrag €"
              className="w-28 rounded-lg border border-claimondo-border px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAuszahlung}
              disabled={pendingAuszahlung}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium px-3 py-2 transition-colors"
            >
              <EuroIcon className="w-4 h-4" />
              {pendingAuszahlung ? 'Wird gespeichert…' : 'Auszahlung eingegangen'}
            </button>
          </div>
        </div>
      )}

      {auszahlungDone && (
        <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span>Auszahlung am {fmt(ausgezahltAm)} eingegangen — Kanzlei-Fall abgeschlossen.</span>
        </div>
      )}

      {/* Side-Quest-Aktionen — sichtbar während aktiver Regulierung. Beide
          erfordern einen existierenden Kanzleifall (DB-Trigger 1.5c).
          Bei keine_kanzlei wurde der Kanzleifall gelöscht → Trigger blockt eh,
          aber UI versteckt die Buttons sofort. */}
      {!auszahlungDone && !istKeineKanzlei && claimId && (
        <div className="pt-2 border-t border-claimondo-border/60">
          <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-2">
            Folge-Aufträge anstoßen
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => { setSideQuestModal('nachbesichtigung'); setSideQuestGrund('') }}
              disabled={pendingSideQuest}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-claimondo-border bg-white hover:bg-[#f8f9fb] text-claimondo-navy text-sm font-medium px-3 py-2 transition-colors"
            >
              <RotateCwIcon className="w-3.5 h-3.5" />
              Nachbesichtigung anfordern
            </button>
            <button
              type="button"
              onClick={() => { setSideQuestModal('stellungnahme'); setSideQuestGrund('') }}
              disabled={pendingSideQuest}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-claimondo-border bg-white hover:bg-[#f8f9fb] text-claimondo-navy text-sm font-medium px-3 py-2 transition-colors"
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              Stellungnahme anfordern
            </button>
          </div>
        </div>
      )}

      {sideQuestModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-semibold text-claimondo-navy">
              {sideQuestModal === 'nachbesichtigung' ? 'Nachbesichtigung anfordern' : 'Stellungnahme anfordern'}
            </h3>
            <p className="text-xs text-claimondo-ondo">
              {sideQuestModal === 'nachbesichtigung'
                ? 'Der Sachverständige bekommt einen neuen Auftrag und vereinbart einen Termin. Der ursprüngliche SV wird automatisch zugewiesen.'
                : 'Der Sachverständige bekommt einen neuen Auftrag mit Schreibarbeit (z.B. Antwort auf VS-Kürzung). Kein Termin nötig.'}
            </p>
            <textarea
              value={sideQuestGrund}
              onChange={(e) => setSideQuestGrund(e.target.value)}
              placeholder="Grund / Hintergrund (optional, wird dem SV mitgeteilt)"
              rows={3}
              className="w-full rounded-lg border border-claimondo-border px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setSideQuestModal(null); setSideQuestGrund('') }}
                disabled={pendingSideQuest}
                className="px-3 py-1.5 text-sm text-claimondo-ondo hover:text-claimondo-navy"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSideQuestSubmit}
                disabled={pendingSideQuest}
                className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-medium px-4 py-1.5 transition-colors"
              >
                {pendingSideQuest ? 'Wird angelegt…' : 'Auftrag anlegen'}
              </button>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </div>
      )}

      {error && !sideQuestModal && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

function StepperDot({
  done,
  icon,
  label,
  datum,
}: {
  done: boolean
  icon: React.ReactNode
  label: string
  datum: string | null
}) {
  return (
    <div className="flex flex-col items-center min-w-[80px]">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${
          done ? 'bg-emerald-500 text-white' : 'bg-claimondo-border text-claimondo-ondo'
        }`}
      >
        {done ? <CheckIcon className="w-4 h-4" /> : icon}
      </div>
      <span className="text-[11px] font-medium text-claimondo-navy mt-1">{label}</span>
      {datum && <span className="text-[10px] text-claimondo-ondo">{datum}</span>}
    </div>
  )
}
