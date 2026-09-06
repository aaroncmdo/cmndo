'use client'

// AAR-956 §3a: Geteilte Quali-Optionen (Schuldfrage-Buttons). Präsentational +
// aktionsfrei — von /anfrage (SelbstQualiClient) UND /flow (incomplete-Pfad)
// genutzt, damit der Schuldfrage-Step nicht doppelt gepflegt wird (Phase C
// deprecatet /anfrage). Auswahl-Logik + Persistenz liegt beim Consumer.

import { useTranslations } from 'next-intl'

// Die `value`-Codes sind der Server-/State-Vertrag (onWaehle -> speichereQuali*),
// bleiben deutsch/unveraendert. Anzeige-Label + Hint werden via i18n (selfService.
// quali.optionen.<value>) lokalisiert.
// Vierte Antwort (Aaron 05.09.2026): Teilkasko-Ereignisse haben keinen Unfallgegner — Hagel, Marder,
// Glas, Wild, Diebstahl, Sturm. Sie sind trotzdem an den Kasko-Zweig gebunden (die Wissensbasis sagt bei
// nahezu jeder Kondition "Vollkasko UND Teilkasko inkl. Glas"). Wer sich vorher zwischen "Ich selbst" und
// "Noch unklar" entscheiden musste, landete bei "unklar" in einem Szenario OHNE Tariffrage — und bekam
// eine Werkstatt vermittelt, die ihn bei gebundenem Tarif die Kuerzung kostet.
//
// Anzeige-Id != Server-Wert: 'kein_gegner' schreibt 'eigenverantwortung'. Fachlich dasselbe (kein
// Haftpflichtanspruch gegen einen Dritten), und der schuldfrage-CHECK sowie die 38 Downstream-Stellen
// bleiben unberuehrt. Die Unterscheidung traegt die Schadenart (leads.schadentyp, Migration 20260905185823).
const QUALI_VALUES = ['gegner', 'unklar', 'eigenverantwortung', 'kein_gegner'] as const

const SERVER_WERT: Record<(typeof QUALI_VALUES)[number], string> = {
  gegner: 'gegner',
  unklar: 'unklar',
  eigenverantwortung: 'eigenverantwortung',
  kein_gegner: 'eigenverantwortung',
}

export function QualiOptionen({
  vorname,
  disabled,
  onWaehle,
}: {
  vorname: string | null
  disabled: boolean
  onWaehle: (value: string) => void
}) {
  const t = useTranslations('selfService')
  return (
    <div className="max-w-md w-full">
      {vorname && (
        <p className="text-claimondo-navy/60 text-sm mb-1 text-center">{t('quali.gruss', { vorname })}</p>
      )}
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
        {t('quali.frage')}
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        {t('quali.hinweis')}
      </p>
      <div className="flex flex-col gap-3">
        {QUALI_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`quali-schuldfrage-${value}`}
            disabled={disabled}
            onClick={() => onWaehle(SERVER_WERT[value])}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo disabled:opacity-50"
          >
            <span className="block font-semibold text-claimondo-navy">{t(`quali.optionen.${value}.label`)}</span>
            <span className="block text-sm text-claimondo-navy/60">{t(`quali.optionen.${value}.hint`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
