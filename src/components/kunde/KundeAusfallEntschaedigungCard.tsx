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
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
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

export default function KundeAusfallEntschaedigungCard({
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
  const isLexDrive = variant === 'lexdrive'
  const headingCls = isLexDrive ? 'text-[#0a3fa0]' : 'text-claimondo-navy'
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
            ? 'bg-rose-50 border-rose-300'
            : className ?? 'bg-white border-claimondo-border'
        }`}
      >
        <header className="flex items-center gap-2">
          <CarIcon
            className={`w-4 h-4 ${istUeberfaellig ? 'text-rose-700' : 'text-claimondo-shield'}`}
          />
          <h3 className="text-sm font-semibold text-claimondo-navy">Dein Mietwagen</h3>
        </header>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Row icon={CalendarIcon} label="Mietbeginn" value={formatDate(mietwagenSeitDatum)} />
          {mietwagenVermieter && (
            <Row icon={InfoIcon} label="Anbieter" value={mietwagenVermieter} />
          )}
          {abgabeDatum && (
            <Row
              icon={CalendarIcon}
              label="Abgabe spätestens"
              value={formatDate(abgabeDatum)}
              accent={istUeberfaellig ? 'rose' : tageBisAbgabe != null && tageBisAbgabe <= 3 ? 'amber' : null}
            />
          )}
          {limit != null && (
            <Row
              icon={InfoIcon}
              label="Limit"
              value={`${limit} Tage${
                totalschaden ? ' (Wiederbeschaffungsdauer)' : ' (Reparaturdauer)'
              }`}
            />
          )}
        </dl>

        {istUeberfaellig && (
          <p className="text-xs text-rose-800 bg-rose-100 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Der Mietwagen hätte spätestens am {formatDate(abgabeDatum)} abgegeben werden müssen.
              Jeder zusätzliche Tag wird im Zweifel nicht von der Versicherung erstattet.
            </span>
          </p>
        )}

        <div className="rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3 text-xs text-claimondo-ondo space-y-1.5">
          <p className="font-medium text-claimondo-navy">Nach Rückgabe</p>
          <p>
            Bitte lade die Mietwagen-Rechnung in der Fallakte hoch. Wir leiten sie für dich an die
            gegnerische Versicherung weiter.
          </p>
          {mietwagenRechnungVorhanden && (
            <p className="text-emerald-700 flex items-center gap-1.5">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Rechnung liegt bereits vor.
            </p>
          )}
        </div>

        <p className="text-[11px] text-claimondo-ondo/70 flex items-start gap-1.5">
          <InfoIcon className="w-3 h-3 shrink-0 mt-0.5" />
          Mietwagen und Nutzungsausfall schließen sich gegenseitig aus — die Versicherung zahlt nur
          das Tatsächliche (Mietwagen-Rechnung).
        </p>
      </section>
    )
  }

  // Nutzungsausfall-Pfad
  const tagessatz = nutzungsausfallTagessatzEur
  if (!effDauerTage || !tagessatz) {
    // Werte fehlen — wir zeigen einen Hinweis statt einer Pseudo-Zahl.
    return (
      <section className="rounded-2xl border border-dashed border-claimondo-border bg-[#f8f9fb] p-5 space-y-2 text-xs text-claimondo-ondo">
        <header className="flex items-center gap-2">
          <EuroIcon className="w-4 h-4 text-claimondo-shield" />
          <h3 className="text-sm font-semibold text-claimondo-navy">
            {totalschaden ? 'Nutzungsausfall (Totalschaden)' : 'Nutzungsausfall'}
          </h3>
        </header>
        <p>
          Tagessatz oder Dauer aus deinem Gutachten konnten wir noch nicht eindeutig auslesen. Dein
          Kundenbetreuer prüft das und meldet sich.
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
          {totalschaden ? 'Nutzungsausfall (Totalschaden)' : 'Nutzungsausfall'}
        </h3>
      </header>

      <p className={`text-2xl font-bold ${amountCls}`}>{formatEuro(summe)}</p>
      <p className={`text-xs ${labelCls}`}>
        {effDauerTage} {totalschaden ? 'Tage Wiederbeschaffungsdauer' : 'Tage Reparaturdauer'} ×{' '}
        {formatEuro(tagessatz)} pro Tag
      </p>

      <div className="rounded-lg bg-[#f8f9fb] border border-claimondo-border p-3 text-xs text-claimondo-ondo space-y-1.5">
        <p className="font-medium text-claimondo-navy">Voraussetzungen</p>
        {totalschaden ? (
          <ul className="space-y-1 list-disc list-inside">
            <li>Beleg Ersatz-Fahrzeug-Kauf oder Abmeldung des alten Wagens (für die Versicherung)</li>
            <li>Du nutzt während dieser Zeit kein Mietwagen-Ersatzauto</li>
            <li>Du hast keinen zumutbaren Zweitwagen verfügbar</li>
          </ul>
        ) : (
          <ul className="space-y-1 list-disc list-inside">
            <li>Auto unfallbedingt fahruntüchtig oder nicht verkehrssicher</li>
            <li>Reparatur tatsächlich durchgeführt — Werkstattrechnung als Nachweis</li>
            <li>Du hattest Nutzungswillen + -möglichkeit (kein Krankenhaus, kein Urlaub)</li>
            <li>Kein zumutbarer Zweitwagen verfügbar</li>
          </ul>
        )}
      </div>

      {mietwagenTagessatzEur && (
        <p className="text-[11px] text-claimondo-ondo/80 flex items-start gap-1.5">
          <InfoIcon className="w-3 h-3 shrink-0 mt-0.5" />
          Alternativ Mietwagen genommen? Sag uns Bescheid — die VS zahlt entweder Mietwagen-Kosten{' '}
          ({formatEuro(mietwagenTagessatzEur)}/Tag laut Klasse) <strong>oder</strong> Nutzungsausfall,
          nicht beides.
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
  accent?: 'rose' | 'amber' | null
}) {
  const valueColor =
    accent === 'rose'
      ? 'text-rose-700'
      : accent === 'amber'
        ? 'text-amber-700'
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
