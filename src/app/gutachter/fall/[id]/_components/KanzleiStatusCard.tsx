'use client'

// AAR-403: Honorar-Transparenz für den SV ab Phase 5. Zeigt dem Sachverständigen
// den kompletten Kanzlei-Verlauf, die Regulierung (Gutachten-Forderung vs
// tatsächliche VS-Zahlung inkl. Kürzungs-Delta), die einzelnen Kürzungs-Gründe
// aus forderungspositionen sowie das eigene Honorar (Bemessung, Leadpreis,
// Netto, Auszahlungs-Status).
//
// Schema-Anker (verifiziert via information_schema):
// - faelle.kanzlei_uebergeben_am / anschlussschreiben_sendedatum /
//   vs_reaktion_am / zahlung_eingegangen_am / zahlung_betrag /
//   kuerzungs_betrag / gutachten_betrag / vs_kuerzung_grund
// - forderungspositionen: fall_id, typ, bezeichnung, betrag_gefordert,
//   betrag_reguliert, betrag_gekuerzt
// - gutachter_abrechnungen: leadpreis, preistyp, abgerechnet_am
//
// Kürzungen werden vorzugsweise strukturiert aus forderungspositionen
// gerendert; wenn diese leer sind, fallen wir auf den Gesamtbetrag
// (faelle.kuerzungs_betrag) + freitext vs_kuerzung_grund zurück.

import { useState } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  ArrowDownRightIcon,
  FileTextIcon,
  BuildingIcon,
  MailIcon,
  CoinsIcon,
} from 'lucide-react'
import { formatEuro, berechneSvNetto, tageSeit } from '@/lib/gutachter/abrechnung'
import type { SvAbrechnungInput } from '@/lib/gutachter/abrechnung'
import type { SvSubphase } from '@/lib/gutachter/subphase'
import { formatDatum } from '@/lib/format'

export type KuerzungsPosition = {
  id: string
  typ: string | null
  bezeichnung: string | null
  betrag_gefordert: number | null
  betrag_reguliert: number | null
  betrag_gekuerzt: number | null
}

export type KanzleiStatusInput = {
  kanzlei_uebergeben_am: string | null
  anschlussschreiben_sendedatum: string | null
  vs_reaktion_am: string | null
  vs_kuerzung_grund: string | null
  zahlung_eingegangen_am: string | null
  zahlung_betrag: number | null
  kuerzungs_betrag: number | null
  gutachten_betrag: number | null
}

type Props = {
  subphase: SvSubphase
  fall: KanzleiStatusInput
  abrechnung: SvAbrechnungInput | null
  kuerzungen: KuerzungsPosition[]
}

// AAR-411: delegiert an die zentrale Formatter-Bibliothek.
function fmtDate(iso: string | null): string | null {
  return formatDatum(iso) || null
}

function kuerzungsTon(kuerzungProz: number): 'green' | 'amber' | 'red' {
  if (kuerzungProz <= 0) return 'green'
  if (kuerzungProz < 10) return 'amber'
  return 'red'
}

