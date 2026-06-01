import Link from 'next/link'
import { Phone, Mail, MapPin, Globe, AlertTriangle } from 'lucide-react'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

interface Props {
  versichererName: string
  /** schema.org @id zum Mergen mit der Organization der Seite. */
  orgId: string
  hotline247?: string
  hotlineAusland?: string
  schadenUrl: string
  postanschrift: string
  email?: string
  /** Decoder-Link für die Telefon-Druck-Warnung. */
  warnDecoderUrl?: string
}

const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

/**
 * Kontaktwege-Box (CONTRACT F-26): strukturierte Schadens-Kontaktdaten mit tel:/
 * mailto:-Links + ContactPoint-Schema (als Organization mit gemeinsamer @id, die
 * die Seite ergänzt). Plus Warnhinweis zu Telefon-Risiken.
 */
export function KontaktwegeBox({
  versichererName,
  orgId,
  hotline247,
  hotlineAusland,
  schadenUrl,
  postanschrift,
  email,
  warnDecoderUrl,
}: Props) {
  const contactPoint: Array<Record<string, string>> = []
  if (hotline247) {
    contactPoint.push({
      '@type': 'ContactPoint',
      contactType: 'Schadenmeldung',
      telephone: hotline247,
      areaServed: 'DE',
      availableLanguage: 'German',
    })
  }
  if (hotlineAusland) {
    contactPoint.push({ '@type': 'ContactPoint', contactType: 'Auslandsschaden', telephone: hotlineAusland })
  }
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': orgId,
    name: versichererName,
    ...(contactPoint.length > 0 ? { contactPoint } : {}),
  }

  return (
    <section className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <h2 style={HEAD_FONT} className="text-lg font-extrabold text-claimondo-navy">
        Schaden melden — Kontaktwege
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        {hotline247 && (
          <div className="flex items-start gap-2.5">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
            <div>
              <dt className="text-claimondo-shield/60">Schaden-Hotline (24/7)</dt>
              <dd>
                <a href={telHref(hotline247)} className="font-semibold text-claimondo-navy hover:underline">
                  {hotline247}
                </a>
              </dd>
            </div>
          </div>
        )}
        {hotlineAusland && (
          <div className="flex items-start gap-2.5">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
            <div>
              <dt className="text-claimondo-shield/60">Aus dem Ausland</dt>
              <dd>
                <a href={telHref(hotlineAusland)} className="font-semibold text-claimondo-navy hover:underline">
                  {hotlineAusland}
                </a>
              </dd>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
          <div>
            <dt className="text-claimondo-shield/60">Online-Schadensmeldung</dt>
            <dd>
              <a
                href={schadenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-claimondo-navy hover:underline"
              >
                Schaden-Portal
              </a>
            </dd>
          </div>
        </div>
        {email && (
          <div className="flex items-start gap-2.5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
            <div>
              <dt className="text-claimondo-shield/60">E-Mail</dt>
              <dd>
                <a href={`mailto:${email}`} className="font-semibold text-claimondo-navy hover:underline">
                  {email}
                </a>
              </dd>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
          <div>
            <dt className="text-claimondo-shield/60">Postanschrift Schaden</dt>
            <dd className="font-medium text-claimondo-navy">{postanschrift}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-4 flex gap-2.5 rounded-ios-md border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-sm leading-relaxed text-amber-900">
          Vorsicht am Telefon: Aussagen gegenüber der gegnerischen Versicherung können Ihre Ansprüche
          schwächen.{' '}
          {warnDecoderUrl && (
            <Link href={warnDecoderUrl} className="font-semibold text-claimondo-ondo hover:underline">
              Was Sie nicht sagen sollten →
            </Link>
          )}
        </p>
      </div>
    </section>
  )
}
