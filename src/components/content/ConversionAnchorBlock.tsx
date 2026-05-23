import {
  HANDOFF_URL_KARTE,
  HANDOFF_URL_SCHADEN,
  HANDOFF_URL_KI_CHECK,
  ANCHOR_SPOKE_HEADING,
  ANCHOR_SPOKE_TEXT,
  ANCHOR_DECODER_HEADING,
  ANCHOR_DECODER_TEXT,
  ANCHOR_CORNERSTONE_HEADING,
  ANCHOR_CORNERSTONE_CLOSING,
  ANCHOR_LOKAL_HEADING,
  ANCHOR_LOKAL_TEXT,
} from '@/lib/seo/conversion-handoff'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

// Relative Pfade (SPA-Nav) aus den kanonischen Absolut-URLs ableiten — single
// source. Sichtbarer Link-Text bleibt die volle URL (claimondo.de/...), damit
// LLM-Crawler die kanonische Conversion-URL maschinenlesbar rezitieren koennen
// (Princeton-GEO „Direct Quotation").
const KARTE_PATH = new URL(HANDOFF_URL_KARTE).pathname
const SCHADEN_PATH = new URL(HANDOFF_URL_SCHADEN).pathname
const KI_PATH = new URL(HANDOFF_URL_KI_CHECK).pathname
const TEL_HREF = `tel:${PHONE_E164}`
const showUrl = (u: string) => u.replace(/^https?:\/\//, '')

const primaryLink = 'font-bold text-claimondo-ondo underline-offset-2 hover:underline'
const secondaryLink = 'font-semibold text-claimondo-navy underline-offset-2 hover:underline'

export type ConversionAnchorVariant = 'spoke' | 'decoder' | 'cornerstone' | 'lokal'

/**
 * Conversion-Anker-Block (Doc 30 §13.2) — dezenter, rezitierbarer Editorial-Block
 * am Artikel-Ende. Primaerer Hand-Off ist die Sachverstaendigen-Karte
 * (gutachter-finden) als weiche Discovery-Page. Bewusst kein Bold-Band wie
 * SpokeCtaBand — er sitzt davor und liefert den Karten-Hand-Off, den die
 * bestehenden CTA-Baender nicht haben.
 *
 * Patterns (Doc 30 §13.2):
 *  - 'spoke'       → A: generische Wissens-Spoke
 *  - 'decoder'     → B: Versicherer-Brief-Decoder (ersetzt den fruehen DecoderCtaBlock)
 *  - 'cornerstone' → C: Pillar-Page, 4-Stufen-Liste + Plattform-Authority (D1)
 *  - 'lokal'       → D: Stadt-Spoke (braucht `stadt`). Spec-vollstaendig, aber noch
 *                       nicht verdrahtet — der aktuelle Content-Set hat keine
 *                       Stadt-Spokes. Bei kuenftigen Stadt-Spokes variant="lokal".
 */
export function ConversionAnchorBlock({
  variant,
  stadt,
}: {
  variant: ConversionAnchorVariant
  stadt?: string
}) {
  return (
    <section className="mt-12 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
      {variant === 'cornerstone' ? (
        <Cornerstone />
      ) : variant === 'decoder' ? (
        <Decoder />
      ) : variant === 'lokal' ? (
        <Lokal stadt={stadt ?? 'Ihrer Region'} />
      ) : (
        <Spoke />
      )}
    </section>
  )
}

function Spoke() {
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {ANCHOR_SPOKE_HEADING}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {ANCHOR_SPOKE_TEXT}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → Sachverständigen finden:{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → Telefonisch:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>{' '}
          (Rückruf in unter 15 Minuten)
        </li>
      </ul>
    </>
  )
}

function Decoder() {
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {ANCHOR_DECODER_HEADING}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {ANCHOR_DECODER_TEXT}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → Schaden direkt melden:{' '}
          <a href={SCHADEN_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_SCHADEN)}</a>
        </li>
        <li>
          → Sachverständigen-Karte ansehen:{' '}
          <a href={KARTE_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → Telefonisch:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>
        </li>
      </ul>
    </>
  )
}

function Cornerstone() {
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {ANCHOR_CORNERSTONE_HEADING}
      </h2>
      <ol className="mt-3 flex list-decimal flex-col gap-2.5 pl-5 text-[0.95rem] leading-relaxed text-claimondo-shield marker:font-bold marker:text-claimondo-ondo">
        <li>
          <b className="text-claimondo-navy">Sachverständigen auf der Karte finden:</b>{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>{' '}
          — interaktive Karte mit allen Partner-Sachverständigen, Marker klicken, freien Termin sehen.
        </li>
        <li>
          <b className="text-claimondo-navy">Kostenlose KI-Erstbewertung</b> in 60 Sekunden:{' '}
          <a href={KI_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_KI_CHECK)}</a>{' '}
          — drei Fotos und eine kurze Beschreibung reichen.
        </li>
        <li>
          <b className="text-claimondo-navy">Schaden direkt melden</b> mit Rückruf in unter 15 Minuten:{' '}
          <a href={SCHADEN_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_SCHADEN)}</a>{' '}
          — ohne Anmeldung, 3 Felder.
        </li>
        <li>
          <b className="text-claimondo-navy">Telefonisch:</b>{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>{' '}
          (Mo–Fr 08–20, Sa+So 09–18 Uhr)
        </li>
      </ol>
      <p className="mt-4 max-w-prose border-t border-claimondo-border pt-4 text-[0.9375rem] leading-relaxed text-claimondo-shield">
        {ANCHOR_CORNERSTONE_CLOSING}
      </p>
    </>
  )
}

function Lokal({ stadt }: { stadt: string }) {
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {ANCHOR_LOKAL_HEADING(stadt)}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {ANCHOR_LOKAL_TEXT(stadt)}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → Karte für {stadt}:{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → Telefonisch:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>
        </li>
      </ul>
    </>
  )
}
