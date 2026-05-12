import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Handshake, TrendingUp, Users, ChevronRight, Euro, Clock, Shield,
  CheckCircle2, Phone, Calculator, HelpCircle, FileCheck, Building2, ScrollText,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, jsonLdScript,
  MAKLER_LANDING_URL, GUTACHTER_LANDING_URL, PHONE_DISPLAY, PHONE_E164, CONTACT_EMAIL,
} from '@/lib/seo/jsonld'

// makler.claimondo.de — B2B-Akquise-Landing für Versicherungsmakler.
// Reiner Server-Component (kein Client-JS für den Marketing-Content) —
// gut für GEO/SEO: der gesamte Text liegt im HTML, AI-Crawler können ihn
// 1:1 zitieren. Struktur "Antwort zuerst" (AnswerCapsule), Statistiken,
// FAQPage-Schema (+AI-Visibility), Quellen/Fachbegriffe (§249 BGB, DAT,
// BVSK, §34d GewO) — alles aus dem seo-geo-Skill-Playbook.
// "Ohne DB"-Variante: Lead-Capture läuft über E-Mail/Telefon; eine
// Waitlist-Tabelle (makler_waitlist) kommt mit der Portal-Aktivierung.

const MAIL_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Makler-Partnerschaft anfragen')}`
const TEL_HREF = `tel:${PHONE_E164}`

export const metadata: Metadata = {
  title: 'Makler Partner werden — Kfz-Schäden für Ihre Kunden abwickeln | Claimondo',
  description:
    'Versicherungsmakler kooperieren mit Claimondo: Wir koordinieren DAT-Sachverständige, Werkstatt und Regulierung nach §249 BGB — kostenlos für Makler, voller Schadensersatz für Ihre Mandanten. Jetzt Partner werden.',
  keywords: [
    'Versicherungsmakler Partner werden',
    'Makler Kooperation Kfz-Schaden',
    'Kfz-Schadensvermittlung Makler',
    'Schadensregulierung Partner',
    'Makler Mehrwert für Kunden',
    'Unfallschaden Kooperation Makler',
    'Kfz-Sachverständigen-Netzwerk Makler',
    'Schadenservice Versicherungsvermittler',
  ],
  alternates: {
    canonical: `${MAKLER_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${MAKLER_LANDING_URL}/`,
    title: 'Makler Partner werden — Kfz-Schäden professionell abwickeln | Claimondo',
    description:
      'Kooperation ohne Kosten. Ihre Mandanten bekommen vollständige Schadensregulierung, Sie stärken die Kundenbindung — ohne Mehraufwand.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo Makler-Partnerschaft' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Makler Partner werden — Claimondo',
    description: 'Kfz-Schadensregulierung für Ihre Mandanten. Ohne Aufwand, ohne Kosten für Makler.',
    images: ['/og-default.png'],
  },
}

const ZAHLEN = [
  { wert: '89+', label: 'DAT-Sachverständige bundesweit' },
  { wert: '< 48 h', label: 'bis zum Gutachten-Termin' },
  { wert: '97 %', label: 'Regulierungsquote' },
  { wert: '0 €', label: 'Kosten für Maklerpartner' },
]

const VORTEILE = [
  {
    icon: TrendingUp,
    title: 'Stärkere Kundenbindung',
    text: 'Sie begleiten Ihren Mandanten durch den gesamten Schadensfall — vom Gutachten bis zur Auszahlung. Ein erlebter Top-Service im Schadenfall ist das, was Bestandskunden hält.',
  },
  {
    icon: Euro,
    title: 'Keine Kosten, kein Risiko',
    text: 'Die Kooperation ist für Makler vollständig kostenlos. Claimondo rechnet die Schadenpositionen direkt mit der gegnerischen Haftpflichtversicherung ab — bei unverschuldeten Unfällen zahlt weder Ihr Kunde noch Sie.',
  },
  {
    icon: Users,
    title: 'Ein fester Ansprechpartner',
    text: 'Kein Ticketsystem, kein Callcenter. Sie erreichen direkt das Claimondo-Team — für sich und für Ihre Mandanten. Den Fallstatus sehen Sie jederzeit im Partner-Portal.',
  },
  {
    icon: Shield,
    title: 'Rechtssichere Abwicklung',
    text: 'Unabhängige Sachverständige, lückenlose Dokumentation und Durchsetzung aller Ansprüche nach §249 BGB über die Partnerkanzlei — inklusive Wertminderung, Nutzungsausfall und UPE-Aufschlägen.',
  },
]

