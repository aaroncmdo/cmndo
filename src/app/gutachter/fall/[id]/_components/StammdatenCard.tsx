'use client'

// AAR-289 / AAR-396: Stammdaten-Übersicht für die rechte Spalte der SV-Fallakte.
// AAR-396 ergänzt fehlende Felder (Fahrbereit, Leasing/Finanzierung,
// Schadens-Adresse, Eigene Versicherung + VS-Schadennr., Gegner-Detail inkl.
// Fahrzeugtyp, Halter-Angaben wenn ≠ Fahrer). Leere Felder werden
// ausgeblendet — nicht mit „—" aufgefüllt.
// AAR-311: SV kann Cardentity Typ-B (15€) nach dem Termin manuell triggern
// wenn er bei der Vor-Ort-Besichtigung Vorschadenhinweise gefunden hat.

import {
  UserIcon,
  CarIcon,
  ShieldIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  FileTextIcon,
} from 'lucide-react'
import { CardentityTypBButton } from '@/components/cardentity/CardentityTypBButton'
import { requestCardentityTypBForFallSv } from '../cardentity-actions'
import PhoneButton from '@/components/shared/PhoneButton'

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  fin?: string | null
  vorschaden_typ_b_bericht?: Record<string, unknown> | null
  hat_vorschaeden?: boolean | null
  vorschaden_anzahl?: number | null
  vorschaden_letzter_datum?: string | null
  cardentity_abfrage_am?: string | null
  // AAR-545 Cluster D: Eigene VS lebt auf leads, nicht mehr auf faelle.
  eigene_versicherung?: string | null
  eigene_policennr?: string | null
} | null

type Kundenbetreuer = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function bool(v: unknown): boolean | null {
  if (v === true) return true
  if (v === false) return false
  return null
}

