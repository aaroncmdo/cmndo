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
  UploadIcon,
  Loader2Icon,
} from 'lucide-react'
import {
  saVorlageFreigeben,
  saVorlageZurueckweisen,
  tier2Freigeben,
  tier2DokumentNachfordern,
  svSperren,
  svEntsperren,
  pflichtdokumentFreigeben,
  pflichtdokumentZurueckweisen,
  dokumenteAlleFreigeben,
  uploadAdminPflichtdokument,
} from './verifizierung-actions'
import { useRef } from 'react'

// AAR-359 W6: Admin-Verifizierungs-Tab.
//
// Drei Sektionen:
// 1. Tier 1 (SA-Vorlage) — PDF-Link + Freigabe/Zurückweisen
// 2. Tier 2 (14-Tage-Docs) — Status + Nachfordern + Tier-2-Freigabe
// 3. Sperre — Toggle mit Pflicht-Grund

// AAR-714: Tier-1-Pflichtdokumente (4 Slots: Sicherungsabtretung ODER
// Honorarvereinbarung + Datenschutzerklärung + Widerrufsbelehrung). Eines
// aus der Abtretungs-Gruppe + beide Einzel-Slots sind Pflicht. Bei Freigabe
// aller → sachverstaendige.verifiziert=true.
export type PflichtdokumentSlot = {
  slotId: string
  label: string
  beschreibung: string | null
  pflichtdokId: string | null
  status: 'ausstehend' | 'hochgeladen' | 'geprueft' | 'abgelehnt' | null
  hochgeladenAm: string | null
  dokumentUrl: string | null
  signedUrl: string | null
  adminNotiz: string | null
}

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
  // AAR-515: Quali-Zuordnung aus dokument_katalog.maps_to_qualifikation +
  // steuert_kundensichtbarkeit. Bei true schaltet die Freigabe den Quali-
  // Eintrag in Kundenkommunikation frei. Plausibilisierungs-Nummer aus
  // sachverstaendige.{bvsk,ihk,oebuv}_nummer wird hier als Read-only
  // mitgegeben, damit Admin Nummer + Dokument nebeneinander sieht.
  mapsToQualifikation: string | null
  steuertKundensichtbarkeit: boolean
  nummer: string | null
  nummerLabel: string | null
}

type Props = {
  svId: string
  // Tier 1 Legacy (SA-Vorlage — bleibt bis zum SA-Tool-Rebuild)
  saVorlageStatus: 'ausstehend' | 'geprueft' | 'zurueckgewiesen' | null
  saVorlageStoragePath: string | null
  saVorlageSignedUrl: string | null
  saVorlageAdminNotiz: string | null
  saVorlageHochgeladenAm: string | null
  // Tier 1 neu (AAR-714 Pflichtdokumente)
  pflichtdokumente: PflichtdokumentSlot[]
  svVerifiziert: boolean
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
    gray: 'bg-[#f8f9fb] text-claimondo-ondo border border-claimondo-border',
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
      <PflichtdokumenteCard
        svId={props.svId}
        pflichtdokumente={props.pflichtdokumente}
        svVerifiziert={props.svVerifiziert}
      />
      <SaVorlageCard {...props} />
      <Tier2Card {...props} />
      <SperreCard {...props} />
    </div>
  )
}

// ─── AAR-714: Tier-1-Pflichtdokumente ─────────────────────────────────

const PFLICHT_GROUP_ABTRETUNG = ['sv_sicherungsabtretung', 'sv_honorarvereinbarung']

