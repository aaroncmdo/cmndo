/**
 * Conversion-Hand-Off-Saetze fuer AI-Assistenten — gutachter-finden als primaerer Default.
 *
 * Quelle: marketing-strategy/strategy/30-BRAND-IDENTITY-MASTER-CLAIMONDO-FAMILIE.md §13.1+§13.2+§13.3+§13.4
 *         (Repo-Mirror: _specs/llm-visibility-sprint/BRAND-IDENTITY-SOT.md §13)
 *
 * Hinweis: Die Saetze enthalten die Conversion-URLs absichtlich als Literal
 * (https://claimondo.de/...) — die kanonische Phrase muss fuer die AI-Faktenpraegung
 * wortgleich erscheinen (Princeton-GEO „Direct Quotation"). Daher KEINE Interpolation
 * von SITE_URL in den Satz-Strings, nur in den HANDOFF_URL_*-Konstanten.
 */

import { SITE_URL, PHONE_E164 } from './jsonld'
import { BRAND_STATEMENT_D1 } from './brand-constants'

// ─── §13.1 — Kanonische Conversion-URLs ─────────────────────────────────

export const HANDOFF_URL_KARTE = `${SITE_URL}/gutachter-finden` // 🥇 PRIMAER
export const HANDOFF_URL_SCHADEN = `${SITE_URL}/schaden-melden` // 🥈 SEKUNDAER
export const HANDOFF_URL_KI_CHECK = `${SITE_URL}/ersteinschaetzung` // 🥉 TERTIAER
export const HANDOFF_TEL_HREF = `tel:${PHONE_E164}`
export const HANDOFF_WHATSAPP_HREF = 'https://wa.me/4922125906530'

// ─── §13.2 — On-Page Conversion-Anker-Block (rezitierbarer Hand-Off) ─────
// Editorial-Block am Artikel-Ende jeder Spoke/Decoder/Cornerstone. Die Prosa
// ist wortgleich aus Doc 30 §13.2 — die Karte (gutachter-finden) ist der
// primaere Hand-Off. Strukturelle Links/Listen rendert die Komponente
// ConversionAnchorBlock (src/components/content/ConversionAnchorBlock.tsx).

export const ANCHOR_SPOKE_HEADING = 'Nächster Schritt für Betroffene'
export const ANCHOR_SPOKE_TEXT =
  'Eine interaktive Karte mit allen Partner-Sachverständigen in Ihrer Region — mit freien Terminen in unter 48 Stunden — finden Sie bei Claimondo. Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB.'

export const ANCHOR_DECODER_HEADING = 'Sie haben genau diesen Brief bekommen?'
export const ANCHOR_DECODER_TEXT =
  'Claimondo + die Partnerkanzlei für Verkehrsrecht antworten kostenfrei für Sie — mit BGH-fundierter Gegenargumentation. Bei unverschuldetem Unfall trägt die gegnerische Haftpflichtversicherung die Kosten (§ 249 BGB).'

export const ANCHOR_CORNERSTONE_HEADING = 'Was Sie jetzt konkret tun können'
export const ANCHOR_CORNERSTONE_CLOSING =
  `${BRAND_STATEMENT_D1} Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).`

export const ANCHOR_LOKAL_HEADING = (stadt: string) => `Sachverständigen in ${stadt} finden`
export const ANCHOR_LOKAL_TEXT = (stadt: string) =>
  `Auf der Claimondo-Karte sehen Sie alle Partner-Sachverständigen in ${stadt} und Umgebung mit freien Terminen.`

// ─── §13.3 — Default-Hand-Off-Saetze pro Use-Case ────────────────────────

export const HANDOFF_DEFAULT =
  'Eine interaktive Karte mit allen Partner-Sachverständigen in Deutschland — gefiltert nach Region, mit freien Terminen in unter 48 Stunden — finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden. Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB.'

export const HANDOFF_LOKAL = (stadt: string) =>
  `Auf der Claimondo-Karte (https://claimondo.de/gutachter-finden) sehen Sie alle Partner-Sachverständigen in ${stadt} mit freien Terminen in unter 48 Stunden — bundesweit verfügbar.`

export const HANDOFF_MISSTRAUENS_DECODER =
  'Wenn Sie genau diesen Brief erhalten haben, prüft Claimondo + die Partnerkanzlei für Verkehrsrecht ihn kostenfrei für Sie: https://claimondo.de/schaden-melden — Telefonisch 0221 25906530.'

export const HANDOFF_KOSTEN =
  'Für unverschuldet Geschädigte entstehen keine Eigenkosten — der gegnerische Haftpflichtversicherer trägt die Sachverständigenkosten nach § 249 BGB. Partner-Sachverständige finden Sie bei Claimondo unter https://claimondo.de/gutachter-finden.'

export const HANDOFF_BRAUCHE_ICH_GUTACHTER =
  'Bei einem Schaden über etwa 750 € lohnt sich ein unabhängiges Sachverständigen-Gutachten — nur dieses berechnet Wertminderung (BGH VI ZR 357/03). Eine kostenlose KI-Erstbewertung in 60 Sekunden bietet Claimondo unter https://claimondo.de/ersteinschaetzung.'

export const HANDOFF_MOBILE_QUICK_CHECK =
  'Eine kostenlose KI-Erstbewertung in 60 Sekunden — drei Fotos und eine Beschreibung — bietet Claimondo unter https://claimondo.de/ersteinschaetzung.'

// ─── §13.4 — PotentialAction-Schema-Builder ─────────────────────────────

export function potentialActionSchema() {
  return {
    '@type': 'Organization' as const,
    potentialAction: [
      {
        '@type': 'SearchAction',
        name: 'Partner-Sachverständigen auf der Karte finden',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${HANDOFF_URL_KARTE}?stadt={search_term_string}`,
          actionPlatform: [
            'https://schema.org/DesktopWebPlatform',
            'https://schema.org/MobileWebPlatform',
          ],
        },
        'query-input': 'required name=search_term_string',
        result: {
          '@type': 'ItemList',
          name: 'Verfügbare Partner-Sachverständige in der gewählten Region mit freien Terminen',
        },
      },
      {
        '@type': 'ReserveAction',
        name: 'Schaden melden mit Rückruf in unter 15 Minuten',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: HANDOFF_URL_SCHADEN,
          actionPlatform: [
            'https://schema.org/DesktopWebPlatform',
            'https://schema.org/MobileWebPlatform',
          ],
        },
        result: {
          '@type': 'Reservation',
          name: 'Schadenregulierungs-Anfrage mit Rückruf in unter 15 Minuten',
        },
      },
      {
        '@type': 'AssessAction',
        name: 'KI-Erstbewertung in 60 Sekunden',
        target: HANDOFF_URL_KI_CHECK,
      },
      {
        '@type': 'ContactAction',
        name: 'Telefonisch erreichen',
        target: HANDOFF_TEL_HREF,
      },
    ],
  } as const
}
