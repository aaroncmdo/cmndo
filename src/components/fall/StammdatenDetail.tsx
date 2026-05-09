'use client'

// CMM-32: Detail-Panel zur StammdatenAccordion. Rendert pro Kategorie
// die volle Felder-Liste. Wird in den Detail-Slot des Parent-Layouts
// gesetzt — typisch dort wo vorher „Dokumente am Fall" stand.

import {
  CarIcon,
  CarFrontIcon,
  WrenchIcon,
  ClockIcon,
  FileTextIcon,
  UserIcon,
  ShieldIcon,
  AlertTriangleIcon,
  XIcon,
  CheckCircle2Icon,
  XCircleIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  CalendarIcon,
} from 'lucide-react'
import FahrzeugRenderImage from '@/components/fahrzeug/FahrzeugRenderImage'
import { LACKFARBE_LABEL, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
import type { StammdatenCategory, StammdatenAccordionData } from './StammdatenAccordion'

type Props = {
  category: StammdatenCategory
  data: StammdatenAccordionData
  onClose: () => void
  /** Optionaler Slot z. B. für CardentityTypBButton in der Historie. */
  historieFooter?: React.ReactNode
  /** Optionaler Slot um die Dokumente-Sektion vom Parent rendern zu lassen
      (WeitereDokumenteCard etc — bleibt im Parent damit der Loader-Pfad
      gleich bleibt). */
  dokumenteSlot?: React.ReactNode
  /** Wenn true: kein Card-Wrapper, kein Header mit Schließen-Button —
      für Inline-Expansion direkt unter der Accordion-Zeile. */
  inline?: boolean
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

const TITLES: Record<StammdatenCategory, string> = {
  fahrzeug: 'Fahrzeug',
  historie: 'Historie',
  unfall: 'Unfall',
  dokumente: 'Dokumente',
  kunde: 'Kunde',
  gegner: 'Gegner',
  schaden: 'Schaden',
}

const ICONS: Record<StammdatenCategory, typeof CarIcon> = {
  fahrzeug: CarIcon,
  historie: ClockIcon,
  unfall: CarFrontIcon,
  dokumente: FileTextIcon,
  kunde: UserIcon,
  gegner: ShieldIcon,
  schaden: WrenchIcon,
}

export default function StammdatenDetail({
  category,
  data,
  onClose,
  historieFooter,
  dokumenteSlot,
  inline = false,
}: Props) {
  const Icon = ICONS[category]

  const content = (
    <div className="px-4 py-4">
      {category === 'fahrzeug' && <FahrzeugDetail data={data} />}
      {category === 'historie' && (
        <HistorieDetail data={data} footer={historieFooter} />
      )}
      {category === 'unfall' && <UnfallDetail data={data} />}
      {category === 'dokumente' &&
        (dokumenteSlot ?? <p className="text-sm text-claimondo-ondo">Keine Dokumente</p>)}
      {category === 'kunde' && <KundeDetail data={data} />}
      {category === 'gegner' && <GegnerDetail data={data} />}
      {category === 'schaden' && <SchadenDetail data={data} />}
    </div>
  )

  if (inline) {
    return <div className="bg-white">{content}</div>
  }

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-claimondo-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-claimondo-navy" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            {TITLES[category]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-claimondo-ondo hover:text-claimondo-navy transition-colors"
          aria-label="Detail schließen"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      {content}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2 border-b border-claimondo-border/40 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-claimondo-ondo/70">
        {label}
      </span>
      <span className="text-sm text-claimondo-navy">{value || '—'}</span>
    </div>
  )
}

function FahrzeugDetail({ data }: { data: StammdatenAccordionData }) {
  const { fall } = data
  const hersteller = str(fall.fahrzeug_hersteller)
  const modell = str(fall.fahrzeug_modell)
  const baujahr = str(fall.fahrzeug_baujahr)
  const lack = (str(fall.lackfarbe_code) as LackfarbeCode | null) ?? null
  const farbeDetail = str(fall.fahrzeug_farbe)
  const kennzeichen = str(fall.kennzeichen)
  const fin = str(fall.fin_vin)
  const fahrbereit = bool(fall.fahrzeug_fahrbereit)
  const leasing = fall.finanzierung_leasing === 'leasing'
  const finanzierung = fall.finanzierung_leasing === 'finanzierung'

  return (
    <div className="space-y-3">
      {hersteller && (
        <FahrzeugRenderImage
          hersteller={hersteller}
          modell={modell}
          lackfarbe={lack}
          baujahr={baujahr}
          width={280}
          className="mx-auto"
        />
      )}
      <div>
        <Field label="Hersteller" value={hersteller} />
        <Field label="Modell" value={modell} />
        <Field label="Baujahr" value={baujahr} />
        <Field
          label="Lackfarbe"
          value={
            <span>
              {lack ? LACKFARBE_LABEL[lack] : '—'}
              {farbeDetail && (
                <span className="text-claimondo-ondo text-xs ml-1.5">
                  ({farbeDetail})
                </span>
              )}
            </span>
          }
        />
        <Field
          label="Kennzeichen"
          value={kennzeichen ? <span className="font-mono">{kennzeichen}</span> : null}
        />
        <Field label="FIN" value={fin ? <span className="font-mono text-xs">{fin}</span> : null} />
        <Field
          label="Fahrbereit"
          value={
            fahrbereit === true ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2Icon className="w-3.5 h-3.5" /> Ja
              </span>
            ) : fahrbereit === false ? (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <XCircleIcon className="w-3.5 h-3.5" /> Nein
              </span>
            ) : null
          }
        />
        {(leasing || finanzierung) && (
          <Field
            label="Finanzierung"
            value={leasing ? 'Leasing' : finanzierung ? 'Finanzierung' : null}
          />
        )}
      </div>
    </div>
  )
}

