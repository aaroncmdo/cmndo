import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Banknote,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Calendar,
  FileText,
  Briefcase,
  TrendingUp,
  ScanLine,
  Receipt,
} from 'lucide-react'
import {
  serviceSchema,
  breadcrumbsSchema,
  faqPageSchema,
  jsonLdScript,
} from '@/lib/seo/jsonld'
import WaitlistApplyLoader from './WaitlistApplyLoader'

const PARTNER_URL = 'https://gutachter.claimondo.de'

export const metadata: Metadata = {
  title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise | Claimondo',
  description:
    'Partner-Plattform für DAT-Expert-Sachverständige. 100% BVSK-Honorar, Direkt-Auszahlung über Sicherungsabtretung, App-Vermittlung. Aktuell 89 Partner in NRW, Skalierung bundesweit.',
  keywords: [
    'Kfz-Sachverständiger Aufträge',
    'DAT-Expert Plattform',
    'BVSK-Gutachter Partner',
    'Sachverständiger werden',
    'Kfz-Gutachten Auftrag',
    'freier Sachverständiger Plattform',
    'öbuv Gutachter Partner',
  ],
  alternates: { canonical: PARTNER_URL },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo Partner',
    url: PARTNER_URL,
    title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise',
    description:
      '100% BVSK-Honorar. Direkt-Auszahlung über Sicherungsabtretung. App-Vermittlung. Werd Partner.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo Partner-Plattform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise',
    description:
      '100% BVSK-Honorar. Direkt-Auszahlung über Sicherungsabtretung. App-Vermittlung.',
    images: ['/og-default.png'],
  },
}

// ─── Inhalts-Konstanten (B2B-ToV: Du-Form, keine Floskeln) ─────────────

const STATS: Array<{ value: string; label: string; sub: string }> = [
  { value: '89', label: 'DAT-Partner in NRW', sub: 'Stand 04/2026 · gestaffelte Aufnahme' },
  { value: '100%', label: 'BVSK-Honorar', sub: 'keine Plattform-Provision' },
  { value: '§164 BGB', label: 'Sicherungsabtretung', sub: 'Direkt-Zahlung gegnerische Versicherung' },
  { value: '460', label: 'Skalierungsziel bundesweit', sub: 'Maßstab für Aufnahme-Pipeline' },
]

const SAEULEN: Array<{ icon: typeof Banknote; title: string; text: string }> = [
  {
    icon: Banknote,
    title: '100 % BVSK — null Provision',
    text: 'Du rechnest nach BVSK-Honorartabelle ab. Claimondo behält keinen Cent von deinem Honorar. Plattform-Kosten trägt die Anwaltsseite über das gesetzliche Anspruchskonstrukt.',
  },
  {
    icon: ShieldCheck,
    title: 'Direkt-Zahlung über Sicherungsabtretung',
    text: 'Geschädigter tritt das Honorar nach §164 BGB direkt an dich ab. Die gegnerische Versicherung zahlt auf dein Konto — nicht den Umweg über den Kunden. Forderungsausfall geht über LexDrive (Partnerkanzlei).',
  },
  {
    icon: Smartphone,
    title: 'App-First — kein Telefon-Marathon',
    text: 'Auftrag erscheint als Push, du nimmst an oder lehnst ab. Termin-Kalender, Foto-Upload, Berichte, Abrechnung — alles in der App. Kein WhatsApp-Chaos, keine Excel-Tabellen.',
  },
]

