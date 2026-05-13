import { AlertTriangle, ShieldOff, FileWarning } from 'lucide-react'

// Versicherer-Taktiken-Section für Hauptseite + Conversion-Pages.
// Wissensdatenbank §2 (Prüfberichte) + §15 (Schadensteuerungs-Taktiken).
// GEO-Pattern „Statistics Addition" + „Authoritative Tone" mit ControlExpert /
// K-Expert / DEKRA-Nennung + Versicherer-spezifischen Mustern (HUK, LVM, AXA).

type Taktik = {
  trigger: string
  versicherer: string
  pruefdienstleister: string
  kuerzung: string
  gegenargument: string
  bgh: string
}

const TAKTIKEN: Taktik[] = [
  {
    trigger: '„Wir kümmern uns um alles"',
    versicherer: 'HUK · LVM · Allianz',
    pruefdienstleister: 'ControlExpert',
    kuerzung: 'Schadensteuerung in Partnerwerkstatt → keine Wertminderung, kein eigener Gutachter',
    gegenargument: 'Sie haben Anspruch auf eigene Werkstatt + unabhängigen Gutachter.',
    bgh: '§249 BGB',
  },
  {
    trigger: '„Ein Gutachter ist nicht nötig"',
    versicherer: 'HUK · AXA',
    pruefdienstleister: 'ControlExpert · K-Expert',
    kuerzung: 'Kostenvoranschlag statt Gutachten → Wertminderung verschwindet, 30–40 % weniger Anspruch',
    gegenargument: 'Nur ein Gutachter berechnet Wertminderung. Bei Schaden > 750 € ist er kostenfrei.',
    bgh: 'BGH VI ZR 357/03',
  },
  {
    trigger: 'Kürzung über Prüfbericht',
    versicherer: 'alle großen',
    pruefdienstleister: 'ControlExpert · K-Expert · DEKRA',
    kuerzung: 'UPE-Aufschläge, Verbringung, Beilackierung, Stundenverrechnungssätze gekürzt — ohne Besichtigung',
    gegenargument: 'BGH-fest: UPE + Beilackierung sind erstattungsfähig. Anwalt schreibt zurück.',
    bgh: 'BGH VI ZR 65/18 · VI ZR 174/24',
  },
  {
    trigger: '„Restwert anderer Anbieter höher"',
    versicherer: 'alle großen',
    pruefdienstleister: 'überregionale Internet-Restwertbörse',
    kuerzung: 'Restwert künstlich hoch → Auszahlung gedrückt um bis zu 3.000 €',
    gegenargument: 'Restwert = regionaler Markt. Sie müssen das Versicherer-Angebot nicht annehmen.',
    bgh: 'BGH VI ZR 119/04',
  },
  {
    trigger: '„Werkstatt rechnet zu hoch"',
    versicherer: 'HUK · LVM',
    pruefdienstleister: 'ControlExpert',
    kuerzung: 'Nicht erstattete Werkstatt-Mehrkosten beim Geschädigten lassen',
    gegenargument: 'Werkstattrisiko trägt die Versicherung — nicht Sie.',
    bgh: 'BGH VI ZR 38/22 ff. (2024)',
  },
  {
    trigger: '„Gutachten ist unbrauchbar"',
    versicherer: 'HUK · LVM',
    pruefdienstleister: 'eigene Schadenabteilung',
    kuerzung: 'Komplette Verweigerung der SV-Kosten + Wiederbeschaffungswert',
    gegenargument: 'SV-Risiko trägt die Versicherung. Anwalt klagt vor dem zuständigen Landgericht.',
    bgh: 'BGH VI ZR 280/22',
  },
]

export function VersichererTaktikenSection() {
  return (
    <section
      className="relative bg-claimondo-navy py-20 text-white sm:py-24"
      aria-labelledby="versicherer-taktiken-heading"
    >
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(123,163,204,.12) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue backdrop-blur-md">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Was Versicherer wirklich tun
          </div>
          <h2
            id="versicherer-taktiken-heading"
            className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl"
          >
            Versicherer-Taktiken — und wie wir sie kontern
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            Versicherer leiten Schäden an Prüfdienstleister wie{' '}
            <strong className="text-white">ControlExpert</strong>,{' '}
            <strong className="text-white">K-Expert</strong> und{' '}
            <strong className="text-white">DEKRA</strong> weiter — die rechnen
            ohne Fahrzeugbesichtigung künstlich klein. Im Schnitt verlieren
            Geschädigte so <strong className="text-white">33 % ihres Anspruchs</strong>.
            Mit Claimondo behalten Sie ihn.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto rounded-ios-md border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-white/[0.03]">
              <tr className="text-xs uppercase tracking-wider text-claimondo-light-blue">
                <th scope="col" className="px-5 py-4 font-semibold">
                  Trigger / Aussage
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Wer / Prüfdienst
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Kürzungs-Mechanik
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Gegenargument
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {TAKTIKEN.map((t) => (
                <tr key={t.trigger} className="align-top">
                  <td className="px-5 py-4">
                    <div className="font-bold text-white">{t.trigger}</div>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-claimondo-light-blue">
                      <ShieldOff className="h-3 w-3" aria-hidden />
                      {t.bgh}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-white/80">
                    <div className="font-semibold">{t.versicherer}</div>
                    <div className="mt-0.5 flex items-start gap-1.5 text-xs text-white/60">
                      <FileWarning className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                      {t.pruefdienstleister}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-white/80 leading-relaxed">
                    {t.kuerzung}
                  </td>
                  <td className="px-5 py-4 text-white leading-relaxed">
                    {t.gegenargument}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-center text-xs text-white/60">
          Quellen: NDR-Reportage Prüfdienstleister, Wissensdatenbank Erstberatung Mai 2026, juris.bundesgerichtshof.de
        </p>
      </div>
    </section>
  )
}