function HistorieDetail({
  data,
  footer,
}: {
  data: StammdatenAccordionData
  footer?: React.ReactNode
}) {
  const { fall, lead } = data
  const hatVorschaeden = lead?.hat_vorschaeden ?? null
  const anzahl = (fall.vorschaden_anzahl as number | null) ?? null
  const letzterDatum = str(fall.vorschaden_letzter_datum)
  const beschreibung = str(fall.vorschaden_beschreibung)

  return (
    <div className="space-y-3">
      <Field
        label="Vorschäden"
        value={
          hatVorschaeden === true
            ? 'Gemeldet'
            : hatVorschaeden === false
              ? 'Keine'
              : 'Noch nicht erfasst'
        }
      />
      {anzahl != null && <Field label="Anzahl" value={anzahl} />}
      {letzterDatum && (
        <Field
          label="Letzter Vorschaden"
          value={new Date(letzterDatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
        />
      )}
      {beschreibung && <Field label="Beschreibung" value={beschreibung} />}
      {footer && <div className="pt-3 border-t border-claimondo-border/60">{footer}</div>}
    </div>
  )
}

function KundeDetail({ data }: { data: StammdatenAccordionData }) {
  const { lead, fall } = data
  if (!lead) return <p className="text-sm text-claimondo-ondo">Keine Kunden-Daten</p>
  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || null
  return (
    <div>
      <Field label="Name" value={name} />
      <Field
        label="E-Mail"
        value={
          lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex items-center gap-1.5 text-claimondo-navy hover:underline"
            >
              <MailIcon className="w-3.5 h-3.5" />
              {lead.email}
            </a>
          )
        }
      />
      <Field
        label="Telefon"
        value={
          lead.telefon && (
            <a
              href={`tel:${lead.telefon}`}
              className="inline-flex items-center gap-1.5 text-claimondo-navy hover:underline"
            >
              <PhoneIcon className="w-3.5 h-3.5" />
              {lead.telefon}
            </a>
          )
        }
      />
      <Field label="Straße" value={str(fall.kunde_strasse)} />
      <Field
        label="PLZ / Ort"
        value={[str(fall.kunde_plz), str(fall.kunde_stadt)].filter(Boolean).join(' ') || null}
      />
    </div>
  )
}

function GegnerDetail({ data }: { data: StammdatenAccordionData }) {
  const verursacher = (data.parteien ?? []).find(
    (p) => (p.rolle as string | null) === 'verursacher',
  )
  if (!verursacher)
    return (
      <p className="text-sm text-claimondo-ondo">
        Kein Verursacher erfasst.
      </p>
    )
  return (
    <div>
      <Field label="Name" value={str(verursacher.name)} />
      <Field label="Telefon" value={str(verursacher.telefon)} />
      <Field label="E-Mail" value={str(verursacher.email)} />
      <Field label="Versicherung" value={str(verursacher.versicherung_name)} />
      <Field
        label="VS-Nummer"
        value={
          str(verursacher.versicherung_nr) && (
            <span className="font-mono text-xs">{str(verursacher.versicherung_nr)}</span>
          )
        }
      />
    </div>
  )
}

function UnfallDetail({ data }: { data: StammdatenAccordionData }) {
  const { fall } = data
  const adresse =
    str(fall.unfallort) ??
    ([str(fall.schadens_adresse), str(fall.schadens_plz), str(fall.schadens_ort)]
      .filter(Boolean)
      .join(', ') || null)
  const datum = str(fall.schadens_datum) ?? str(fall.unfalldatum)
  const uhrzeit = str(fall.unfall_uhrzeit) ?? str(fall.schadens_uhrzeit)
  const hergang = str(fall.unfallhergang) ?? str(fall.schadens_hergang) ?? str(fall.schadens_beschreibung)
  const polizei = bool(fall.polizei_vor_ort) ?? bool(fall.polizei_aufgenommen)
  const dienststelle = str(fall.polizei_dienststelle)
  const aktenzeichen = str(fall.polizei_aktenzeichen)

  return (
    <div>
      <Field label="Ursache" value={str(fall.schadens_ursache)} />
      <Field
        label="Datum"
        value={
          datum && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-claimondo-ondo/70" />
              {new Date(datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
              {uhrzeit && <span className="text-claimondo-ondo">· {uhrzeit}</span>}
            </span>
          )
        }
      />
      <Field
        label="Unfallort"
        value={
          adresse && (
            <span className="inline-flex items-start gap-1.5">
              <MapPinIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 mt-0.5 shrink-0" />
              {adresse}
            </span>
          )
        }
      />
      <Field label="Hergang" value={hergang} />
      <Field
        label="Polizei"
        value={
          polizei === true ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2Icon className="w-3.5 h-3.5" /> Aufgenommen
            </span>
          ) : polizei === false ? (
            <span className="inline-flex items-center gap-1 text-claimondo-ondo">
              <XCircleIcon className="w-3.5 h-3.5" /> Nicht aufgenommen
            </span>
          ) : null
        }
      />
      {dienststelle && <Field label="Dienststelle" value={dienststelle} />}
      {aktenzeichen && (
        <Field
          label="Aktenzeichen"
          value={<span className="font-mono text-xs">{aktenzeichen}</span>}
        />
      )}
    </div>
  )
}

function SchadenDetail({ data }: { data: StammdatenAccordionData }) {
  const { fall } = data
  const beschreibung =
    str(fall.fahrzeugschaden_beschreibung) ?? str(fall.schadens_beschreibung)
  const fahrbereit = bool(fall.fahrzeug_fahrbereit)
  const wbw = str(fall.wiederbeschaffungswert)
  const repkosten = str(fall.reparaturkosten)
  const schadensumfang = str(fall.schadensumfang)

  return (
    <div>
      <Field label="Schadensumfang" value={schadensumfang} />
      <Field label="Fahrzeugschaden" value={beschreibung} />
      <Field
        label="Fahrbereit"
        value={
          fahrbereit === true ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2Icon className="w-3.5 h-3.5" /> Ja
            </span>
          ) : fahrbereit === false ? (
            <span className="inline-flex items-center gap-1 text-rose-700">
              <XCircleIcon className="w-3.5 h-3.5" /> Nein
            </span>
          ) : null
        }
      />
      {repkosten && (
        <Field
          label="Reparaturkosten"
          value={`${Number(repkosten).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        />
      )}
      {wbw && (
        <Field
          label="Wiederbeschaffungswert"
          value={`${Number(wbw).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
        />
      )}
    </div>
  )
}
