'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  FileTextIcon,
  AlertTriangleIcon,
  LockIcon,
  UnlockIcon,
  PlusIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import {
  saVorlageFreigeben,
  saVorlageZurueckweisen,
  tier2Freigeben,
  tier2DokumentNachfordern,
  svSperren,
  svEntsperren,
} from './verifizierung-actions'

// AAR-359 W6: Admin-Verifizierungs-Tab.
//
// Drei Sektionen:
// 1. Tier 1 (SA-Vorlage) — PDF-Link + Freigabe/Zurückweisen
// 2. Tier 2 (14-Tage-Docs) — Status + Nachfordern + Tier-2-Freigabe
// 3. Sperre — Toggle mit Pflicht-Grund

export type Tier2Slot = {
  slotId: string
  label: string
  beschreibung: string | null
  // pflichtdokumente-Row falls bereits angefordert
  pflichtdokId: string | null
  status: 'ausstehend' | 'eingereicht' | 'genehmigt' | 'abgelehnt' | null
  hochgeladenAm: string | null
  // optional document_uploads info
  uploadCount: number
}

type Props = {
  svId: string
  // Tier 1
  saVorlageStatus: 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null
  saVorlageStoragePath: string | null
  saVorlageSignedUrl: string | null
  saVorlageAdminNotiz: string | null
  saVorlageHochgeladenAm: string | null
  // Tier 2
  verifizierungStatus: 'ausstehend' | 'geprueft' | 'frist_ueberschritten' | null
  verifizierungFristBis: string | null
  verifiziertAm: string | null
  tier2Slots: Tier2Slot[]
  // Sperre
  gesperrtSeit: string | null
  gesperrtGrund: string | null
}

type StatusBadgeTone = 'green' | 'amber' | 'red' | 'gray'

function StatusBadge({ tone, children }: { tone: StatusBadgeTone; children: React.ReactNode }) {
  const styles: Record<StatusBadgeTone, string> = {
    green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200',
    red: 'bg-red-50 text-red-700 border border-red-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[tone]}`}>
      {children}
    </span>
  )
}

export default function VerifizierungsTab(props: Props) {
  return (
    <div className="space-y-5">
      <SaVorlageCard {...props} />
      <Tier2Card {...props} />
      <SperreCard {...props} />
    </div>
  )
}

// ─── Tier 1 ──────────────────────────────────────────────────────────

function SaVorlageCard({
  svId,
  saVorlageStatus,
  saVorlageSignedUrl,
  saVorlageStoragePath,
  saVorlageAdminNotiz,
  saVorlageHochgeladenAm,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [notiz, setNotiz] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const hochgeladen = Boolean(saVorlageStoragePath)
  const hochgeladenDatum = saVorlageHochgeladenAm
    ? new Date(saVorlageHochgeladenAm).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : null

  function handleFreigeben() {
    if (!confirm('SA-Vorlage freigeben? Der Dispatch-Gate wird für diesen SV geöffnet.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await saVorlageFreigeben(svId)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  function handleZurueckweisen() {
    if (notiz.trim().length < 10) {
      setFehler('Bitte mindestens 10 Zeichen Ablehnungsgrund angeben.')
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await saVorlageZurueckweisen(svId, notiz)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
      else {
        setNotiz('')
        setShowReject(false)
      }
    })
  }

  let badge: React.ReactNode = <StatusBadge tone="gray">Noch nicht hochgeladen</StatusBadge>
  if (saVorlageStatus === 'ausstehend') {
    badge = <StatusBadge tone="amber"><ClockIcon className="w-2.5 h-2.5" />Wartet auf Prüfung</StatusBadge>
  } else if (saVorlageStatus === 'geprueft') {
    badge = <StatusBadge tone="green"><CheckCircle2Icon className="w-2.5 h-2.5" />Freigegeben</StatusBadge>
  } else if (saVorlageStatus === 'zurueckgewiesen') {
    badge = <StatusBadge tone="red"><XCircleIcon className="w-2.5 h-2.5" />Zurückgewiesen</StatusBadge>
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-gray-900">Tier 1 — SA-Vorlage (Dispatch-Gate)</h3>
        </div>
        {badge}
      </div>

      {!hochgeladen && (
        <p className="text-xs text-gray-500 py-3">Der SV hat noch keine SA-Vorlage hochgeladen. Freigabe ist erst nach Upload möglich.</p>
      )}

      {hochgeladen && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {saVorlageSignedUrl ? (
              <a
                href={saVorlageSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#4573A2] bg-[#4573A2]/5 hover:bg-[#4573A2]/10 border border-[#4573A2]/20"
              >
                <FileTextIcon className="w-3.5 h-3.5" />
                PDF ansehen
              </a>
            ) : (
              <span className="text-xs text-gray-400">PDF-Link konnte nicht generiert werden</span>
            )}
            {hochgeladenDatum && (
              <span className="text-[11px] text-gray-500">Hochgeladen: {hochgeladenDatum}</span>
            )}
          </div>

          {saVorlageStatus === 'zurueckgewiesen' && saVorlageAdminNotiz && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              <span className="font-semibold">Bisheriger Ablehnungsgrund:</span> {saVorlageAdminNotiz}
            </div>
          )}

          {saVorlageStatus !== 'geprueft' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFreigeben}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2Icon className="w-3.5 h-3.5" />
                Freigeben
              </button>
              <button
                type="button"
                onClick={() => setShowReject(v => !v)}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-red-700 hover:bg-red-50 border border-red-200 disabled:opacity-50"
              >
                <XCircleIcon className="w-3.5 h-3.5" />
                Zurückweisen
              </button>
            </div>
          )}

          {showReject && (
            <div className="space-y-2">
              <textarea
                value={notiz}
                onChange={e => setNotiz(e.target.value)}
                placeholder="Ablehnungsgrund (min. 10 Zeichen) — wird dem SV im Banner angezeigt."
                rows={3}
                className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#4573A2]"
              />
              <button
                type="button"
                onClick={handleZurueckweisen}
                disabled={pending || notiz.trim().length < 10}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                Ablehnung senden
              </button>
            </div>
          )}

          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>
      )}
    </section>
  )
}