function PflichtdokumenteCard({
  svId,
  pflichtdokumente,
  svVerifiziert,
}: {
  svId: string
  pflichtdokumente: PflichtdokumentSlot[]
  svVerifiziert: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)
  const [rejectingSlot, setRejectingSlot] = useState<string | null>(null)
  const [rejectNotiz, setRejectNotiz] = useState('')

  const byId = new Map(pflichtdokumente.map((d) => [d.slotId, d]))
  const abtretungOk = PFLICHT_GROUP_ABTRETUNG.some((s) => {
    const st = byId.get(s)?.status
    return st === 'hochgeladen' || st === 'geprueft'
  })
  const datenschutz = byId.get('sv_datenschutzerklaerung')
  const widerruf = byId.get('sv_widerrufsbelehrung')
  const datenschutzOk = datenschutz?.status === 'hochgeladen' || datenschutz?.status === 'geprueft'
  const widerrufOk = widerruf?.status === 'hochgeladen' || widerruf?.status === 'geprueft'
  const kannAlleFreigeben = abtretungOk && datenschutzOk && widerrufOk && !svVerifiziert

  function handleFreigeben(slotId: string) {
    setFehler(null)
    startTransition(async () => {
      const res = await pflichtdokumentFreigeben(svId, slotId)
      if (!res.success) setFehler(res.error ?? 'Freigabe fehlgeschlagen')
    })
  }

  function handleZurueckweisen(slotId: string) {
    if (rejectNotiz.trim().length < 10) {
      setFehler('Ablehnungsgrund muss mindestens 10 Zeichen lang sein.')
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await pflichtdokumentZurueckweisen(svId, slotId, rejectNotiz.trim())
      if (!res.success) {
        setFehler(res.error ?? 'Ablehnung fehlgeschlagen')
      } else {
        setRejectingSlot(null)
        setRejectNotiz('')
      }
    })
  }

  function handleAlleFreigeben() {
    if (
      !confirm(
        'Alle Pflichtdokumente freigeben? Der Gutachter wird als „verifiziert" markiert und auf der Kundenseite mit Badge angezeigt.',
      )
    ) {
      return
    }
    setFehler(null)
    startTransition(async () => {
      const res = await dokumenteAlleFreigeben(svId)
      if (!res.success) setFehler(res.error ?? 'Freigabe fehlgeschlagen')
    })
  }

  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-[#4573A2]" />
            Pflichtdokumente
          </h2>
          <p className="text-[11px] text-claimondo-ondo mt-0.5">
            Sicherungsabtretung oder Honorarvereinbarung · Datenschutzerklärung · Widerrufsbelehrung
          </p>
        </div>
        {svVerifiziert ? (
          <StatusBadge tone="green">
            <CheckCircle2Icon className="w-3 h-3" />
            verifiziert
          </StatusBadge>
        ) : (
          <StatusBadge tone={kannAlleFreigeben ? 'amber' : 'gray'}>
            {kannAlleFreigeben ? 'bereit zur Freigabe' : 'unvollständig'}
          </StatusBadge>
        )}
      </div>

      <div className="space-y-2">
        {pflichtdokumente.map((d) => (
          <div
            key={d.slotId}
            className="flex items-start gap-3 border border-claimondo-border rounded-xl p-3 bg-[#f8f9fb]/40"
          >
            <div className="w-9 h-9 rounded-lg bg-white border border-claimondo-border flex items-center justify-center flex-shrink-0">
              <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-claimondo-navy">{d.label}</p>
                {d.status === 'geprueft' && (
                  <StatusBadge tone="green">
                    <CheckCircle2Icon className="w-3 h-3" />
                    geprüft
                  </StatusBadge>
                )}
                {d.status === 'hochgeladen' && (
                  <StatusBadge tone="amber">
                    <ClockIcon className="w-3 h-3" />
                    hochgeladen
                  </StatusBadge>
                )}
                {d.status === 'abgelehnt' && (
                  <StatusBadge tone="red">
                    <XCircleIcon className="w-3 h-3" />
                    abgelehnt
                  </StatusBadge>
                )}
                {(d.status === null || d.status === 'ausstehend') && (
                  <StatusBadge tone="gray">fehlt</StatusBadge>
                )}
              </div>
              {d.hochgeladenAm && (
                <p className="text-[10px] text-claimondo-ondo mt-0.5">
                  Hochgeladen: {new Date(d.hochgeladenAm).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
              {d.status === 'abgelehnt' && d.adminNotiz && (
                <p className="text-[11px] text-red-700 mt-1 italic">Grund: {d.adminNotiz}</p>
              )}
              {d.signedUrl && (
                <a
                  href={d.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#4573A2] hover:underline mt-1 inline-block"
                >
                  Dokument öffnen ↗
                </a>
              )}
              {rejectingSlot === d.slotId && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={rejectNotiz}
                    onChange={(e) => setRejectNotiz(e.target.value)}
                    placeholder="Ablehnungsgrund (min. 10 Zeichen) — wird dem SV als Task angezeigt."
                    rows={2}
                    className="w-full text-xs px-2 py-1.5 border border-red-200 rounded-md focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleZurueckweisen(d.slotId)}
                      disabled={pending}
                      className="px-2.5 py-1 text-[11px] rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      Ablehnen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingSlot(null)
                        setRejectNotiz('')
                      }}
                      className="px-2.5 py-1 text-[11px] rounded-md border border-claimondo-border text-claimondo-ondo hover:bg-[#f8f9fb]"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0 items-end">
              {d.pflichtdokId && d.status !== 'geprueft' && rejectingSlot !== d.slotId && (
                <div className="flex gap-1">
                  {(d.status === 'hochgeladen' || d.status === 'abgelehnt') && (
                    <button
                      type="button"
                      onClick={() => handleFreigeben(d.slotId)}
                      disabled={pending}
                      className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Freigeben
                    </button>
                  )}
                  {d.status === 'hochgeladen' && (
                    <button
                      type="button"
                      onClick={() => setRejectingSlot(d.slotId)}
                      disabled={pending}
                      className="px-2 py-1 text-[11px] rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Ablehnen
                    </button>
                  )}
                </div>
              )}
              {/* Aaron 2026-04-30: Admin kann jederzeit selbst (re-)uploaden.
                  Schreibt auf den GLEICHEN Storage-Pfad wie der SV-Onboarding-
                  Upload — keine Duplikate, keine doppelte Datenpflege. */}
              <AdminSlotUpload
                svId={svId}
                slotId={d.slotId}
                hasFile={!!d.dokumentUrl}
              />
            </div>
          </div>
        ))}
      </div>

      {fehler && (
        <p className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
          {fehler}
        </p>
      )}

      {!svVerifiziert && (
        <div className="mt-4 flex items-center justify-between border-t border-claimondo-border pt-3">
          <p className="text-[11px] text-claimondo-ondo">
            Freigabe aller Dokumente setzt <code>sachverstaendige.verifiziert=true</code>.
          </p>
          <button
            type="button"
            onClick={handleAlleFreigeben}
            disabled={!kannAlleFreigeben || pending}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#1E3A5F] text-white hover:bg-[#4573A2] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Alle freigeben → verifizieren
          </button>
        </div>
      )}
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
    ? new Date(saVorlageHochgeladenAm).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
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
    <section className="glass-light border border-claimondo-border rounded-ios-md p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Tier 1 — SA-Vorlage (Dispatch-Gate)</h3>
        </div>
        {badge}
      </div>

      {!hochgeladen && (
        <p className="text-xs text-claimondo-ondo py-3">Der SV hat noch keine SA-Vorlage hochgeladen. Freigabe ist erst nach Upload möglich.</p>
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
              <span className="text-xs text-claimondo-ondo/70">PDF-Link konnte nicht generiert werden</span>
            )}
            {hochgeladenDatum && (
              <span className="text-[11px] text-claimondo-ondo">Hochgeladen: {hochgeladenDatum}</span>
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
                className="w-full text-xs px-3 py-2 rounded-lg border border-claimondo-border focus:outline-none focus:border-[#4573A2]"
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
    ? new Date(verifizierungFristBis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
    : null
  const verifiziertDatum = verifiziertAm
    ? new Date(verifiziertAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
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
    <section className="glass-light border border-claimondo-border rounded-ios-md p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Tier 2 — Verifizierungs-Dokumente</h3>
        </div>
        {badge}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-[11px]">
        {fristDatum && (
          <div className="px-3 py-2 rounded-lg bg-[#f8f9fb] border border-claimondo-border">
            <p className="text-claimondo-ondo">Frist bis</p>
            <p className="font-medium text-claimondo-navy">{fristDatum}</p>
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
          <p className="text-[11px] font-semibold text-claimondo-navy uppercase tracking-wide">Angefordert</p>
          {angefordert.map(slot => (
            <div key={slot.slotId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-claimondo-border">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-claimondo-navy">{slot.label}</p>
                {slot.beschreibung && <p className="text-[10px] text-claimondo-ondo">{slot.beschreibung}</p>}
                <SlotQualiHinweis slot={slot} />
              </div>
              <SlotStatusBadge status={slot.status} uploadCount={slot.uploadCount} />
            </div>
          ))}
        </div>
      )}

      {/* Offene Slots zum Nachfordern */}
      {offeneSlots.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[11px] font-semibold text-claimondo-navy uppercase tracking-wide">Noch nicht angefordert</p>
          {offeneSlots.map(slot => (
            <div key={slot.slotId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-claimondo-border">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-claimondo-navy">{slot.label}</p>
                {slot.beschreibung && <p className="text-[10px] text-claimondo-ondo">{slot.beschreibung}</p>}
                <SlotQualiHinweis slot={slot} />
              </div>
              <button
                type="button"
                onClick={() => setNachforderung({ slotId: slot.slotId, begruendung: '', frist: defaultFrist })}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[#4573A2] hover:bg-[#4573A2]/5 border border-[#4573A2]/20 disabled:opacity-50 shrink-0 ml-2"
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
            className="w-full text-xs px-3 py-2 rounded-lg border border-claimondo-border focus:outline-none focus:border-[#4573A2]"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-claimondo-ondo">Frist:</label>
            <input
              type="date"
              value={nachforderung.frist}
              onChange={e => setNachforderung({ ...nachforderung, frist: e.target.value })}
              className="text-xs px-2 py-1 rounded-lg border border-claimondo-border"
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
              className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-50"
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

// AAR-515: Quali-Hinweis + Nummer-Plausibilisierung.
// Zeigt Admin: „Freigabe → Quali X wird in Kundenkommunikation gezeigt"
// plus die vom Wizard erfasste Nummer (read-only) direkt neben dem Slot,
// damit Admin Nummer + Dokument beim Prüfen nebeneinander sehen kann.
function SlotQualiHinweis({ slot }: { slot: Tier2Slot }) {
  if (!slot.mapsToQualifikation) return null
  const isDat = slot.mapsToQualifikation === 'dat-gutachter'
  const qualiLabel = isDat ? 'DAT-Expert-Badge' : `Quali „${slot.mapsToQualifikation}"`

  return (
    <div className="mt-1 text-[10px] text-claimondo-ondo space-y-0.5">
      {slot.steuertKundensichtbarkeit && (
        <p className="text-[10px] text-[#4573A2]">
          Freigabe schaltet {qualiLabel} in Kundenkommunikation frei
        </p>
      )}
      {slot.nummer && (
        <p>
          {slot.nummerLabel ?? 'Nummer'}: <span className="font-mono text-claimondo-navy">{slot.nummer}</span>
        </p>
      )}
    </div>
  )
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
    <section className={`border rounded-2xl p-5 ${isGesperrt ? 'bg-red-50/50 border-red-200' : 'bg-white border-claimondo-border'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isGesperrt ? (
            <LockIcon className="w-4 h-4 text-red-600" />
          ) : (
            <UnlockIcon className="w-4 h-4 text-claimondo-ondo" />
          )}
          <h3 className="text-sm font-semibold text-claimondo-navy">Sperre</h3>
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
              {gesperrtSeit ? new Date(gesperrtSeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}
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
                className="w-full text-xs px-3 py-2 rounded-lg border border-claimondo-border focus:outline-none focus:border-[#4573A2]"
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
                  className="text-[11px] text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-50"
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

// ─── Admin-Slot-Upload (Aaron 2026-04-30) ────────────────────────────
//
// Pro Pflichtdok-Slot ein einzelner Upload-Button. Schreibt auf den
// IDENTISCHEN Storage-Pfad wie der SV-Onboarding-Upload, damit der
// Admin den SV nicht auffordern muss wenn er das PDF schon hat.

function AdminSlotUpload({
  svId,
  slotId,
  hasFile,
}: {
  svId: string
  slotId: string
  hasFile: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.append('slot_id', slotId)
    fd.append('datei', file)
    startTransition(async () => {
      const res = await uploadAdminPflichtdokument(svId, fd)
      if (!res.ok) setError(res.error ?? 'Upload fehlgeschlagen')
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-claimondo-border text-claimondo-navy hover:bg-[#f8f9fb] disabled:opacity-40"
        title={hasFile ? 'Bestehendes Dokument ersetzen' : 'Dokument hochladen'}
      >
        {pending ? (
          <Loader2Icon className="w-3 h-3 animate-spin" />
        ) : (
          <UploadIcon className="w-3 h-3" />
        )}
        {hasFile ? 'Ersetzen' : 'Hochladen'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={onChange}
      />
      {error && (
        <span className="text-[10px] text-red-700 max-w-[200px]">{error}</span>
      )}
    </>
  )
}
