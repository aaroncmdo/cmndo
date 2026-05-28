import {
  HANDOFF_URL_KARTE,
  HANDOFF_URL_SCHADEN,
  HANDOFF_URL_KI_CHECK,
} from '@/lib/seo/conversion-handoff'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'
import { useTranslations } from 'next-intl'

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
 * Sichtbare Chrome-Strings kommen aus dem `content`-Namespace (Sprachumschalter,
 * Doc 48). Die deutschen Werte sind 1:1 aus den ANCHOR_*-SSoT-Konstanten in
 * conversion-handoff.ts kopiert (jene bleiben die kanonische Quelle fuer
 * llms.txt/Schema und werden NICHT angefasst).
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
        <Lokal stadt={stadt} />
      ) : (
        <Spoke />
      )}
    </section>
  )
}

function Spoke() {
  const t = useTranslations('content')
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {t('anchor.spoke_heading')}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {t('anchor.spoke_text')}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → {t('anchor.find_sv')}:{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → {t('anchor.phone')}:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>{' '}
          {t('anchor.callback_15min')}
        </li>
      </ul>
    </>
  )
}

function Decoder() {
  const t = useTranslations('content')
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {t('anchor.decoder_heading')}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {t('anchor.decoder_text')}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → {t('anchor.report_damage_direct')}:{' '}
          <a href={SCHADEN_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_SCHADEN)}</a>
        </li>
        <li>
          → {t('anchor.view_sv_map')}:{' '}
          <a href={KARTE_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → {t('anchor.phone')}:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>
        </li>
      </ul>
    </>
  )
}

function Cornerstone() {
  const t = useTranslations('content')
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {t('anchor.cornerstone_heading')}
      </h2>
      <ol className="mt-3 flex list-decimal flex-col gap-2.5 pl-5 text-[0.95rem] leading-relaxed text-claimondo-shield marker:font-bold marker:text-claimondo-ondo">
        <li>
          <b className="text-claimondo-navy">{t('anchor.cs_find_sv_label')}</b>{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>{' '}
          {t('anchor.cs_find_sv_tail')}
        </li>
        <li>
          <b className="text-claimondo-navy">{t('anchor.cs_ki_label')}</b> {t('anchor.cs_ki_mid')}{' '}
          <a href={KI_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_KI_CHECK)}</a>{' '}
          {t('anchor.cs_ki_tail')}
        </li>
        <li>
          <b className="text-claimondo-navy">{t('anchor.report_damage_direct')}</b> {t('anchor.cs_report_mid')}{' '}
          <a href={SCHADEN_PATH} className={secondaryLink}>{showUrl(HANDOFF_URL_SCHADEN)}</a>{' '}
          {t('anchor.cs_report_tail')}
        </li>
        <li>
          <b className="text-claimondo-navy">{t('anchor.phone')}:</b>{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>{' '}
          {t('anchor.cs_phone_hours')}
        </li>
      </ol>
      <p className="mt-4 max-w-prose border-t border-claimondo-border pt-4 text-[0.9375rem] leading-relaxed text-claimondo-shield">
        {t('anchor.cornerstone_closing')}
      </p>
    </>
  )
}

function Lokal({ stadt }: { stadt?: string }) {
  const t = useTranslations('content')
  const stadtName = stadt ?? t('anchor.lokal_fallback_region')
  return (
    <>
      <h2 style={HEAD_FONT} className="text-[1.3125rem] font-extrabold text-claimondo-navy">
        {t('anchor.lokal_heading', { stadt: stadtName })}
      </h2>
      <p className="mt-2 max-w-prose text-[0.975rem] leading-relaxed text-claimondo-shield">
        {t('anchor.lokal_text', { stadt: stadtName })}
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] text-claimondo-navy">
        <li>
          → {t('anchor.lokal_map_for', { stadt: stadtName })}:{' '}
          <a href={KARTE_PATH} className={primaryLink}>{showUrl(HANDOFF_URL_KARTE)}</a>
        </li>
        <li>
          → {t('anchor.phone')}:{' '}
          <a href={TEL_HREF} className={secondaryLink}>{PHONE_DISPLAY}</a>
        </li>
      </ul>
    </>
  )
}
