'use client'

import { useState, useTransition } from 'react'
import {
  PhoneIcon, CheckCircleIcon, ClockIcon, MapPinIcon, CalendarIcon,
  FileSignatureIcon, UserIcon, CarIcon, PenIcon, MailIcon, ExternalLinkIcon,
} from 'lucide-react'
import { aktualisiereAnfrageStatus } from '../actions'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  neu: { label: 'Neu', color: 'bg-amber-100 text-amber-800' },
  in_bearbeitung: { label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-700' },
  sv_kontaktiert: { label: 'SV kontaktiert', color: 'bg-claimondo-ondo/10 text-claimondo-ondo' },
  termin_bestaetigt: { label: 'Termin bestätigt', color: 'bg-green-100 text-green-700' },
  abgeschlossen: { label: 'Abgeschlossen', color: 'bg-gray-100 text-gray-500' },
  storniert: { label: 'Storniert', color: 'bg-red-50 text-red-500' },
}

function Zeile({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-claimondo-border last:border-0">
      <span className="text-xs text-gray-400 w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-claimondo-navy flex-1">{value}</span>
    </div>
  )
}

function formatDatum(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return null
  return new Date(iso).toLocaleString('de-DE', opts ?? {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Anfrage = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string | null
  kennzeichen: string | null
  fahrzeug_beschreibung: string | null
  schadentyp: string
  schadenort: string | null
  schadenort_lat: number | null
  schadenort_lng: number | null
  wunschtermin: string | null
  matching_typ: string | null
  sa_signatur_data_url: string | null
  sa_unterzeichnet_am: string | null
  status: string
  erstellt_am: string
  fall_id: string | null
  sv_id: string | null
  sv_name: string | null
  sv_telefon: string | null
  sv_lead_id: string | null
  sv_lead_name: string | null
  sv_lead_telefon: string | null
  sv_lead_email: string | null
}

export default function GutachterFinderDetailClient({ anfrage }: { anfrage: Anfrage }) {
  const [lokalerStatus, setLokalerStatus] = useState(anfrage.status)
  const [, startTransition] = useTransition()

  const svName = anfrage.sv_name ?? anfrage.sv_lead_name ?? null
  const svTelefon = anfrage.sv_telefon ?? anfrage.sv_lead_telefon ?? null
  const svEmail = anfrage.sv_lead_email ?? null
  const istOffen = lokalerStatus === 'neu' || lokalerStatus === 'in_bearbeitung' || lokalerStatus === 'sv_kontaktiert'
  const statusCfg = STATUS_LABEL[lokalerStatus] ?? { label: lokalerStatus, color: 'bg-gray-100 text-gray-600' }

  function wechsleStatus(neuerStatus: string) {
    setLokalerStatus(neuerStatus)
    startTransition(() => {
      aktualisiereAnfrageStatus(anfrage.id, neuerStatus)
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Linke Spalte — Anfrage-Details */}
      <div className="space-y-4">
        {/* Kundendaten */}
        <section className="bg-white rounded-ios-lg shadow-ios-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserIcon className="w-4 h-4 text-claimondo-ondo" />
            <h2 className="text-sm font-semibold text-claimondo-navy">Kundendaten</h2>
          </div>
          <Zeile label="Name" value={`${anfrage.vorname} ${anfrage.nachname}`} />
          <Zeile
            label="E-Mail"
            value={
              <a href={`mailto:${anfrage.email}`} className="text-claimondo-ondo hover:underline">
                {anfrage.email}
              </a>
            }
          />
          <Zeile
            label="Telefon"
            value={
              anfrage.telefon ? (
                <a href={`tel:${anfrage.telefon}`} className="text-claimondo-ondo hover:underline">
                  {anfrage.telefon}
                </a>
              ) : null
            }
          />
          <Zeile label="Eingegangen am" value={formatDatum(anfrage.erstellt_am)} />
        </section>

        {/* Schadendetails */}
        <section className="bg-white rounded-ios-lg shadow-ios-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <CarIcon className="w-4 h-4 text-claimondo-ondo" />
            <h2 className="text-sm font-semibold text-claimondo-navy">Schadendaten</h2>
          </div>
          <Zeile label="Schadentyp" value={anfrage.schadentyp} />
          <Zeile label="Kennzeichen" value={anfrage.kennzeichen} />
          <Zeile label="Fahrzeug" value={anfrage.fahrzeug_beschreibung} />
          <Zeile
            label="Schadenort"
            value={
              anfrage.schadenort ? (
                <span className="flex items-start gap-1">
                  <MapPinIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-claimondo-ondo" />
                  {anfrage.schadenort}
                  {anfrage.schadenort_lat && anfrage.schadenort_lng && (
                    <a
                      href={`https://maps.google.com/?q=${anfrage.schadenort_lat},${anfrage.schadenort_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-claimondo-ondo hover:underline inline-flex items-center gap-0.5"
                    >
                      <ExternalLinkIcon className="w-3 h-3" />
                      Maps
                    </a>
                  )}
                </span>
              ) : null
            }
          />
          <Zeile
            label="Wunschtermin"
            value={
              anfrage.wunschtermin ? (
                <span className="flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
                  <strong>{formatDatum(anfrage.wunschtermin)}</strong>
                </span>
              ) : null
            }
          />
        </section>

        {/* SA-Unterzeichnung */}
        <section className="bg-white rounded-ios-lg shadow-ios-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileSignatureIcon className="w-4 h-4 text-claimondo-ondo" />
            <h2 className="text-sm font-semibold text-claimondo-navy">Schutzbrief / SA</h2>
          </div>
          {anfrage.sa_unterzeichnet_am ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircleIcon className="w-4 h-4" />
              Unterzeichnet am {formatDatum(anfrage.sa_unterzeichnet_am)}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
              <ClockIcon className="w-4 h-4" />
              Noch nicht unterzeichnet
            </div>
          )}
          {anfrage.sa_signatur_data_url && (
            <div className="mt-3 border border-claimondo-border rounded-ios-sm p-2 bg-claimondo-bg">
              <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wider">Unterschrift</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={anfrage.sa_signatur_data_url}
                alt="Unterschrift"
                className="max-h-24 rounded border border-claimondo-border bg-white"
              />
            </div>
          )}
        </section>

        {/* Fall-Link falls vorhanden */}
        {anfrage.fall_id && (
          <section className="bg-claimondo-bg border border-claimondo-border rounded-ios-lg p-4">
            <p className="text-xs text-claimondo-ondo font-semibold uppercase tracking-wider mb-1">Verknüpfte Fallakte</p>
            <a
              href={`/dispatch/leads/${anfrage.fall_id}`}
              className="text-sm font-semibold text-claimondo-navy hover:text-claimondo-ondo transition-colors"
            >
              Fall #{anfrage.fall_id.slice(0, 8)} öffnen →
            </a>
          </section>
        )}
      </div>

      {/* Rechte Spalte — SV + Workflow */}
      <div className="space-y-4">
        {/* Status-Badge + Workflow */}
        <section className="bg-white rounded-ios-lg shadow-ios-md p-4">
          <div className="flex items-center gap-2 mb-4">
            <PenIcon className="w-4 h-4 text-claimondo-ondo" />
            <h2 className="text-sm font-semibold text-claimondo-navy">Status</h2>
          </div>
          <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${statusCfg.color}`}>
            {statusCfg.label}
          </span>

          {istOffen && (
            <div className="mt-4 space-y-2">
              {lokalerStatus !== 'sv_kontaktiert' && (
                <button
                  onClick={() => wechsleStatus('sv_kontaktiert')}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-claimondo-ondo border border-claimondo-ondo hover:bg-claimondo-ondo hover:text-white px-4 py-2.5 rounded-ios-sm transition-colors"
                >
                  <PhoneIcon className="w-4 h-4" />
                  SV kontaktiert
                </button>
              )}
              <button
                onClick={() => wechsleStatus('termin_bestaetigt')}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-green-700 border border-green-600 hover:bg-green-600 hover:text-white px-4 py-2.5 rounded-ios-sm transition-colors"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Termin bestätigt
              </button>
              <button
                onClick={() => wechsleStatus('abgeschlossen')}
                className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 border border-gray-200 hover:bg-gray-100 px-4 py-2 rounded-ios-sm transition-colors"
              >
                <ClockIcon className="w-4 h-4" />
                Abschließen
              </button>
              <button
                onClick={() => wechsleStatus('storniert')}
                className="w-full flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 px-4 py-1.5 transition-colors"
              >
                Stornieren
              </button>
            </div>
          )}
        </section>

        {/* Lead-Fallback — prominenter Anruf-Block */}
        {anfrage.matching_typ === 'lead_fallback' && (
          <section className="bg-amber-50 border-2 border-amber-300 rounded-ios-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <PhoneIcon className="w-4 h-4 text-amber-700" />
              <h2 className="text-sm font-semibold text-amber-800">Manueller Anruf erforderlich</h2>
            </div>
            <p className="text-xs text-amber-700 mb-3 leading-relaxed">
              Kein Claimondo-SV in diesem Gebiet verfügbar. Der zugeordnete DAT-Expert muss
              telefonisch kontaktiert werden — Terminbestätigung liegt beim Dispatcher.
            </p>
            {svName && <p className="text-sm font-semibold text-claimondo-navy mb-2">{svName}</p>}
            {svTelefon && (
              <a
                href={`tel:${svTelefon}`}
                className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2.5 rounded-ios-sm transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
                {svTelefon} anrufen
              </a>
            )}
            {svEmail && (
              <a
                href={`mailto:${svEmail}`}
                className="flex items-center justify-center gap-2 w-full mt-2 text-sm text-amber-700 border border-amber-300 hover:bg-amber-100 px-4 py-2 rounded-ios-sm transition-colors"
              >
                <MailIcon className="w-4 h-4" />
                E-Mail senden
              </a>
            )}
            <p className="mt-3 text-[10px] text-amber-600">
              Wunschtermin: <strong>{anfrage.wunschtermin ? new Date(anfrage.wunschtermin).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</strong>
            </p>
          </section>
        )}

        {/* SV-Kontakt (registrierter Claimondo-SV) */}
        {anfrage.matching_typ !== 'lead_fallback' && (svName || svTelefon) && (
          <section className="bg-white rounded-ios-lg shadow-ios-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserIcon className="w-4 h-4 text-claimondo-ondo" />
              <h2 className="text-sm font-semibold text-claimondo-navy">Sachverständiger</h2>
            </div>
            <p className="text-sm font-semibold text-claimondo-navy mb-3">{svName}</p>
            {svTelefon && (
              <a
                href={`tel:${svTelefon}`}
                className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-white bg-claimondo-ondo hover:bg-claimondo-shield px-4 py-2.5 rounded-ios-sm transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
                {svTelefon}
              </a>
            )}
            {svEmail && (
              <a
                href={`mailto:${svEmail}`}
                className="flex items-center justify-center gap-2 w-full mt-2 text-sm text-claimondo-ondo border border-claimondo-border hover:bg-claimondo-bg px-4 py-2 rounded-ios-sm transition-colors"
              >
                <MailIcon className="w-4 h-4" />
                E-Mail senden
              </a>
            )}
            {anfrage.sv_id && (
              <a
                href={`/dispatch/sachverstaendige/${anfrage.sv_id}`}
                className="flex items-center justify-center gap-2 w-full mt-2 text-xs text-gray-500 hover:text-claimondo-ondo px-4 py-1.5 transition-colors"
              >
                <ExternalLinkIcon className="w-3.5 h-3.5" />
                SV-Profil öffnen
              </a>
            )}
          </section>
        )}

        {/* Matching-Info */}
        <section className="bg-claimondo-bg border border-claimondo-border rounded-ios-lg p-4">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-semibold mb-2">Matching</p>
          <p className="text-xs text-gray-600">
            {anfrage.matching_typ === 'isochron'
              ? 'Isochrone-Match — Claimondo-SV bedient dieses Gebiet'
              : anfrage.matching_typ === 'lead_fallback'
              ? 'Lead-Fallback — kein Claimondo-SV verfügbar, DAT-Expert im 30-km-Radius'
              : anfrage.matching_typ === 'sv_polygon'
              ? 'Isochrone-Match (legacy)'
              : anfrage.matching_typ === 'sv_lead'
              ? 'DAT-Expert-Lead (legacy)'
              : 'Kein automatisches Matching'}
          </p>
        </section>
      </div>
    </div>
  )
}