const SCHRITTE: Array<{
  nr: string
  icon: typeof FileText
  title: string
  text: string
}> = [
  {
    nr: '01',
    icon: FileText,
    title: 'Auftrag rein',
    text: 'Claimondo qualifiziert den Schaden und matcht ihn nach Standort + Auslastung. Du bekommst eine Push-Nachricht mit Fall-Eckdaten.',
  },
  {
    nr: '02',
    icon: Calendar,
    title: 'Termin annehmen',
    text: 'Du siehst Vorschlagstermin (oder schlägst selbst einen vor). Kunde bestätigt — der Termin landet im Kalender, samt GPS-Adresse.',
  },
  {
    nr: '03',
    icon: ScanLine,
    title: 'Vor-Ort-Begutachtung',
    text: 'Foto-Aufnahme + Schadensdaten direkt in der App. Optional: Voll-Gutachten in deiner gewohnten Software, Upload als PDF.',
  },
  {
    nr: '04',
    icon: Receipt,
    title: 'Auszahlung',
    text: 'Honorar-Rechnung an gegnerische Versicherung läuft automatisch über LexDrive. Zahlung trifft direkt bei dir ein — meist 4–8 Wochen nach Gutachten.',
  },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was kostet mich die Plattform?',
    antwort:
      'Nichts. Du behältst 100% des BVSK-Honorars. Claimondo verdient nicht an deinem Honorar, sondern an der gesetzlichen Vertretung über LexDrive (§249 BGB-Anwaltskostenpauschale, RVG nach Streitwert). Das ist exakt das Modell mit dem zertifizierte Sachverständige seit Jahren mit Anwaltskanzleien zusammenarbeiten — nur digital.',
  },
  {
    frage: 'Wer haftet wenn die Versicherung das Honorar kürzt?',
    antwort:
      'LexDrive (unsere Partnerkanzlei, Kevin Genter, Köln) setzt das volle BVSK-Honorar gegenüber der gegnerischen Versicherung durch — auch gerichtlich. Die Sicherungsabtretung nach §164 BGB wandert über uns an LexDrive. Forderungsausfall ist ein Anwalts-Risiko, nicht deins.',
  },
  {
    frage: 'Wie viele Aufträge bekomme ich realistisch?',
    antwort:
      'Wir nehmen Partner regional gestaffelt auf — abhängig von Schadenfrequenz in der jeweiligen PLZ. Aktuell sind es 89 DAT-Partner in NRW, das Skalierungsziel sind ~460 bundesweit. In Köln/Düsseldorf-Region: 8–20 Aufträge/Monat sind realistisch sobald deine Region freigeschaltet ist. Wir versprechen keine Volumen — sondern echtes Matching ohne Akquise.',
  },
  {
    frage: 'Brauche ich DAT-Expert-Zertifizierung?',
    antwort:
      'DAT-Expert oder vergleichbare Zertifizierung (öbuv, IHK-zertifiziert, BVSK-Mitgliedschaft) ist Pflicht. Wir vermitteln nur an unabhängige, qualifizierte Sachverständige — sonst hält das Gutachten der Versicherungs-Prüfung nicht stand. Wenn du noch keine Zertifizierung hast, ist das kein Showstopper für die Bewerbung — wir reden im Erstgespräch darüber.',
  },
  {
    frage: 'Welche Software muss ich nutzen?',
    antwort:
      'Deine eigene. DAT-SilverDAT, Audatex, GTÜ-Software, sherpa — was du gewohnt bist. Die Claimondo-App ergänzt für Foto-Aufnahme + Datenfluss zur Kanzlei, ersetzt aber nichts. PDF-Upload deines Gutachtens reicht.',
  },
  {
    frage: 'Wie schnell zahlt die Versicherung?',
    antwort:
      'Üblich sind 4–8 Wochen nach Gutachten-Versand. Bei strittigen Fällen (Haftung, Honorarhöhe) zieht es sich über LexDrive in den Mahnbescheid oder die Klage — du bekommst dein Geld trotzdem, weil die Sicherungsabtretung der Anwaltskanzlei das Inkasso-Risiko überträgt.',
  },
  {
    frage: 'Bin ich angestellt bei Claimondo?',
    antwort:
      'Nein — du bleibst freier Sachverständiger mit eigener Haftpflicht und Steuer. Wir vermitteln Aufträge, du bist Auftragnehmer des jeweiligen Geschädigten. Kein Arbeitsvertrag, keine Provision, keine Exklusivität. Du kannst parallel weiter deine eigenen Aufträge machen.',
  },
  {
    frage: 'Was ist mit der Kanzlei LexDrive — wer ist das?',
    antwort:
      'LexDrive ist eine Kölner Rechtsanwaltskanzlei (Kevin Genter, Ismail Emir) die ausschließlich KFZ-Haftpflicht-Schadensregulierung macht. Sie übernimmt für alle Claimondo-Fälle die Anspruchsdurchsetzung gegen die gegnerische Versicherung. Du arbeitest mit der Kanzlei zusammen — ohne dass du Mandantenakquise machen musst.',
  },
]

// ─── Page ────────────────────────────────────────────────────────────

