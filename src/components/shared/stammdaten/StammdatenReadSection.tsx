'use client'

// AAR-754 (Phase C): Shared Read-Only Stammdaten-Section für SV / Kunde /
// Makler. 6 Blöcke (Kunde, Fahrzeug, Schadensort, Eigene Versicherung,
// Gegner, Halter). Felder werden pro Rolle gefiltert — Kunde sieht seine
// eigenen Daten ohne Halter-Info (wenn = Fahrer), Makler sieht nur das
// Nötigste.
//
// Admin behält seine inline-editierbare Variante
// (`src/app/faelle/[id]/_stammdaten/`), weil dort Edit-Modus mit
// FallContext-Integration aktiv ist. Separater Scope.
//
// Ersetzt:
//  - `src/app/gutachter/fall/[id]/_components/StammdatenCard.tsx`
//    (Stammdaten-Teil, ohne CardentityTypBButton + KB-Block — die bleiben
//    im SV-Wrapper als Custom-Slots)
//  - Kunde-`FallDetailSections` Fahrzeug/Unfall/Vorschäden-Sections

import {
  UserIcon,
  CarIcon,
  ShieldIcon,
  MailIcon,
  MapPinIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  FileTextIcon,
} from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'

export type StammdatenRolle = 'sv' | 'kunde' | 'makler'

type LeadLike = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  fin?: string | null
  hat_vorschaeden?: boolean | null
  eigene_versicherung?: string | null
  eigene_policennr?: string | null
} | null

type StammdatenReadSectionProps = {
  rolle: StammdatenRolle
  lead: LeadLike
  fall: Record<string, unknown>
  /** Slot unter der Fahrzeug-Section (z.B. SV CardentityTypBButton) */
  fahrzeugFooter?: React.ReactNode
  /** Überschrift (Default: "Stammdaten") */
  title?: string
  className?: string
}

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