const ABLAUF = [
  {
    nr: '01',
    title: 'Ihr Mandant meldet den Schaden bei Ihnen',
    text: 'Ein unverschuldeter Unfall — Ihr Kunde wendet sich an Sie, wie gewohnt. Sie leiten den Fall in zwei Minuten an Claimondo weiter: per Telefon, WhatsApp oder Online-Formular.',
  },
  {
    nr: '02',
    title: 'Claimondo koordiniert die gesamte Regulierung',
    text: 'Wir beauftragen einen unabhängigen DAT-Sachverständigen in der Nähe, holen das Gutachten ein, stimmen die Werkstatt ab und übernehmen die Schadensabwicklung mit der Versicherung.',
  },
  {
    nr: '03',
    title: 'Ihr Mandant erhält den vollen Schadensersatz',
    text: 'Reparaturkosten, Wertminderung, Nutzungsausfall, Sachverständigen­honorar, Anwaltskosten — alles, was nach §249 BGB zusteht. Sie sehen jeden Schritt im Partner-Portal.',
  },
]

const TRUST = [
  {
    icon: FileCheck,
    title: 'DAT-zertifizierte Gutachter',
    text: 'Unabhängige Kfz-Sachverständige nach DAT-Standard, Honorare nach BVSK-Honorartabelle — keine versicherereigenen Prüfdienste.',
  },
  {
    icon: ScrollText,
    title: 'Partnerkanzlei für die Durchsetzung',
    text: 'Sämtliche Ansprüche nach §249 BGB werden über eine auf Verkehrsrecht spezialisierte Partnerkanzlei rechtlich durchgesetzt.',
  },
  {
    icon: Building2,
    title: 'Köln, gegründet 2025',
    text: 'Claimondo GmbH, Hansaring 10, 50670 Köln — deutsches Unternehmen, deutscher Datenschutz, persönlich erreichbar.',
  },
  {
    icon: Handshake,
    title: 'Auf Augenhöhe',
    text: 'Wir treten nie als Wettbewerber zu Ihrem Bestandsgeschäft auf. Ihr Mandant bleibt Ihr Mandant — wir arbeiten im Hintergrund.',
  },
]

const FAQ: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was kostet die Claimondo-Maklerpartnerschaft?',
    antwort:
      'Nichts. Die Kooperation ist für Versicherungsmakler vollständig kostenlos. Claimondo finanziert sich über die Abrechnung der Schadenpositionen mit der gegnerischen Haftpflichtversicherung gemäß §249 BGB — bei unverschuldeten Unfällen zahlt weder Ihr Mandant noch Sie als vermittelnder Makler.',
  },
  {
    frage: 'Bekomme ich als Makler eine Provision?',
    antwort:
      'Im Standardmodell ist die Partnerschaft kostenfrei und provisionsfrei — der Mehrwert liegt in Kundenbindung und Servicequalität im Schadenfall. Für Maklerbüros mit höherem Schadenaufkommen gibt es ein optionales Provisionsmodell pro vermitteltem Fall; Details besprechen wir individuell.',
  },
  {
    frage: 'Bleibt der Kunde mein Mandant?',
    antwort:
      'Ja. Sie bleiben Ansprechpartner und Vertrauensperson. Claimondo arbeitet im Hintergrund, hält Sie über das Partner-Portal jederzeit auf dem aktuellen Stand und tritt nie als Konkurrent zu Ihrem Bestands- oder Neugeschäft auf.',
  },
  {
    frage: 'Wie ist der Datenschutz geregelt?',
    antwort:
      'DSGVO-konform. Daten Ihres Mandanten werden nur mit dessen ausdrücklicher Einwilligung weitergegeben, verschlüsselt übertragen und ausschließlich zur Schadenbearbeitung verwendet. Eine Auftragsverarbeitungsvereinbarung stellen wir auf Wunsch zur Verfügung.',
  },
  {
    frage: 'Welche Sachverständigen setzt Claimondo ein?',
    antwort:
      'Unabhängige, DAT-zertifizierte Kfz-Sachverständige aus einem bundesweiten Netzwerk von über 89 Partnern. Die Honorare richten sich nach der BVSK-Honorartabelle, der Gutachten-Termin findet in der Regel innerhalb von 48 Stunden vor Ort statt.',
  },
  {
    frage: 'Was muss ich tun, um Partner zu werden?',
    antwort:
      'Eine kurze Anfrage per E-Mail oder Telefon genügt. Voraussetzung ist eine Zulassung als Versicherungsvermittler nach §34d GewO. Sie erhalten innerhalb von 24 Stunden Rückmeldung und anschließend Zugang zum Partner-Portal — keine Mindestabnahme, jederzeit kündbar.',
  },
]