export default function GutachterPartnerPage() {
  return (
    <div className="min-h-screen bg-[#0D1B3E] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Partner-Programm für Kfz-Sachverständige',
            description:
              'Plattform für DAT-Expert-zertifizierte Kfz-Sachverständige. Auftragsvermittlung über App, 100% BVSK-Honorar, Sicherungsabtretung-basierte Direkt-Zahlung über die gegnerische Versicherung.',
            url: PARTNER_URL,
          }),
          breadcrumbsSchema([
            { name: 'Claimondo', url: 'https://claimondo.de/' },
            { name: 'Partner werden', url: PARTNER_URL },
          ]),
          faqPageSchema(FAQS),
        ])}
      />

      {/* ── Topbar — Glass auf Navy ─────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl"
        style={{
          background: 'rgba(13,27,62,0.72)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          backdropFilter: 'saturate(180%) blur(24px)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Claimondo Startseite" className="group flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-[10px] shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:scale-[1.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/claimondo-shield.svg" alt="" width={36} height={36} className="h-9 w-9" />
            </span>
            <span className="hidden items-baseline gap-1.5 sm:flex">
              <span
                className="text-xl font-bold tracking-tight text-white"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                claim<span className="text-[#7BA3CC]">ondo</span>
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7BA3CC]">
                Partner
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {[
              { href: '#warum', label: 'Warum' },
              { href: '#ablauf', label: 'Ablauf' },
              { href: '#honorar', label: 'Honorar' },
              { href: '#faq', label: 'FAQ' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <a
            href="#waitlist"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4573A2] px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(69,115,162,0.5)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_6px_18px_rgba(123,163,204,0.55)] active:scale-[0.97]"
          >
            Auf die Warteliste
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[#4573A2]/20 blur-[120px]" />
          <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-[#1E3A5F]/40 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-20 sm:px-6 sm:pt-28">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/40 bg-[#4573A2]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#7BA3CC]">
            DAT-Expert · BVSK · §164 BGB-Sicherungsabtretung
          </div>

          <h1
            className="max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-6xl md:text-7xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Mehr Aufträge.{' '}
            <span className="bg-gradient-to-r from-[#7BA3CC] to-[#4573A2] bg-clip-text text-transparent">
              100 % BVSK.
            </span>{' '}
            Null Bürokratie.
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-lg leading-relaxed text-white/65 sm:text-xl">
            Claimondo ist die Plattform-Schicht zwischen Geschädigtem,
            Sachverständigem und Anwalt. Wir liefern dir vorqualifizierte
            Haftpflicht-Schadensgutachten — ohne Akquise, ohne Provision, ohne
            Forderungsausfall-Risiko.
          </p>

          {/* Stats — ehrliche Zahlen */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <div className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-[11px] font-medium text-white/65">{s.label}</div>
                <div className="mt-0.5 text-[10px] text-white/35">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_12px_36px_rgba(123,163,204,0.50)] active:scale-[0.98]"
            >
              Auf die Warteliste — Gebiet sehen
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#warum"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              Wie genau funktioniert das?
            </a>
          </div>
        </div>
      </section>

      {/* ── Drei Säulen ───────────────────────────────────── */}
      <section id="warum" className="border-y border-white/10 bg-[#0a1428]/60 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">
            Warum Claimondo
          </div>
          <h2
            className="max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Drei Dinge die andere Plattformen nicht liefern.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {SAEULEN.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.title}
                  className="group rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur transition-all hover:border-[#4573A2]/50 hover:bg-white/[0.08]"
                >
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4573A2]/20">
                    <Icon className="h-6 w-6 text-[#7BA3CC]" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{s.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Ablauf ──────────────────────────────────────────── */}
      <section id="ablauf" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">
            Ablauf — vier Schritte
          </div>
          <h2
            className="max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Vom Push bis zur Auszahlung.
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SCHRITTE.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.nr} className="relative">
                  {i < SCHRITTE.length - 1 && (
                    <div className="absolute left-[calc(50%+2rem)] top-6 hidden h-px w-full bg-gradient-to-r from-[#4573A2]/40 to-transparent lg:block" />
                  )}
                  <div className="relative">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#4573A2]/40 bg-[#4573A2]/15">
                      <Icon className="h-6 w-6 text-[#7BA3CC]" />
                      <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#4573A2] text-[10px] font-black text-white">
                        {s.nr}
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{s.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Honorar-Erklärung ─────────────────────────────── */}
      <section id="honorar" className="border-y border-white/10 bg-[#060e1f] py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">
            Honorar &amp; Auszahlung
          </div>
          <h2
            className="max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            BVSK 100 %. Direkt von der Versicherung. §164 BGB.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur">
              <Briefcase className="h-7 w-7 text-[#7BA3CC]" />
              <h3 className="mt-4 text-lg font-bold text-white">So läuft die Abrechnung</h3>
              <ol className="mt-4 space-y-3 text-sm text-white/65">
                <li className="flex gap-3">
                  <span className="font-bold text-[#7BA3CC]">1</span>
                  <span>
                    Geschädigter unterzeichnet die Sicherungsabtretung an dich.
                    Damit ist dein Honorar rechtlich abgesichert (§164 BGB,
                    BGH VI ZR 174/24).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-[#7BA3CC]">2</span>
                  <span>
                    Du erstellst dein Gutachten. Honorar nach BVSK-Tabelle 100% —
                    keine Plattform-Provision, keine Pauschalen-Kürzung.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-[#7BA3CC]">3</span>
                  <span>
                    LexDrive (Partnerkanzlei Köln) reicht das Honorar bei der
                    gegnerischen Versicherung ein und setzt es durch — auch
                    gerichtlich falls nötig.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-[#7BA3CC]">4</span>
                  <span>
                    Versicherung zahlt direkt auf dein Konto. Übliche Frist:
                    4–8 Wochen. Streitfälle laufen über LexDrive — kein Risiko
                    für dich.
                  </span>
                </li>
              </ol>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur">
              <TrendingUp className="h-7 w-7 text-[#7BA3CC]" />
              <h3 className="mt-4 text-lg font-bold text-white">Was Claimondo verdient</h3>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                Wir verdienen <span className="font-semibold text-white">nicht an deinem Honorar</span>.
                Unser Anteil kommt aus der gesetzlichen Anwaltskostenpauschale
                (§249 BGB) die LexDrive gegenüber der Versicherung geltend macht.
                Das ist genau das Modell mit dem etablierte Anwalts-SV-
                Kooperationen seit Jahrzehnten arbeiten.
              </p>
              <div className="mt-5 rounded-2xl bg-[#4573A2]/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#7BA3CC]">
                  Folge für dich
                </p>
                <p className="mt-1 text-sm text-white">
                  Mehr Aufträge bei gleichem Honorar. Keine Provision, kein
                  Inkasso-Risiko, keine Vorfinanzierung.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist + Live-Karte ─────────────────────────── */}
      <section id="waitlist" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 max-w-3xl">
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">
              Warteliste — Region zuerst freischalten
            </div>
            <h2
              className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Trag dich ein — sieh dein Gebiet sofort.
            </h2>
            <p className="mt-4 text-base text-white/55">
              Wir nehmen Partner regional gestaffelt auf. Sobald deine Region
              dran ist (üblicherweise innerhalb 2–6 Wochen), melden wir uns mit
              einem 15-Minuten-Onboarding-Call.
            </p>
          </div>

          <WaitlistApplyLoader />
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section id="faq" className="border-y border-white/10 bg-[#0a1428]/60 py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">
            Fragen &amp; Antworten
          </div>
          <h2
            className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Was Sachverständige uns am häufigsten fragen.
          </h2>

          <div className="mt-12 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.frage}
                className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur transition-all open:bg-white/[0.07]"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left">
                  <span className="text-base font-semibold text-white">{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#7BA3CC] transition-transform group-open:rotate-90" />
                </summary>
                <div className="border-t border-white/10 px-6 py-5 text-sm leading-relaxed text-white/65">
                  {f.antwort}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Finales CTA ──────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2
            className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Wenn das passt — trag dich ein.
          </h2>
          <p className="mt-4 text-base text-white/55">
            Eintrag dauert 3 Minuten. Erstgespräch dauert 15.
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-9 py-4 text-lg font-bold text-white shadow-[0_12px_36px_rgba(69,115,162,0.55)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_16px_44px_rgba(123,163,204,0.60)] active:scale-[0.98]"
            >
              Jetzt eintragen
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm text-white/35">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Keine Gebühren
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Keine Exklusivität
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Antwort in 2 Werktagen
            </span>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-white">Claim</span>
              <span className="text-lg font-bold text-[#7BA3CC]">ondo</span>
              <span className="ml-2 text-sm text-white/30">Partner-Plattform</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40">
              <Link href="/" className="hover:text-white">
                Für Geschädigte
              </Link>
              <Link href="/ueber-uns" className="hover:text-white">
                Über Claimondo
              </Link>
              <Link href="/impressum" className="hover:text-white">
                Impressum
              </Link>
              <Link href="/datenschutz" className="hover:text-white">
                Datenschutz
              </Link>
              <a href="mailto:partner@claimondo.de" className="hover:text-white">
                partner@claimondo.de
              </a>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-white/20">
            © {new Date().getFullYear()} Claimondo GmbH · Hansaring 10, 50670 Köln · Partner-Programm
            für DAT-Expert-Sachverständige
          </p>
        </div>
      </footer>
    </div>
  )
}