export function StammdatenReadSection({
  rolle,
  lead,
  fall,
  fahrzeugFooter,
  title = 'Stammdaten',
  className = '',
}: StammdatenReadSectionProps) {
  const kundenName = lead
    ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || null
    : null

  const hersteller = str(fall.fahrzeug_hersteller)
  const modell = str(fall.fahrzeug_modell)
  const baujahr = str(fall.fahrzeug_baujahr)
  const erstzulassung = str(fall.erstzulassung)
  const fahrzeugZeile =
    [hersteller, modell, baujahr ?? erstzulassung].filter(Boolean).join(' ') || null

  const kennzeichen = str(fall.kennzeichen)
  const fin = str(fall.fin_vin) ?? str(lead?.fin)
  const fahrbereit = bool(fall.fahrzeug_fahrbereit)
  const leasing = fall.finanzierung_leasing === 'leasing'
  const leasinggeber = str(fall.leasinggeber_name)
  const finanzierung = fall.finanzierung_leasing === 'finanzierung'
  const finanzierungsgeber = str(fall.finanzierungsgeber_name)

  const schadensAdresse = str(fall.schadens_adresse)
  const schadensPlz = str(fall.schadens_plz)
  const schadensOrt = str(fall.schadens_ort)
  const schadensOrtZeile = [schadensPlz, schadensOrt].filter(Boolean).join(' ')

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
      ? `${fall.halter_vorname ?? ''} ${fall.halter_nachname ?? ''}`.trim() || null
      : null)
  const halterTelefon = str(fall.halter_telefon)
  const halterEmail = str(fall.halter_email)

  // Rollen-Filter: Kunde sieht seine eigenen Kontaktdaten nicht im
  // Stammdaten-Block doppelt (die sind oben im FallIdentityHeader).
  // Makler sieht keine Halter-Abweichung (ist interne Versicherungsinfo).
  const zeigeKunde = rolle !== 'kunde' && (kundenName || lead?.telefon || lead?.email)
  const zeigeHalter =
    rolle !== 'makler' &&
    halterAbweichend &&
    (halterName || halterTelefon || halterEmail)
  const zeigeEigeneVs = rolle !== 'makler' && (eigeneVs || eigeneVsSchadenNr)

  return (
    <section
      className={`bg-white rounded-ios-md border border-claimondo-border p-4 sm:p-5 space-y-3 ${className}`}
      aria-label={title}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
        {title}
      </h3>

      {zeigeKunde && (
        <div className="flex items-start gap-3">
          <UserIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            {kundenName && (
              <p className="text-sm font-medium text-claimondo-navy">{kundenName}</p>
            )}
            <div className="text-[11px] text-claimondo-ondo space-y-0.5 mt-0.5">
              {lead?.telefon && (
                <p>
                  <PhoneButton
                    nummer={lead.telefon}
                    variant="inline"
                    label={lead.telefon}
                    className="!text-claimondo-ondo hover:!text-claimondo-navy hover:!no-underline"
                  />
                </p>
              )}
              {lead?.email && (
                <p className="flex items-center gap-1 min-w-0">
                  <MailIcon className="w-3 h-3 shrink-0" />
                  <a
                    href={`mailto:${lead.email}`}
                    className="truncate hover:text-claimondo-navy"
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
      <div className={`flex items-start gap-3 ${zeigeKunde ? 'pt-3 border-t border-claimondo-border' : ''}`}>
        <CarIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-xs space-y-2">
          <div>
            {fahrzeugZeile && (
              <p className="text-claimondo-navy font-medium">{fahrzeugZeile}</p>
            )}
            <p className="text-claimondo-ondo mt-0.5">
              KZ: <span className="font-mono">{kennzeichen ?? '—'}</span>
              {fin && (
                <>
                  {' · '}FIN: <span className="font-mono text-[10px]">{fin}</span>
                </>
              )}
            </p>
            {(fahrbereit !== null || leasing || finanzierung) && (
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-claimondo-ondo">
                {fahrbereit === true && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2Icon className="w-3 h-3" /> fahrbereit
                  </span>
                )}
                {fahrbereit === false && (
                  <span className="inline-flex items-center gap-1 text-rose-700">
                    <XCircleIcon className="w-3 h-3" /> nicht fahrbereit
                  </span>
                )}
                {leasing && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Leasing{leasinggeber ? `: ${leasinggeber}` : ''}
                  </span>
                )}
                {finanzierung && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Finanzierung{finanzierungsgeber ? `: ${finanzierungsgeber}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          {fahrzeugFooter}
        </div>
      </div>

      {(schadensAdresse || schadensOrtZeile) && (
        <div className="flex items-start gap-3 pt-3 border-t border-claimondo-border">
          <MapPinIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-claimondo-ondo">Schadensort</p>
            {schadensAdresse && <p className="text-claimondo-navy">{schadensAdresse}</p>}
            {schadensOrtZeile && <p className="text-claimondo-ondo">{schadensOrtZeile}</p>}
          </div>
        </div>
      )}

      {zeigeEigeneVs && (
        <div className="flex items-start gap-3 pt-3 border-t border-claimondo-border">
          <FileTextIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-claimondo-ondo">Eigene Versicherung</p>
            {eigeneVs && <p className="text-claimondo-navy">{eigeneVs}</p>}
            {eigeneVsSchadenNr && (
              <p className="text-claimondo-ondo">
                Schaden-Nr: <span className="font-mono">{eigeneVsSchadenNr}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {gegnerBekannt !== false &&
        (gegnerName || gegnerKz || gegnerFahrzeugtyp || gegnerVs || gegnerVsNr) && (
          <div className="flex items-start gap-3 pt-3 border-t border-claimondo-border">
            <ShieldIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 text-xs space-y-0.5">
              <p className="text-claimondo-ondo">Gegner</p>
              {gegnerName && (
                <p className="text-claimondo-navy font-medium">{gegnerName}</p>
              )}
              {gegnerKz && (
                <p className="text-claimondo-ondo">
                  KZ: <span className="font-mono">{gegnerKz}</span>
                  {gegnerFahrzeugtyp ? ` · ${gegnerFahrzeugtyp}` : ''}
                </p>
              )}
              {(gegnerVs || gegnerVsNr) && (
                <p className="text-claimondo-ondo truncate">
                  {gegnerVs && <>VS: {gegnerVs}</>}
                  {gegnerVs && gegnerVsNr && ' · '}
                  {gegnerVsNr && (
                    <>
                      VS-Nr: <span className="font-mono">{gegnerVsNr}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

      {gegnerBekannt === false && (
        <div className="flex items-start gap-3 pt-3 border-t border-claimondo-border">
          <AlertCircleIcon className="w-4 h-4 text-claimondo-ondo/70 mt-0.5 shrink-0" />
          <p className="text-xs text-claimondo-ondo">Gegner nicht bekannt</p>
        </div>
      )}

      {zeigeHalter && (
        <div className="flex items-start gap-3 pt-3 border-t border-claimondo-border">
          <UserIcon className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="text-claimondo-ondo">Halter (abweichend vom Fahrer)</p>
            {halterName && (
              <p className="text-claimondo-navy font-medium">{halterName}</p>
            )}
            <div className="text-[11px] text-claimondo-ondo mt-0.5 space-y-0.5">
              {halterTelefon && (
                <PhoneButton
                  nummer={halterTelefon}
                  variant="inline"
                  label={halterTelefon}
                  className="!text-claimondo-ondo hover:!text-claimondo-navy hover:!no-underline"
                />
              )}
              {halterEmail && (
                <a
                  href={`mailto:${halterEmail}`}
                  className="flex items-center gap-1 hover:text-claimondo-navy min-w-0"
                >
                  <MailIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{halterEmail}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