const ERWARTUNGEN = [
  'Zulassung als Versicherungsvermittler (§34d GewO)',
  'Bereitschaft, unverschuldete Kfz-Schadenfälle an Claimondo zu vermitteln',
  'Sie bleiben in der direkten Kommunikation mit Ihrem Mandanten — den Rest koordinieren wir',
  'Einwilligung des Kunden zur Datenweitergabe (DSGVO-konform)',
]

const HEADING_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' }
const GLASS_CARD = 'rounded-3xl border border-white/60 bg-white/70 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md'

export default function MaklerPartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Claimondo Makler-Partnerschaft',
            description:
              'Versicherungsmakler kooperieren mit Claimondo, um ihren Mandanten bei unverschuldeten Kfz-Unfallschäden eine vollständige Schadensregulierung zu bieten — inklusive unabhängigem DAT-Sachverständigen, Werkstattabstimmung und Durchsetzung aller Ansprüche nach §249 BGB. Für Makler kostenlos.',
            url: `${MAKLER_LANDING_URL}/`,
          }),
          faqPageSchema(FAQ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Makler Partner werden', url: `${MAKLER_LANDING_URL}/` },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden py-16 text-center sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 18% 12%, rgba(123,163,204,0.24), transparent 52%)',
              'radial-gradient(circle at 84% 30%, rgba(69,115,162,0.16), transparent 46%)',
              'radial-gradient(circle at 50% 100%, rgba(13,27,62,0.05), transparent 60%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-[0_2px_12px_rgba(13,27,62,0.06)] backdrop-blur-md sm:text-sm">
            <Handshake className="h-3.5 w-3.5" />
            Kostenlose Kooperation · kein Aufwand · mehr Kundenbindung
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={HEADING_FONT}
          >
            Vollständige Schadensregulierung — für Ihre Mandanten, ohne Mehraufwand für Sie.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-claimondo-ondo sm:text-lg">
            Als Claimondo-Maklerpartner bieten Sie Ihren Kunden bei unverschuldeten Kfz-Unfällen
            einen kompletten Schadenservice: unabhängiger DAT-Sachverständiger, Werkstattabstimmung
            und Durchsetzung aller Ansprüche nach §249 BGB. Sie stärken die Kundenbindung — wir
            kümmern uns um den Rest.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={MAIL_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              Partnerschaft anfragen
              <ChevronRight className="h-5 w-5" />
            </a>
            <a
              href={TEL_HREF}
              className="inline-flex items-center gap-2 rounded-full border border-claimondo-border bg-white/70 px-7 py-3.5 text-base font-semibold text-claimondo-navy backdrop-blur-sm transition-all hover:bg-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
          <p className="mt-4 text-xs text-claimondo-shield">
            Rückmeldung innerhalb von 24 Stunden · keine Mindestabnahme · jederzeit kündbar
          </p>
        </div>
      </section>

      {/* ── Antwort zuerst (GEO: answer-first) ────────────────────────── */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle="Makler-Kooperation · 0 € für Makler · bundesweit · §249 BGB">
            <strong>Die Claimondo Makler-Partnerschaft</strong> ermöglicht Versicherungsmaklern,
            ihren Mandanten bei unverschuldeten Kfz-Unfallschäden eine vollständige
            Schadensregulierung zu bieten: Claimondo beauftragt einen unabhängigen, DAT-zertifizierten
            Sachverständigen, holt das Gutachten ein, stimmt die Werkstatt ab und übernimmt die
            gesamte Abwicklung mit der gegnerischen Haftpflichtversicherung. Alle Ansprüche nach
            §249 BGB — Reparaturkosten, Wertminderung, Nutzungsausfall, Sachverständigen­honorar —
            werden über eine Partnerkanzlei durchgesetzt. Der Makler bleibt Ansprechpartner seines
            Kunden und behält über ein Partner-Portal jederzeit den Überblick. Für den Makler ist
            die Kooperation kostenlos; Kontakt per E-Mail oder Telefon.
          </AnswerCapsule>
        </div>
      </section>

      {/* ── Zahlen / Statistiken (GEO: statistics) ────────────────────── */}
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {ZAHLEN.map((z) => (
              <div
                key={z.label}
                className={`flex flex-col items-center ${GLASS_CARD} p-5 text-center`}
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <span className="text-3xl font-black text-claimondo-navy sm:text-4xl" style={HEADING_FONT}>
                  {z.wert}
                </span>
                <span className="mt-1.5 text-xs leading-snug text-claimondo-shield">{z.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-claimondo-shield/80">
            Stand 2026 · Quelle: Claimondo-interne Auswertung · DAT-Netzwerk &amp; bisherige Schadensfälle
          </p>
        </div>
      </section>

      {/* ── Vorteile ─────────────────────────────────────────────────── */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-3 text-center text-2xl font-bold tracking-[-0.01em] text-claimondo-navy sm:text-3xl" style={HEADING_FONT}>
            Was die Partnerschaft Ihnen bringt
          </h2>
          <p className="mx-auto mb-9 max-w-xl text-center text-sm text-claimondo-ondo">
            Vier Gründe, warum führende Maklerbüros den Schadenservice an Claimondo auslagern.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {VORTEILE.map((v) => {
              const Icon = v.icon
              return (
                <div key={v.title} className={`flex gap-5 ${GLASS_CARD} p-6`} style={{ WebkitBackdropFilter: 'blur(14px)' }}>
                  <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                    <Icon className="h-5 w-5 text-claimondo-ondo" />
                  </div>
                  <div>
                    <h3 className="font-bold text-claimondo-navy" style={HEADING_FONT}>{v.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">{v.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── So funktioniert die Kooperation ──────────────────────────── */}
      <section className="py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy" style={HEADING_FONT}>
            So funktioniert die Kooperation
          </h2>
          <ol className="space-y-5">
            {ABLAUF.map((s) => (
              <li
                key={s.nr}
                className={`flex items-start gap-6 ${GLASS_CARD} p-6 sm:p-7`}
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <span className="flex-shrink-0 text-4xl font-black tabular-nums text-claimondo-border" style={HEADING_FONT}>
                  {s.nr}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-claimondo-navy" style={HEADING_FONT}>{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Rechenbeispiel / ROI ─────────────────────────────────────── */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className={`${GLASS_CARD} overflow-hidden p-7 sm:p-9`} style={{ WebkitBackdropFilter: 'blur(14px)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                <Calculator className="h-5 w-5 text-claimondo-ondo" />
              </div>
              <h2 className="text-xl font-bold text-claimondo-navy sm:text-2xl" style={HEADING_FONT}>
                Rechenbeispiel: ein Maklerbüro, ~12 Kfz-Schadenfälle pro Jahr
              </h2>
            </div>
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-claimondo-border bg-claimondo-bg/60 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-claimondo-shield">Ohne Partner</p>
                <ul className="mt-3 space-y-2.5 text-sm text-claimondo-shield">
                  <li className="flex items-start gap-2.5"><Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-shield/70" />Pro Fall ~3–4 Std. Koordination: Gutachter suchen, Werkstatt, Versicherung, Rückfragen</li>
                  <li className="flex items-start gap-2.5"><Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-shield/70" /><span><strong>≈ 40–48 Std./Jahr</strong> gebundene Zeit — Zeit, die für Beratung &amp; Neugeschäft fehlt</span></li>
                  <li className="flex items-start gap-2.5"><Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-shield/70" />Risiko: Wertminderung, Nutzungsausfall &amp; UPE-Aufschläge bleiben oft unbeansprucht</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-claimondo-ondo/25 bg-claimondo-ondo/[0.07] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">Mit Claimondo</p>
                <ul className="mt-3 space-y-2.5 text-sm text-claimondo-navy">
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" />Fall in ~2 Minuten weiterleiten, Status im Partner-Portal verfolgen</li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" /><span><strong>≈ 0 Std. Eigenaufwand · 0 € Kosten</strong> für Ihr Büro</span></li>
                  <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" />Ihr Mandant erhält den vollen Schadensersatz nach §249 BGB — inkl. Wertminderung, Nutzungsausfall, UPE-Aufschlägen</li>
                </ul>
              </div>
            </div>
            <p className="mt-5 text-xs text-claimondo-shield/80">
              Beispielrechnung zur Illustration; tatsächlicher Aufwand variiert nach Schadenart und Büroorganisation.
            </p>
          </div>
        </div>
      </section>

      {/* ── Vertrauen / Trust-Signale ────────────────────────────────── */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-9 text-center text-2xl font-bold tracking-[-0.01em] text-claimondo-navy sm:text-3xl" style={HEADING_FONT}>
            Worauf Ihre Mandanten zählen können
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => {
              const Icon = t.icon
              return (
                <div key={t.title} className={`${GLASS_CARD} p-5`} style={{ WebkitBackdropFilter: 'blur(14px)' }}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-claimondo-navy/[0.06]">
                    <Icon className="h-5 w-5 text-claimondo-navy" />
                  </div>
                  <h3 className="mt-3.5 text-sm font-bold text-claimondo-navy" style={HEADING_FONT}>{t.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-claimondo-shield">{t.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ (GEO: FAQPage-Schema) ────────────────────────────────── */}
      <section className="py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-9 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
              <HelpCircle className="h-5 w-5 text-claimondo-ondo" />
            </div>
            <h2 className="text-2xl font-bold text-claimondo-navy sm:text-3xl" style={HEADING_FONT}>
              Häufige Fragen von Maklern
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <div key={f.frage} className={`${GLASS_CARD} p-6`} style={{ WebkitBackdropFilter: 'blur(14px)' }}>
                <h3 className="text-base font-bold text-claimondo-navy" style={HEADING_FONT}>{f.frage}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Was wir erwarten ─────────────────────────────────────────── */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-3xl p-8">
            <h2 className="mb-6 text-xl font-bold text-claimondo-navy" style={HEADING_FONT}>
              Was wir von unseren Maklerpartnern erwarten
            </h2>
            <ul className="space-y-4">
              {ERWARTUNGEN.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-claimondo-ondo/10">
                    <CheckCircle2 className="h-4 w-4 text-claimondo-ondo" />
                  </div>
                  <span className="text-sm leading-relaxed text-claimondo-shield">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Cross-Link: Gutachter werden ─────────────────────────────── */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-3xl border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              Sie sind Kfz-Sachverständiger und suchen Aufträge ohne Eigenakquise?
            </p>
            <Link
              href={GUTACHTER_LANDING_URL}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Als Gutachter Partner werden
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 25% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 75% 80%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-bold text-white sm:text-4xl" style={HEADING_FONT}>
            Partnerschaft anfragen.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kostenlos. Unverbindlich. Rückmeldung innerhalb von 24 Stunden.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={MAIL_HREF}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Handshake className="h-5 w-5" />
              {CONTACT_EMAIL}
            </a>
            <a
              href={TEL_HREF}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY} anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Makler Partner werden" />
    </div>
  )
}