export function StammdatenCard({
  lead,
  fall,
  kundenbetreuer,
}: {
  lead: Lead
  fall: Record<string, unknown>
  kundenbetreuer: Kundenbetreuer
}) {
  const kundenName = lead
    ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || null
    : null
  const kbName = kundenbetreuer
    ? `${kundenbetreuer.vorname ?? ''} ${kundenbetreuer.nachname ?? ''}`.trim() ||
      null
    : null

  const hersteller = str(fall.fahrzeug_hersteller)
  const modell = str(fall.fahrzeug_modell)
  const baujahr = str(fall.fahrzeug_baujahr)
  const erstzulassung = str(fall.erstzulassung)
  const fahrzeugZeile =
    [hersteller, modell, baujahr ?? erstzulassung].filter(Boolean).join(' ') ||
    null

  const kennzeichen = str(fall.kennzeichen)
  const fin = str(fall.fin_vin) ?? str(lead?.fin)
  const fahrbereit = bool(fall.fahrzeug_fahrbereit)
  const leasing = bool(fall.leasing_flag)
  const leasinggeber = str(fall.leasinggeber_name)
  const finanzierung = bool(fall.finanzierung_flag)
  const finanzierungsgeber = str(fall.finanzierungsgeber_name)

  // Schadens-Adresse zusammensetzen (Straße, PLZ + Ort).
  const schadensAdresse = str(fall.schadens_adresse)
  const schadensPlz = str(fall.schadens_plz)
  const schadensOrt = str(fall.schadens_ort)
  const schadensOrtZeile = [schadensPlz, schadensOrt].filter(Boolean).join(' ')

  // AAR-545 Cluster D: Eigene VS kommt jetzt aus leads (faelle.versicherung_name
  // / schadennummer_versicherung / versicherung_schaden_nr sind ersatzlos weg).
  const eigeneVs = str(lead?.eigene_versicherung)
  const eigeneVsSchadenNr = str(lead?.eigene_policennr)

  const gegnerBekannt = bool(fall.gegner_bekannt) ?? true
  const gegnerName = str(fall.gegner_name)
  const gegnerKz = str(fall.gegner_kennzeichen)
  const gegnerFahrzeugtyp = str(fall.gegner_fahrzeugtyp)
  const gegnerVs = str(fall.gegner_versicherung)
  const gegnerVsNr = str(fall.gegner_versicherungsnummer)

  const halterAbweichend = bool(fall.halter_ungleich_fahrer_flag) ?? false
  const halterName =
    str(fall.halter_name) ??
    (str(fall.halter_vorname) || str(fall.halter_nachname)
      ? `${fall.halter_vorname ?? ''} ${fall.halter_nachname ?? ''}`.trim() ||
        null
      : null)
  const halterTelefon = str(fall.halter_telefon)
  const halterEmail = str(fall.halter_email)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Stammdaten
      </h3>

      {/* Kunde */}
      {(kundenName || lead?.telefon || lead?.email) && (
        <div className="flex items-start gap-3">
          <UserIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            {kundenName && (
              <p className="text-sm font-medium text-gray-900">{kundenName}</p>
            )}
            <div className="text-[11px] text-gray-500 space-y-0.5 mt-0.5">
              {lead?.telefon && (
                <p><PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} className="!text-gray-500 hover:!text-[var(--brand-secondary)] hover:!no-underline" /></p>
              )}
              {lead?.email && (
                <p className="flex items-center gap-1 min-w-0">
                  <MailIcon className="w-3 h-3 shrink-0" />
                  <a
                    href={`mailto:${lead.email}`}
                    className="truncate hover:text-[var(--brand-secondary)]"
                  >
                    {lead.email}
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fahrzeug */}
      <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
        <CarIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-xs space-y-2">
          <div>
            {fahrzeugZeile && (
              <p className="text-gray-900 font-medium">{fahrzeugZeile}</p>
            )}
            <p className="text-gray-500 mt-0.5">
              KZ: <span className="font-mono">{kennzeichen ?? '—'}</span>
              {fin && (
                <>
                  {' · '}FIN:{' '}
                  <span className="font-mono text-[10px]">{fin}</span>
                </>
              )}
            </p>
            {(fahrbereit !== null || leasing || finanzierung) && (
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-600">
                {fahrbereit === true && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2Icon className="w-3 h-3" /> fahrbereit
                  </span>
                )}
                {fahrbereit === false && (
                  <span className="inline-flex items-center gap-1 text-red-700">
                    <XCircleIcon className="w-3 h-3" /> nicht fahrbereit
                  </span>
                )}
                {leasing && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Leasing
                    {leasinggeber ? `: ${leasinggeber}` : ''}
                  </span>
                )}
                {finanzierung && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Finanzierung
                    {finanzierungsgeber ? `: ${finanzierungsgeber}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* AAR-311: Cardentity-Typ-B-Trigger (SV kann Vorschaden-Bericht
              nach Termin abrufen wenn Verdacht besteht). */}
          <CardentityTypBButton
            action={() => requestCardentityTypBForFallSv(fall.id as string)}
            finVorhanden={!!fin}
            initial={{
              fetchedAt: lead?.cardentity_abfrage_am ?? null,
              vorschadenVorhanden: lead?.hat_vorschaeden ?? null,
              vorschadenAnzahl: lead?.vorschaden_anzahl ?? null,
              letzterVorschadenDatum: lead?.vorschaden_letzter_datum ?? null,
            }}
          />
        </div>
      </div>

      {/* Schadensort */}
      {(schadensAdresse || schadensOrtZeile) && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <MapPinIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-gray-500">Schadensort</p>
            {schadensAdresse && (
              <p className="text-gray-900">{schadensAdresse}</p>
            )}
            {schadensOrtZeile && (
              <p className="text-gray-700">{schadensOrtZeile}</p>
            )}
          </div>
        </div>
      )}

      {/* Eigene Versicherung */}
      {(eigeneVs || eigeneVsSchadenNr) && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <FileTextIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-gray-500">Eigene Versicherung</p>
            {eigeneVs && <p className="text-gray-900">{eigeneVs}</p>}
            {eigeneVsSchadenNr && (
              <p className="text-gray-600">
                Schaden-Nr:{' '}
                <span className="font-mono">{eigeneVsSchadenNr}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gegner */}
      {gegnerBekannt !== false &&
        (gegnerName || gegnerKz || gegnerFahrzeugtyp || gegnerVs || gegnerVsNr) && (
          <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
            <ShieldIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 text-xs space-y-0.5">
              <p className="text-gray-500">Gegner</p>
              {gegnerName && (
                <p className="text-gray-900 font-medium">{gegnerName}</p>
              )}
              {gegnerKz && (
                <p className="text-gray-700">
                  KZ: <span className="font-mono">{gegnerKz}</span>
                  {gegnerFahrzeugtyp ? ` · ${gegnerFahrzeugtyp}` : ''}
                </p>
              )}
              {(gegnerVs || gegnerVsNr) && (
                <p className="text-gray-700 truncate">
                  {gegnerVs && <>VS: {gegnerVs}</>}
                  {gegnerVs && gegnerVsNr && ' · '}
                  {gegnerVsNr && (
                    <>
                      VS-Nr:{' '}
                      <span className="font-mono">{gegnerVsNr}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      {gegnerBekannt === false && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <AlertCircleIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500">Gegner nicht bekannt</p>
        </div>
      )}

      {/* Halter ≠ Fahrer */}
      {halterAbweichend && (halterName || halterTelefon || halterEmail) && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <UserIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-gray-500">Halter (abweichend vom Fahrer)</p>
            {halterName && (
              <p className="text-gray-900 font-medium">{halterName}</p>
            )}
            <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
              {halterTelefon && (
                <PhoneButton nummer={halterTelefon} variant="inline" label={halterTelefon} className="!text-gray-500 hover:!text-[var(--brand-secondary)] hover:!no-underline" />
              )}
              {halterEmail && (
                <a
                  href={`mailto:${halterEmail}`}
                  className="flex items-center gap-1 hover:text-[var(--brand-secondary)] min-w-0"
                >
                  <MailIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{halterEmail}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kundenbetreuer */}
      {kbName && (
        <div className="flex items-start gap-3 pt-3 border-t border-gray-100">
          <UserIcon className="w-4 h-4 text-[var(--brand-secondary)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-gray-500">Kundenbetreuer</p>
            <p className="text-gray-900 font-medium">{kbName}</p>
            <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
              {kundenbetreuer?.telefon && (
                <PhoneButton nummer={kundenbetreuer.telefon} variant="inline" label={kundenbetreuer.telefon} className="!text-gray-500 hover:!text-[var(--brand-secondary)] hover:!no-underline" />
              )}
              {kundenbetreuer?.email && (
                <a
                  href={`mailto:${kundenbetreuer.email}`}
                  className="flex items-center gap-1 hover:text-[var(--brand-secondary)] min-w-0"
                >
                  <MailIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{kundenbetreuer.email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
