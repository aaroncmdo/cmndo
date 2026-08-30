// Kunde-Card fuer Mietwagen ODER Nutzungsausfall (XOR — die VS zahlt
// grundsaetzlich nur eines von beiden).
//
// Schadenstyp-abhaengige Berechnung:
//   • Reparatur:    Nutzungsausfall × Reparaturdauer (nutzungsausfall_tage)
//   • Totalschaden: Nutzungsausfall × Wiederbeschaffungsdauer
//                   (wiederbeschaffungsdauer_tage, gutachterlich, meist 10-16)
//
// Mietwagen-Pfad (mietwagen_hat=true):
//   • Abgabe-Datum = mietwagen_seit_datum + Limit-Tage
//     Limit = mietwagen_limit_tage falls gesetzt, sonst aus Gutachten
//     (bei Totalschaden WBD, sonst nutzungsausfall_tage).
//
// Voraussetzungen-Hinweis je nach Pfad:
//   • Reparatur:    fahruntuechtig, kein Zweitwagen, Reparatur durchgefuehrt,
//                   Nachweis durch Werkstattrechnung
//   • Totalschaden: Beleg Ersatzkauf oder Abmeldung
//
// Render-Bedingung: nur wenn Gutachten OCR-verarbeitet + Schadenstyp klar.

import {
  CarIcon,
  CalendarIcon,
  EuroIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  InfoIcon,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'

type Props = {
  /** TRUE wenn Totalschaden, FALSE bei Reparatur, NULL wenn Gutachten unklar. */
  totalschaden: boolean | null
  ocrVerarbeitet: boolean
  // Mietwagen
  mietwagenHat: boolean
  mietwagenSeitDatum: string | null
  mietwagenVermieter: string | null
  mietwagenLimitTage: number | null
  mietwagenRechnungVorhanden: boolean
  // Nutzungsausfall (aus Gutachten OCR)
  nutzungsausfallTage: number | null // Reparatur-Pfad
  wiederbeschaffungsdauerTage: number | null // Totalschaden-Pfad
  nutzungsausfallTagessatzEur: number | null
  /** Falls Kunde sich noch zwischen Mietwagen und Nutzungsausfall entscheidet —
   *  zeigen wir auch den Mietwagen-Tagessatz fuer den Vergleich (info-only). */
  mietwagenTagessatzEur: number | null
  /** Optionale Klasse für den äußeren section-Wrapper — z.B. für blaue LexDrive-Variante. */
  className?: string
  /** 'lexdrive': Schrift, Icons und Betrag in LexDrive-Blau einfärben. */
  variant?: 'lexdrive'
}

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })
}

function formatEuro(n: number | null): string {
  if (n == null) return '–'
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function addTage(isoDate: string, tage: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + tage)
  return d.toISOString().slice(0, 10)
}