export function KanzleiStatusCard({
  subphase,
  fall,
  abrechnung,
  kuerzungen,
}: Props) {
  const [offen, setOffen] = useState(true)

  if (subphase.phase < 5) return null

  const uebergebenLabel = fmtDate(fall.kanzlei_uebergeben_am)
  const vsAnschreibenLabel = fmtDate(fall.anschlussschreiben_sendedatum)
  const vsReaktionLabel = fmtDate(fall.vs_reaktion_am)
  const zahlungLabel = fmtDate(fall.zahlung_eingegangen_am)

  const bearbeitungSeitTage = tageSeit(fall.kanzlei_uebergeben_am)

  // Strukturierte Kürzungen bevorzugen, Fallback auf Summe + Freitext
  const strukturierteKuerzungen = kuerzungen.filter(
    (k) => (k.betrag_gekuerzt ?? 0) > 0,
  )
  const kuerzungsSumme =
    strukturierteKuerzungen.length > 0
      ? strukturierteKuerzungen.reduce((s, k) => s + (k.betrag_gekuerzt ?? 0), 0)
      : (fall.kuerzungs_betrag ?? 0)

  const gesamtForderung =
    strukturierteKuerzungen.length > 0
      ? strukturierteKuerzungen.reduce(
          (s, k) => s + (k.betrag_gefordert ?? 0),
          0,
        )
      : (fall.gutachten_betrag ?? 0)

  const kuerzungProz =
    gesamtForderung > 0 ? (kuerzungsSumme / gesamtForderung) * 100 : 0
  const ton = kuerzungsTon(kuerzungProz)

  const svNetto = berechneSvNetto(abrechnung)
  const honorarUeberwiesen = Boolean(abrechnung?.abgerechnetAm)

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border p-4 sm:p-5 space-y-4">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Kanzlei-Verlauf & Honorar
        </h3>
        {offen ? (
          <ChevronDownIcon className="w-4 h-4 text-claimondo-ondo/70" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-claimondo-ondo/70" />
        )}
      </button>

      {offen && (
        <div className="space-y-4">
          {/* Sektion 1: Kanzlei-Verlauf */}
          <ul className="space-y-2 text-sm">
            {uebergebenLabel && (
              <li className="flex items-start gap-2">
                <BuildingIcon className="w-4 h-4 text-[var(--brand-secondary)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-claimondo-navy">
                    An Kanzlei übergeben:{' '}
                    <span className="font-medium">{uebergebenLabel}</span>
                  </p>
                  {bearbeitungSeitTage !== null &&
                    !fall.zahlung_eingegangen_am && (
                      <p className="text-[11px] text-claimondo-ondo">
                        seit {bearbeitungSeitTage}{' '}
                        {bearbeitungSeitTage === 1 ? 'Tag' : 'Tagen'}
                      </p>
                    )}
                </div>
              </li>
            )}
            {vsAnschreibenLabel && (
              <li className="flex items-start gap-2">
                <MailIcon className="w-4 h-4 text-[var(--brand-secondary)] mt-0.5 shrink-0" />
                <p className="text-claimondo-navy">
                  An Versicherung:{' '}
                  <span className="font-medium">{vsAnschreibenLabel}</span>
                </p>
              </li>
            )}
            {vsReaktionLabel && (
              <li className="flex items-start gap-2">
                <ArrowDownRightIcon className="w-4 h-4 text-[var(--brand-secondary)] mt-0.5 shrink-0" />
                <p className="text-claimondo-navy">
                  VS-Reaktion:{' '}
                  <span className="font-medium">{vsReaktionLabel}</span>
                </p>
              </li>
            )}
            {zahlungLabel && (
              <li className="flex items-start gap-2">
                <CoinsIcon className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-claimondo-navy">
                  Zahlungseingang:{' '}
                  <span className="font-medium">{zahlungLabel}</span>
                </p>
              </li>
            )}
          </ul>

          {/* Sektion 2: Regulierung (Geld-Fluss) */}
          {(fall.gutachten_betrag != null || fall.zahlung_betrag != null) && (
            <div className="pt-3 border-t border-claimondo-border space-y-1.5 text-sm tabular-nums">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
                Regulierung
              </p>
              <div className="flex items-center justify-between text-claimondo-navy">
                <span>Gutachten-Forderung</span>
                <span>{formatEuro(fall.gutachten_betrag)}</span>
              </div>
              {fall.zahlung_betrag != null && (
                <div className="flex items-center justify-between text-claimondo-navy font-medium">
                  <span>Zahlung Versicherung</span>
                  <span>{formatEuro(fall.zahlung_betrag)}</span>
                </div>
              )}
              {kuerzungsSumme > 0 && (
                <div
                  className={`flex items-center justify-between pt-1.5 border-t border-claimondo-border font-medium ${
                    ton === 'red'
                      ? 'text-red-700'
                      : ton === 'amber'
                        ? 'text-amber-700'
                        : 'text-claimondo-navy'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangleIcon className="w-3.5 h-3.5" />
                    Kürzung
                    {gesamtForderung > 0 && (
                      <span className="text-[11px] font-normal">
                        ({kuerzungProz.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  <span>− {formatEuro(kuerzungsSumme)}</span>
                </div>
              )}
              {kuerzungsSumme === 0 && fall.zahlung_betrag != null && (
                <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 pt-1">
                  <CheckCircle2Icon className="w-3.5 h-3.5" />
                  Ohne Kürzung reguliert
                </p>
              )}
            </div>
          )}

          {/* Sektion 3: Kürzungsgründe */}
          {strukturierteKuerzungen.length > 0 && (
            <div className="pt-3 border-t border-claimondo-border space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                Kürzungsgründe
              </p>
              <ul className="space-y-2">
                {strukturierteKuerzungen.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-ios-lg border border-amber-200 bg-amber-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-amber-900">
                      <span>{k.bezeichnung || k.typ || 'Position'}</span>
                      <span className="tabular-nums">
                        − {formatEuro(k.betrag_gekuerzt ?? 0)}
                      </span>
                    </div>
                    {k.betrag_gefordert != null &&
                      k.betrag_reguliert != null && (
                        <p className="text-[11px] text-amber-800 mt-0.5 tabular-nums">
                          Gefordert {formatEuro(k.betrag_gefordert)} · Reguliert{' '}
                          {formatEuro(k.betrag_reguliert)}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fallback: nur Gesamtbetrag + Freitext-Grund */}
          {strukturierteKuerzungen.length === 0 &&
            (fall.kuerzungs_betrag ?? 0) > 0 &&
            fall.vs_kuerzung_grund && (
              <div className="pt-3 border-t border-claimondo-border space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                  Kürzungsgrund
                </p>
                <div className="rounded-ios-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-900">
                    {fall.vs_kuerzung_grund}
                  </p>
                </div>
              </div>
            )}

          {/* Sektion 4: SV-Honorar */}
          {abrechnung && (
            <div className="pt-3 border-t border-claimondo-border space-y-1.5 text-sm tabular-nums">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-2">
                Dein Honorar
              </p>
              {abrechnung.honorar != null && (
                <div className="flex items-center justify-between text-claimondo-navy">
                  <span>Honorar (brutto)</span>
                  <span>{formatEuro(abrechnung.honorar)}</span>
                </div>
              )}
              {abrechnung.leadpreis != null && (
                <div className="flex items-center justify-between text-claimondo-navy">
                  <span>
                    Leadpreis
                    {abrechnung.preistyp && (
                      <span className="text-[11px] text-claimondo-ondo/70 ml-1">
                        ({abrechnung.preistyp})
                      </span>
                    )}
                  </span>
                  <span>− {formatEuro(abrechnung.leadpreis)}</span>
                </div>
              )}
              {svNetto != null && (
                <div className="flex items-center justify-between pt-1.5 border-t border-claimondo-border font-semibold text-[var(--brand-primary)]">
                  <span>Netto-Auszahlung</span>
                  <span>{formatEuro(svNetto)}</span>
                </div>
              )}
              <div className="pt-1.5">
                {honorarUeberwiesen ? (
                  <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                    <CheckCircle2Icon className="w-3.5 h-3.5" />
                    Überwiesen am {fmtDate(abrechnung.abgerechnetAm!)}
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                    <FileTextIcon className="w-3.5 h-3.5" />
                    Auszahlung ausstehend
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