// ─── Tier 2 ──────────────────────────────────────────────────────────

function Tier2Card({
  svId,
  verifizierungStatus,
  verifizierungFristBis,
  verifiziertAm,
  tier2Slots,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [nachforderung, setNachforderung] = useState<{ slotId: string; begruendung: string; frist: string } | null>(null)

  const offeneSlots = tier2Slots.filter(s => !s.pflichtdokId)
  const angefordert = tier2Slots.filter(s => s.pflichtdokId)

  let badge: React.ReactNode = <StatusBadge tone="gray">Noch nicht geprüft</StatusBadge>
  if (verifizierungStatus === 'ausstehend') {
    badge = <StatusBadge tone="amber"><ClockIcon className="w-2.5 h-2.5" />14-Tage-Frist läuft</StatusBadge>
  } else if (verifizierungStatus === 'geprueft') {
    badge = <StatusBadge tone="green"><CheckCircle2Icon className="w-2.5 h-2.5" />Verifiziert</StatusBadge>
  } else if (verifizierungStatus === 'frist_ueberschritten') {
    badge = <StatusBadge tone="red"><AlertTriangleIcon className="w-2.5 h-2.5" />Frist überschritten</StatusBadge>
  }

  const fristDatum = verifizierungFristBis
    ? new Date(verifizierungFristBis).toLocaleDateString('de-DE')
    : null
  const verifiziertDatum = verifiziertAm
    ? new Date(verifiziertAm).toLocaleDateString('de-DE')
    : null

  function handleFreigeben() {
    if (!confirm('Tier-2-Verifizierung freigeben? SV gilt damit als vollständig verifiziert.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await tier2Freigeben(svId)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  function handleNachfordern() {
    if (!nachforderung) return
    if (nachforderung.begruendung.trim().length < 20) {
      setFehler('Begründung muss mindestens 20 Zeichen lang sein.')
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await tier2DokumentNachfordern(
        svId,
        nachforderung.slotId,
        nachforderung.begruendung,
        nachforderung.frist,
      )
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
      else setNachforderung(null)
    })
  }

  const defaultFrist = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-gray-900">Tier 2 — Verifizierungs-Dokumente</h3>
        </div>
        {badge}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-[11px]">
        {fristDatum && (
          <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-gray-500">Frist bis</p>
            <p className="font-medium text-gray-800">{fristDatum}</p>
          </div>
        )}
        {verifiziertDatum && (
          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-emerald-700">Verifiziert am</p>
            <p className="font-medium text-emerald-800">{verifiziertDatum}</p>
          </div>
        )}
      </div>

      {/* Angeforderte Slots */}
      {angefordert.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Angefordert</p>
          {angefordert.map(slot => (
            <div key={slot.slotId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200">
              <div>
                <p className="text-xs font-medium text-gray-800">{slot.label}</p>
                {slot.beschreibung && <p className="text-[10px] text-gray-500">{slot.beschreibung}</p>}
              </div>
              <SlotStatusBadge status={slot.status} uploadCount={slot.uploadCount} />
            </div>
          ))}
        </div>
      )}

      {/* Offene Slots zum Nachfordern */}
      {offeneSlots.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Noch nicht angefordert</p>
          {offeneSlots.map(slot => (
            <div key={slot.slotId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-gray-300">
              <div>
                <p className="text-xs font-medium text-gray-700">{slot.label}</p>
                {slot.beschreibung && <p className="text-[10px] text-gray-500">{slot.beschreibung}</p>}
              </div>
              <button
                type="button"
                onClick={() => setNachforderung({ slotId: slot.slotId, begruendung: '', frist: defaultFrist })}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[#4573A2] hover:bg-[#4573A2]/5 border border-[#4573A2]/20 disabled:opacity-50"
              >
                <PlusIcon className="w-3 h-3" />
                Anfordern
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Nachfordern-Dialog */}
      {nachforderung && (
        <div className="mb-4 p-3 rounded-lg bg-[#4573A2]/5 border border-[#4573A2]/20 space-y-2">
          <p className="text-xs font-semibold text-[#1E3A5F]">
            Anfordern: {tier2Slots.find(s => s.slotId === nachforderung.slotId)?.label}
          </p>
          <textarea
            value={nachforderung.begruendung}
            onChange={e => setNachforderung({ ...nachforderung, begruendung: e.target.value })}
            placeholder="Begründung (min. 20 Zeichen) — wird dem SV in der Mitteilung angezeigt."
            rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#4573A2]"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-600">Frist:</label>
            <input
              type="date"
              value={nachforderung.frist}
              onChange={e => setNachforderung({ ...nachforderung, frist: e.target.value })}
              className="text-xs px-2 py-1 rounded-lg border border-gray-300"
            />
            <button
              type="button"
              onClick={handleNachfordern}
              disabled={pending}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-[#1E3A5F] text-white hover:bg-[#4573A2] disabled:opacity-50"
            >
              Anforderung senden
            </button>
            <button
              type="button"
              onClick={() => setNachforderung(null)}
              disabled={pending}
              className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {verifizierungStatus !== 'geprueft' && (
        <button
          type="button"
          onClick={handleFreigeben}
          disabled={pending}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle2Icon className="w-3.5 h-3.5" />
          Tier-2 komplett freigeben
        </button>
      )}

      {fehler && <p className="text-xs text-red-600 mt-2">{fehler}</p>}
    </section>
  )
}

function SlotStatusBadge({ status, uploadCount }: { status: Tier2Slot['status']; uploadCount: number }) {
  if (status === 'genehmigt') return <StatusBadge tone="green">Genehmigt</StatusBadge>
  if (status === 'eingereicht') return <StatusBadge tone="amber">Eingereicht ({uploadCount})</StatusBadge>
  if (status === 'abgelehnt') return <StatusBadge tone="red">Abgelehnt</StatusBadge>
  return <StatusBadge tone="gray">Ausstehend</StatusBadge>
}

// ─── Sperre ──────────────────────────────────────────────────────────

function SperreCard({ svId, gesperrtSeit, gesperrtGrund }: Props) {
  const [pending, startTransition] = useTransition()
  const [grund, setGrund] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const isGesperrt = Boolean(gesperrtSeit)

  function handleSperren() {
    if (grund.trim().length < 10) {
      setFehler('Sperr-Grund muss mindestens 10 Zeichen lang sein.')
      return
    }
    if (!confirm('SV wirklich sperren? ist_aktiv wird auf false gesetzt. Dispatch bekommt keine Fälle mehr zu diesem SV.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await svSperren(svId, grund)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
      else {
        setGrund('')
        setShowForm(false)
      }
    })
  }

  function handleEntsperren() {
    if (!confirm('SV wirklich entsperren? ist_aktiv wird auf true gesetzt.')) return
    setFehler(null)
    startTransition(async () => {
      const res = await svEntsperren(svId)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  return (
    <section className={`border rounded-2xl p-5 ${isGesperrt ? 'bg-red-50/50 border-red-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isGesperrt ? (
            <LockIcon className="w-4 h-4 text-red-600" />
          ) : (
            <UnlockIcon className="w-4 h-4 text-gray-500" />
          )}
          <h3 className="text-sm font-semibold text-gray-900">Sperre</h3>
        </div>
        {isGesperrt ? (
          <StatusBadge tone="red"><LockIcon className="w-2.5 h-2.5" />Gesperrt</StatusBadge>
        ) : (
          <StatusBadge tone="gray">Nicht gesperrt</StatusBadge>
        )}
      </div>

      {isGesperrt ? (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-lg bg-white border border-red-200 text-xs">
            <p className="text-red-800">
              <span className="font-semibold">Gesperrt seit:</span>{' '}
              {gesperrtSeit ? new Date(gesperrtSeit).toLocaleDateString('de-DE') : '—'}
            </p>
            {gesperrtGrund && <p className="text-red-700 mt-1 whitespace-pre-line"><span className="font-semibold">Grund:</span> {gesperrtGrund}</p>}
          </div>
          <button
            type="button"
            onClick={handleEntsperren}
            disabled={pending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50"
          >
            <UnlockIcon className="w-3.5 h-3.5" />
            Entsperren
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-red-700 hover:bg-red-50 border border-red-200 disabled:opacity-50"
            >
              <LockIcon className="w-3.5 h-3.5" />
              SV sperren
            </button>
          ) : (
            <>
              <textarea
                value={grund}
                onChange={e => setGrund(e.target.value)}
                placeholder="Sperr-Grund (min. 10 Zeichen) — interner Vermerk + Audit."
                rows={3}
                className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-[#4573A2]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSperren}
                  disabled={pending || grund.trim().length < 10}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                >
                  <LockIcon className="w-3.5 h-3.5" />
                  Sperren
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setGrund(''); setFehler(null) }}
                  disabled={pending}
                  className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {fehler && <p className="text-xs text-red-600 mt-2">{fehler}</p>}
    </section>
  )
}