export default async function KundeAusfallEntschaedigungCard({
  totalschaden,
  ocrVerarbeitet,
  mietwagenHat,
  mietwagenSeitDatum,
  mietwagenVermieter,
  mietwagenLimitTage,
  mietwagenRechnungVorhanden,
  nutzungsausfallTage,
  wiederbeschaffungsdauerTage,
  nutzungsausfallTagessatzEur,
  mietwagenTagessatzEur,
  className,
  variant,
}: Props) {
  // Portal-i18n: Server-Component → getTranslations (Namespace ausfallEntschaedigung).
  const t = await getTranslations('ausfallEntschaedigung')
  // Nutzungsausfall-Heading (in zwei Branches identisch).
  const nutzungsausfallHeading = totalschaden
    ? t('nutzungsausfallTotalschadenTitel')
    : t('nutzungsausfallTitel')
  const isLexDrive = variant === 'lexdrive'
  const headingCls = isLexDrive ? 'text-claimondo-navy' : 'text-claimondo-navy'
  const iconCls = isLexDrive ? 'text-[#0e5be9]' : 'text-claimondo-shield'
  const amountCls = isLexDrive ? 'text-[#0e5be9]' : 'text-claimondo-navy'
  const labelCls = isLexDrive ? 'text-[#0e5be9]/70' : 'text-claimondo-ondo'
  // Render-Gate: ohne OCR keine Werte, ohne Schadenstyp keine Berechnung.
  if (!ocrVerarbeitet || totalschaden == null) return null

  // Effektive Tage je Schadenstyp
  const effDauerTage = totalschaden ? wiederbeschaffungsdauerTage : nutzungsausfallTage

  // Mietwagen-Pfad
  if (mietwagenHat) {
    // Limit-Bestimmung: explizit gesetztes Limit > Gutachten-Dauer > undefined
    const limit = mietwagenLimitTage ?? effDauerTage ?? null
    const abgabeDatum =
      mietwagenSeitDatum && limit != null ? addTage(mietwagenSeitDatum, limit) : null
    const heute = new Date()
    const abgabeDate = abgabeDatum ? new Date(abgabeDatum) : null
    const tageBisAbgabe = abgabeDate
      ? Math.ceil((abgabeDate.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000))
      : null
    const istUeberfaellig = tageBisAbgabe != null && tageBisAbgabe < 0

    return (
      <section
        className={`rounded-2xl border p-5 space-y-3 ${
          istUeberfaellig
            ? 'bg-danger-soft border-danger/30'
            : className ?? 'bg-white border-claimondo-border'
        }`}
      >
        <header className="flex items-center gap-2">
          <CarIcon
            className={`w-4 h-4 ${istUeberfaellig ? 'text-danger-strong' : 'text-claimondo-shield'}`}
          />
          <h3 className="text-sm font-semibold text-claimondo-navy">{t('mietwagenTitel')}</h3>
        </header>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Row icon={CalendarIcon} label={t('mietbeginn')} value={formatDate(mietwagenSeitDatum)} />
          {mietwagenVermieter && (
            <Row icon={InfoIcon} label={t('anbieter')} value={mietwagenVermieter} />
          )}
          {abgabeDatum && (
            <Row
              icon={CalendarIcon}
              label={t('abgabeSpaetestens')}
              value={formatDate(abgabeDatum)}
              accent={istUeberfaellig ? 'danger' : tageBisAbgabe != null && tageBisAbgabe <= 3 ? 'warning' : null}
            />
          )}
          {limit != null && (
            <Row
              icon={InfoIcon}
              label={t('limit')}
              value={
                totalschaden
                  ? t('limitWertWbd', { tage: limit })
                  : t('limitWertReparatur', { tage: limit })
              }
            />
          )}
        </dl>

        {istUeberfaellig && (
          <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-lg p-2 flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {t('ueberfaellig', { datum: formatDate(abgabeDatum) })}
            </span>
          </p>
        )}

        <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border p-3 text-xs text-claimondo-ondo space-y-1.5">
          <p className="font-medium text-claimondo-navy">{t('nachRueckgabe')}</p>
          <p>
            {t('nachRueckgabeText')}
          </p>
          {mietwagenRechnungVorhanden && (
            <p className="text-success-strong flex items-center gap-1.5">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              {t('rechnungLiegtVor')}
            </p>
          )}
        </div>

        <p className="text-[11px] text-claimondo-ondo/70 flex items-start gap-1.5">
          <InfoIcon className="w-3 h-3 shrink-0 mt-0.5" />
          {t('xorHinweis')}
        </p>
      </section>
    )
  }

  // Nutzungsausfall-Pfad
  const tagessatz = nutzungsausfallTagessatzEur
  if (!effDauerTage || !tagessatz) {
    // Werte fehlen — wir zeigen einen Hinweis statt einer Pseudo-Zahl.
    //
    // Frontend-Audit 30.08.2026 (prod): Hier stand pauschal „Tagessatz ODER Dauer
    // konnten wir nicht auslesen", obwohl im gemessenen Fall die Dauer sehr wohl
    // vorlag (6 Tage) und nur der Tagessatz fehlte. Der Text war unschaerfer als
    // die Datenlage und liess den Kunden glauben, es sei gar nichts bekannt.
    // Jetzt: die bekannte Zahl nennen, nur das wirklich Fehlende offenlassen.
    return (
      <section className="rounded-2xl border border-dashed border-claimondo-border bg-claimondo-bg p-5 space-y-2 text-xs text-claimondo-ondo">
        <header className="flex items-center gap-2">
          <EuroIcon className="w-4 h-4 text-claimondo-shield" />
          <h3 className="text-sm font-semibold text-claimondo-navy">
            {nutzungsausfallHeading}
          </h3>
        </header>
        {/* PRODUCT.md Prinzip 4: der Begriff wird erklaert, wo er auftaucht. */}
        <p className="text-claimondo-ondo/80">{t('wasIstNutzungsausfall')}</p>
        <p>
          {effDauerTage && !tagessatz
            ? t('werteFehlenNurSatz', { tage: effDauerTage })
            : t('werteFehlen')}
        </p>
      </section>
    )
  }

  const summe = effDauerTage * tagessatz

  return (
    <section className={`rounded-2xl border p-5 space-y-3 ${className ?? 'border-claimondo-border bg-white'}`}>
      <header className="flex items-center gap-2">
        <EuroIcon className={`w-4 h-4 ${iconCls}`} />
        <h3 className={`text-sm font-semibold ${headingCls}`}>
          {nutzungsausfallHeading}
        </h3>
      </header>

      <p className={`text-2xl font-bold ${amountCls}`}>{formatEuro(summe)}</p>
      <p className={`text-xs ${labelCls}`}>
        {totalschaden
          ? t('berechnungWbd', { tage: effDauerTage, satz: formatEuro(tagessatz) })
          : t('berechnungReparatur', { tage: effDauerTage, satz: formatEuro(tagessatz) })}
      </p>

      <div className="rounded-ios-lg bg-claimondo-bg border border-claimondo-border p-3 text-xs text-claimondo-ondo space-y-1.5">
        <p className="font-medium text-claimondo-navy">{t('voraussetzungen')}</p>
        {totalschaden ? (
          <ul className="space-y-1 list-disc list-inside">
            <li>{t('vorTotalBeleg')}</li>
            <li>{t('vorTotalKeinMietwagen')}</li>
            <li>{t('vorTotalKeinZweitwagen')}</li>
          </ul>
        ) : (
          <ul className="space-y-1 list-disc list-inside">
            <li>{t('vorRepFahruntuechtig')}</li>
            <li>{t('vorRepReparatur')}</li>
            <li>{t('vorRepNutzungswille')}</li>
            <li>{t('vorRepKeinZweitwagen')}</li>
          </ul>
        )}
      </div>

      {mietwagenTagessatzEur && (
        <p className="text-[11px] text-claimondo-ondo/80 flex items-start gap-1.5">
          <InfoIcon className="w-3 h-3 shrink-0 mt-0.5" />
          {t.rich('alternativMietwagen', {
            satz: formatEuro(mietwagenTagessatzEur),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      )}
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof CarIcon
  label: string
  value: string
  accent?: 'danger' | 'warning' | null
}) {
  const valueColor =
    accent === 'danger'
      ? 'text-danger-strong'
      : accent === 'warning'
        ? 'text-warning-strong'
        : 'text-claimondo-navy'
  return (
    <div className="flex items-start gap-2 sm:contents">
      <div className="flex items-center gap-1.5 sm:contents">
        <Icon className="w-3.5 h-3.5 text-claimondo-ondo shrink-0 sm:hidden" />
        <dt className="text-claimondo-ondo/80">{label}</dt>
      </div>
      <dd className={`font-medium ${valueColor}`}>{value}</dd>
    </div>
  )
}
