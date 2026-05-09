import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Euro,
  Scale,
  Zap,
  Users,
  Clock,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'

export const metadata: Metadata = {
  title: 'Ihre Vorteile — Claimondo',
  description:
    'Warum Claimondo? 0 € für Sie, unabhängige Gutachter, volle Regulierung durch Anwalt. Alles aus einer Hand, deutschlandweit.',
}

const VORTEILE = [
  {
    icon: Euro,
    title: '0 € Kosten für Sie',
    subtitle: 'Der Verursacher zahlt alles',
    text: 'Bei einem unverschuldeten Unfall trägt die gegnerische Versicherung alle Kosten: Gutachten, Anwalt, Mietwagen, Abschleppkosten. Für Sie entstehen keine Ausgaben — und kein Risiko.',
    punkte: [
      'Gutachterkosten: 100 % übernommen',
      'Anwaltskosten: komplett durch Gegner',
      'Mietwagen bis zur Reparatur: gedeckt',
      'Keine Vorleistung, kein Risiko',
    ],
  },
  {
    icon: Scale,
    title: 'Unabhängige Gutachter',
    subtitle: 'Nur Ihrem Interesse verpflichtet',
    text: 'Unsere Gutachter arbeiten unabhängig — sie stehen nicht im Dienst einer Versicherung. Das bedeutet: Ihr Schaden wird vollständig und korrekt bewertet, nicht kleingerechnet.',
    punkte: [
      'Über 50 zertifizierte Partner-Gutachter',
      'Keine Bindung an gegnerische Versicherung',
      'Vollständige Schadensbewertung',
      'Bericht nach DAT-Standard in 48 Stunden',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Anwalt inklusive',
    subtitle: 'Vollständige rechtliche Vertretung',
    text: 'Unsere Partnerkanzlei übernimmt die gesamte Korrespondenz mit der Versicherung und kämpft für Ihren vollen Anspruch — bis zur letzten Cent-Differenz.',
    punkte: [
      'Erfahrene Verkehrsrechtsspezialisten',
      'Direkter Kontakt, kein Call-Center',
      'Schriftverkehr mit Versicherung übernommen',
      'Notfalls gerichtliche Durchsetzung',
    ],
  },
  {
    icon: Zap,
    title: 'Alles aus einer Hand',
    subtitle: 'Ein Ansprechpartner für alles',
    text: 'Kein Koordinieren zwischen Gutachter, Werkstatt und Anwalt. Claimondo orchestriert den gesamten Prozess. Sie bekommen regelmäßige Updates — und müssen sich um nichts kümmern.',
    punkte: [
      'Ein zentraler Ansprechpartner',
      'Status-Updates per WhatsApp',
      'Koordination aller Beteiligten',
      'Digitale Fallakte jederzeit einsehbar',
    ],
  },
  {
    icon: Clock,
    title: 'Schnell & digital',
    subtitle: 'Ohne Papierkram, ohne Wartezeit',
    text: 'Schaden melden dauert 5 Minuten — per Handy, ohne Formulare. Gutachter kommt am nächsten Tag. Regulierung läuft im Hintergrund, während Sie wieder fahren.',
    punkte: [
      'Schadenmeldung in 5 Minuten',
      'Gutachtertermin oft am gleichen Tag',
      'Bericht in 48 Stunden',
      'Digitale Vollmacht — kein Papierkram',
    ],
  },
  {
    icon: Users,
    title: 'Deutschlandweit',
    subtitle: 'Überall für Sie da',
    text: 'Egal ob Großstadt oder ländliche Region: unser Netzwerk aus über 50 Gutachtern deckt ganz Deutschland ab. Der nächste Gutachter ist meist wenige Kilometer entfernt.',
    punkte: [
      '50+ Partner-Gutachter bundesweit',
      'Standortbasierte Zuweisung',
      'Kurze Anfahrtswege',
      'Ortskundige Experten',
    ],
  },
]

const KUERZUNGEN = [
  {
    position: 'Stundenverrechnungssätze',
    trick: 'Verweis auf billigere Partnerwerkstatt',
    recht: 'BGH VI ZR 248/05 — freie Werkstattwahl',
  },
  {
    position: 'UPE-Aufschläge',
    trick: 'Als „nicht erstattungsfähig" abgestempelt',
    recht: 'BGH VI ZR 65/18 — erstattungsfähig',
  },
  {
    position: 'Verbringungskosten',
    trick: 'Komplett gestrichen',
    recht: 'BGH — vollständig erstattungsfähig',
  },
  {
    position: 'Beilackierungskosten',
    trick: 'Ignoriert oder halbiert',
    recht: 'BGH VI ZR 174/24 (2025) — gilt',
  },
  {
    position: 'Sachverständigenhonorar',
    trick: 'Als „überhöht" abgelehnt',
    recht: 'BGH — Honorar liegt beim Auftraggeber',
  },
  {
    position: 'Wertminderung',
    trick: 'Komplett ignoriert oder auf Null gesetzt',
    recht: 'BGH VI ZR 357/03 — keine starre Altersgrenze',
  },
]

const VERGLEICH = [
  { punkt: 'Kosten für Sie', ohne: 'Gutachterkosten selbst zahlen', mit: '0 € — Gegner zahlt alles' },
  { punkt: 'Gutachter', ohne: 'Versicherungs-Gutachter (nicht neutral)', mit: 'Unabhängiger Sachverständiger' },
  { punkt: 'Anwalt', ohne: 'Selbst beauftragen & bezahlen', mit: 'Inklusive, kostenlos' },
  { punkt: 'Aufwand', ohne: 'Stunden am Telefon & Formulare', mit: '5 Minuten — wir übernehmen den Rest' },
  { punkt: 'Transparenz', ohne: 'Keine Statusinfos', mit: 'Live-Updates per WhatsApp' },
  { punkt: 'Regulierung', ohne: 'Oft unvollständig', mit: '100 % Ihres Anspruchs' },
]

export default function VorteilePage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <LandingTopbar authenticatedUser={null} />

      {/* Header */}
      <section className="bg-gradient-to-b from-white to-[#f8f9fb] py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/20 bg-[#4573A2]/5 px-4 py-1.5 text-sm font-semibold text-[#4573A2]">
            Warum Claimondo?
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#0D1B3E] sm:text-5xl">
            Ihr Recht. Vollständig durchgesetzt.
          </h1>
          <p className="mt-4 text-lg text-[#4573A2]">
            Kein Kompromiss, kein Papierkram, keine Kosten für Sie.
          </p>
        </div>
      </section>

      {/* Vorteile Grid */}
      <section className="py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {VORTEILE.map((v) => {
            const Icon = v.icon
            return (
              <div
                key={v.title}
                className="rounded-3xl border border-[#e4e7ef] bg-white p-7 shadow-sm"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4573A2]/10">
                  <Icon className="h-6 w-6 text-[#4573A2]" />
                </div>
                <h2 className="text-xl font-extrabold text-[#0D1B3E]">{v.title}</h2>
                <p className="mt-0.5 text-sm font-semibold text-[#7BA3CC]">{v.subtitle}</p>
                <p className="mt-3 text-sm leading-relaxed text-[#1E3A5F]">{v.text}</p>
                <ul className="mt-5 space-y-2">
                  {v.punkte.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-[#4573A2]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Kürzungs-Aufklärung */}
      <section className="bg-[#0D1B3E] py-20 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">Was Sie nicht wissen sollen</div>
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              So kürzt die Versicherung Ihren Anspruch
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/60">
              ControlExpert, K-Expert und DEKRA erstellen automatisierte Prüfberichte — <strong className="text-white">ohne Fahrzeugbesichtigung</strong>.
              Positionen werden gestrichen, in der Hoffnung dass Sie nicht widersprechen.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="grid grid-cols-3 border-b border-white/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white/40">
              <div>Gekürzter Posten</div>
              <div className="text-center">Versicherungs-Trick</div>
              <div className="text-right">Ihr Recht (BGH)</div>
            </div>
            {KUERZUNGEN.map((k, i) => (
              <div
                key={k.position}
                className={`grid grid-cols-3 items-center px-6 py-4 text-sm ${i < KUERZUNGEN.length - 1 ? 'border-b border-white/5' : ''}`}
              >
                <div className="font-semibold text-white">{k.position}</div>
                <div className="text-center text-red-400">{k.trick}</div>
                <div className="text-right text-emerald-400">{k.recht}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-amber-200">
              Im Schnitt verlieren Unfallbeteiligte{' '}
              <span className="text-3xl font-black text-amber-400">33 %</span>{' '}
              ihres Anspruchs — weil sie nicht widersprechen.
            </p>
            <p className="mt-2 text-sm text-amber-200/60">
              Reales Beispiel: Gutachtenwert €11.900 → nach Versicherer-Kürzungen: €8.000 ausgezahlt. €3.900 verloren.
            </p>
          </div>
        </div>
      </section>

      {/* Vergleichstabelle */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-8 text-center text-3xl font-extrabold text-[#0D1B3E]">
            Mit oder ohne Claimondo?
          </h2>
          <div className="overflow-hidden rounded-3xl border border-[#e4e7ef] bg-white shadow-sm">
            <div className="grid grid-cols-3 border-b border-[#e4e7ef] bg-[#f8f9fb] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#4573A2]">
              <div>Was wird verglichen</div>
              <div className="text-center text-red-500">Ohne Claimondo</div>
              <div className="text-center text-emerald-600">Mit Claimondo</div>
            </div>
            {VERGLEICH.map((v, i) => (
              <div
                key={v.punkt}
                className={`grid grid-cols-3 px-6 py-4 text-sm ${i < VERGLEICH.length - 1 ? 'border-b border-[#e4e7ef]' : ''}`}
              >
                <div className="font-semibold text-[#0D1B3E]">{v.punkt}</div>
                <div className="text-center text-red-500">{v.ohne}</div>
                <div className="flex items-center justify-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{v.mit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D1B3E] py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Überzeugt? Jetzt Schaden melden.
          </h2>
          <p className="mt-3 text-lg text-white/60">5 Minuten. Kostenlos. Unverbindlich.</p>
          <Link
            href="/schaden-melden"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-10 py-4 text-base font-bold text-white shadow-xl transition-all hover:bg-[#7BA3CC]"
          >
            Schaden melden — 0 € Kosten
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
