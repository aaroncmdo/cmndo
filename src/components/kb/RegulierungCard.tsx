'use client'

// CMM-32i: Kanzlei-Fall-Lifecycle in der KB-Fallakte. Zeigt den aktuellen
// Stand (versicherungskontakt → auszahlung) als Mini-Stepper plus zwei
// Buttons. Render-Bedingung: Caller liefert nur Daten, wenn kanzlei_faelle
// für diesen Fall existiert (also nach KB-Freigabe).

import { useState, useTransition } from 'react'
import { CheckIcon, MailIcon, EuroIcon, BriefcaseIcon, RotateCwIcon, FileTextIcon, AlertTriangleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  kanzleiVsKontaktErfasst,
  kanzleiAuszahlungEingegangen,
  setVsReaktionManuell,
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
  /** A2: VS-Reaktions-Snapshot vom Fall — kommt aus LexDrive-Webhook-Updates. */
  vsReaktion?: {
    typ: 'gekuerzt' | 'voll_reguliert' | 'abgelehnt' | 'mehr_zeit' | 'nachbesichtigung' | 'quotiert' | null
    am: string | null
    kuerzungGrund: string | null
    ablehnungsgrund: string | null
    quoteProzent: number | null
  }
}

const VS_REAKTION_LABEL: Record<string, { label: string; tone: 'amber' | 'rose' | 'emerald' | 'violet' }> = {
  gekuerzt: { label: 'VS hat gekürzt', tone: 'amber' },
  abgelehnt: { label: 'VS hat abgelehnt', tone: 'rose' },
  quotiert: { label: 'VS hat quotiert', tone: 'amber' },
  mehr_zeit: { label: 'VS bittet um Fristverlängerung', tone: 'amber' },
  nachbesichtigung: { label: 'VS fordert Nachbesichtigung', tone: 'violet' },
  voll_reguliert: { label: 'VS hat voll reguliert', tone: 'emerald' },
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
  vsReaktion,
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
  // A4 P1: Manuelle VS-Reaktions-Erfassung
  const [pendingVsReaktion, startVsReaktion] = useTransition()
  const [vsReaktionModal, setVsReaktionModal] = useState(false)
  const [vsReaktionTyp, setVsReaktionTyp] = useState<'gekuerzt' | 'abgelehnt' | 'voll_reguliert' | 'quotiert'>('gekuerzt')
  const [vsBetrag, setVsBetrag] = useState<string>('')
  const [vsGrund, setVsGrund] = useState<string>('')
  const [vsQuote, setVsQuote] = useState<string>('')

  const vsKontaktDone = !!vsKontaktAm
  const auszahlungDone = !!ausgezahltAm
  const istEigeneKanzlei = kanzleiWunsch === 'eigene_kanzlei'
  const istKeineKanzlei = kanzleiWunsch === 'keine_kanzlei'
  const istUebergeben = !!kanzleiUebergebenAm

  // A4 P2: SF-Reminder-Banner — wenn Kanzleifall seit > 7 Tagen offen ist
  // (kanzlei_uebergeben_am gesetzt) und noch keine VS-Reaktion da ist,
  // KB an Salesforce-Lookup erinnern. Liefert keine harten Action, ist
  // ein „check-in"-Hinweis.
  const ueberbergangsAlter = (() => {
    if (!kanzleiUebergebenAm) return null
    try {
      const ms = Date.now() - new Date(kanzleiUebergebenAm).getTime()
      return Math.floor(ms / (1000 * 60 * 60 * 24))
    } catch {
      return null
    }
  })()
  const zeigeSfReminder =
    !auszahlungDone &&
    !istKeineKanzlei &&
    !istEigeneKanzlei &&
    !vsReaktion?.typ &&
    ueberbergangsAlter !== null &&
    ueberbergangsAlter >= 7

  // A2: Empfehlung welcher Side-Quest sinnvoll ist abhängig von VS-Reaktion.
  const vsTyp = vsReaktion?.typ ?? null
  const vsLabel = vsTyp ? VS_REAKTION_LABEL[vsTyp] : null
  const empfehlung: { typ: 'nachbesichtigung' | 'stellungnahme' | null; grundPrefill: string } = (() => {
    if (vsTyp === 'nachbesichtigung') {
      return { typ: 'nachbesichtigung', grundPrefill: 'VS fordert Nachbesichtigung.' }
    }
    if (vsTyp === 'gekuerzt') {
      const grund = vsReaktion?.kuerzungGrund?.trim()
      return { typ: 'stellungnahme', grundPrefill: grund ? `VS-Kürzung: ${grund}` : 'VS hat gekürzt — bitte Stellungnahme einreichen.' }
    }
    if (vsTyp === 'abgelehnt') {
      const grund = vsReaktion?.ablehnungsgrund?.trim()
      return { typ: 'stellungnahme', grundPrefill: grund ? `VS-Ablehnung: ${grund}` : 'VS hat abgelehnt — bitte Stellungnahme einreichen.' }
    }
    if (vsTyp === 'quotiert') {
      const quote = vsReaktion?.quoteProzent
      return {
        typ: 'stellungnahme',
        grundPrefill: quote != null
          ? `VS hat mit ${quote}% Quote reguliert — bitte Stellungnahme einreichen.`
          : 'VS hat quotiert — bitte Stellungnahme einreichen.',
      }
    }
    if (vsTyp === 'mehr_zeit') {
      return { typ: 'stellungnahme', grundPrefill: 'VS bittet um Fristverlängerung — Reaktion dokumentieren.' }
    }
    return { typ: null, grundPrefill: '' }
  })()

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

  function handleVsReaktionSubmit() {
    setError(null)
    const betrag = vsBetrag.trim() ? Number(vsBetrag.replace(',', '.')) : undefined
    if (betrag !== undefined && (Number.isNaN(betrag) || betrag < 0)) {
      setError('Betrag ungültig')
      return
    }
    const quote = vsQuote.trim() ? Number(vsQuote.replace(',', '.')) : undefined
    if (quote !== undefined && (Number.isNaN(quote) || quote < 0 || quote > 100)) {
      setError('Quote ungültig (0-100)')
      return
    }
    startVsReaktion(async () => {
      const r = await setVsReaktionManuell(fallId, {
        typ: vsReaktionTyp,
        grund: vsGrund.trim() || null,
        kuerzungs_betrag: vsReaktionTyp === 'gekuerzt' ? (betrag ?? null) : null,
        regulierung_betrag: vsReaktionTyp === 'voll_reguliert' || vsReaktionTyp === 'gekuerzt' ? (betrag ?? null) : null,
        quote_prozent: vsReaktionTyp === 'quotiert' ? (quote ?? null) : null,
      })
      if (!r.ok) {
        setError(r.error ?? 'Speichern fehlgeschlagen')
        return
      }
      setVsReaktionModal(false)
      setVsBetrag(''); setVsGrund(''); setVsQuote('')
      router.refresh()
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
      <div className="flex items-start gap-2.5 rounded-lg border border-claimondo-border/60 bg-claimondo-bg px-3 py-2">
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

      {/* A2: VS-Reaktions-Sektion — sichtbar sobald LexDrive eine Reaktion
          gemeldet hat. Bei kontroversen Reaktionen (gekürzt, abgelehnt,
          quotiert, mehr_zeit) Quick-CTA für Stellungnahme; bei
          nachbesichtigung CTA für Nachbesichtigung. Voll reguliert ist
          neutral, kein Action nötig. */}
      {vsLabel && !auszahlungDone && !istKeineKanzlei && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
            vsLabel.tone === 'rose' ? 'border-rose-300 bg-rose-50' :
            vsLabel.tone === 'amber' ? 'border-amber-300 bg-amber-50' :
            vsLabel.tone === 'emerald' ? 'border-emerald-300 bg-emerald-50' :
            'border-violet-300 bg-violet-50'
          }`}
        >
          <AlertTriangleIcon className={`w-4 h-4 shrink-0 mt-0.5 ${
            vsLabel.tone === 'rose' ? 'text-rose-700' :
            vsLabel.tone === 'amber' ? 'text-amber-700' :
            vsLabel.tone === 'emerald' ? 'text-emerald-700' :
            'text-violet-700'
          }`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${
              vsLabel.tone === 'rose' ? 'text-rose-900' :
              vsLabel.tone === 'amber' ? 'text-amber-900' :
              vsLabel.tone === 'emerald' ? 'text-emerald-900' :
              'text-violet-900'
            }`}>{vsLabel.label}{vsReaktion?.am ? ` am ${fmt(vsReaktion.am)}` : ''}</p>
            {(vsReaktion?.kuerzungGrund || vsReaktion?.ablehnungsgrund || vsReaktion?.quoteProzent != null) && (
              <p className="text-[11px] text-claimondo-ondo mt-0.5 truncate">
                {vsReaktion?.kuerzungGrund || vsReaktion?.ablehnungsgrund ||
                  (vsReaktion?.quoteProzent != null ? `Quote: ${vsReaktion.quoteProzent}%` : '')}
              </p>
            )}
            {empfehlung.typ && claimId && (
              <button
                type="button"
                onClick={() => {
                  setSideQuestModal(empfehlung.typ)
                  setSideQuestGrund(empfehlung.grundPrefill)
                }}
                disabled={pendingSideQuest}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-xs font-medium px-2.5 py-1.5 transition-colors"
              >
                {empfehlung.typ === 'nachbesichtigung' ? (
                  <><RotateCwIcon className="w-3 h-3" />Nachbesichtigung anfordern</>
                ) : (
                  <><FileTextIcon className="w-3 h-3" />Stellungnahme anfordern</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* A4 P2: SF-Reminder — Status seit > 7 Tagen unverändert, KB soll
          in Salesforce nachsehen ob die VS schon geantwortet hat. */}
      {zeigeSfReminder && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-900">
              Seit {ueberbergangsAlter} Tagen keine VS-Reaktion erfasst
            </p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              Akte ist {ueberbergangsAlter} Tage in der Kanzlei. Bitte in
              Salesforce nachschauen ob die Versicherung schon geantwortet hat —
              wenn ja, hier unten eintragen.
            </p>
          </div>
        </div>
      )}

      {/* A4 P1: VS-Reaktion manuell erfassen — sichtbar wenn keine Reaktion
          via LexDrive eingegangen ist. KB trägt nach Salesforce-Lookup
          Kürzungsbetrag + Grund manuell ein. */}
      {!vsLabel && !auszahlungDone && !istKeineKanzlei && claimId && (
        <button
          type="button"
          onClick={() => setVsReaktionModal(true)}
          disabled={pendingVsReaktion}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-claimondo-border bg-white hover:bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium px-3 py-2 transition-colors"
        >
          <FileTextIcon className="w-3.5 h-3.5" />
          VS-Reaktion eintragen (aus Salesforce)
        </button>
      )}

      {vsReaktionModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-base font-semibold text-claimondo-navy">VS-Reaktion eintragen</h3>
            <p className="text-xs text-claimondo-ondo">
              Was hat die Versicherung in Salesforce geantwortet?
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-claimondo-navy block">Reaktions-Typ</label>
              <select
                value={vsReaktionTyp}
                onChange={(e) => setVsReaktionTyp(e.target.value as typeof vsReaktionTyp)}
                className="w-full rounded-lg border border-claimondo-border px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              >
                <option value="gekuerzt">Gekürzt</option>
                <option value="abgelehnt">Abgelehnt</option>
                <option value="voll_reguliert">Voll reguliert</option>
                <option value="quotiert">Quotiert</option>
              </select>
            </div>
            {(vsReaktionTyp === 'gekuerzt' || vsReaktionTyp === 'voll_reguliert') && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-claimondo-navy block">
                  {vsReaktionTyp === 'gekuerzt' ? 'Anerkannter Betrag (€)' : 'Auszahlungs-Betrag (€)'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vsBetrag}
                  onChange={(e) => setVsBetrag(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-claimondo-border px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
                />
              </div>
            )}
            {vsReaktionTyp === 'quotiert' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-claimondo-navy block">Quote (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vsQuote}
                  onChange={(e) => setVsQuote(e.target.value)}
                  placeholder="0-100"
                  className="w-full rounded-lg border border-claimondo-border px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-claimondo-navy block">
                Grund / Begründung (optional)
              </label>
              <textarea
                value={vsGrund}
                onChange={(e) => setVsGrund(e.target.value)}
                rows={3}
                placeholder="z.B. Reparaturkosten gekürzt wegen Vorschäden"
                className="w-full rounded-lg border border-claimondo-border px-3 py-2 text-sm focus:border-claimondo-ondo focus:outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setVsReaktionModal(false); setVsBetrag(''); setVsGrund(''); setVsQuote('') }}
                disabled={pendingVsReaktion}
                className="px-3 py-1.5 text-sm text-claimondo-ondo hover:text-claimondo-navy"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleVsReaktionSubmit}
                disabled={pendingVsReaktion}
                className="rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 disabled:bg-claimondo-navy/40 text-white text-sm font-medium px-4 py-1.5 transition-colors"
              >
                {pendingVsReaktion ? 'Wird gespeichert…' : 'Eintragen'}
              </button>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        </div>
      )}

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
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-claimondo-border bg-white hover:bg-claimondo-bg text-claimondo-navy text-sm font-medium px-3 py-2 transition-colors"
            >
              <RotateCwIcon className="w-3.5 h-3.5" />
              Nachbesichtigung anfordern
            </button>
            <button
              type="button"
              onClick={() => { setSideQuestModal('stellungnahme'); setSideQuestGrund('') }}
              disabled={pendingSideQuest}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-claimondo-border bg-white hover:bg-claimondo-bg text-claimondo-navy text-sm font-medium px-3 py-2 transition-colors"
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
