import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ClipboardList,
  MapPin,
  CreditCard,
  Smartphone,
  ChevronRight,
  Star,
  Shield,
  Zap,
  Users,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Calendar,
  FileText,
  Car,
  TrendingUp,
} from 'lucide-react'
import { serviceSchema, breadcrumbsSchema, jsonLdScript } from '@/lib/seo/jsonld'

const PARTNER_URL = 'https://gutachter.claimondo.de'

export const metadata: Metadata = {
  title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise',
  description:
    'Partner-Gutachter werden: vorqualifizierte Aufträge per App, GPS-Feldmodus, automatische Abrechnung. 89+ Partner, 2.400+ Aufträge.',
  keywords: [
    'Kfz-Sachverständiger Aufträge',
    'Gutachter werden',
    'Sachverständigen-Plattform',
    'Kfz-Gutachten Auftrag',
    'DAT-Experte',
    'BVSK-Gutachter',
    'Schadensgutachter Job',
    'freier Sachverständiger',
    'Gutachter App',
  ],
  alternates: {
    canonical: `${PARTNER_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo Gutachter-Partner',
    url: PARTNER_URL,
    title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise',
    description:
      'Vorqualifizierte Aufträge per App, transparente Honorare, automatische Abrechnung. 50+ Partner, 2.400+ Aufträge.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Partner-Gutachter werden' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kfz-Sachverständiger werden — Aufträge ohne Akquise',
    description: 'Vorqualifizierte Aufträge per App, transparente Honorare, automatische Abrechnung.',
    images: ['/og-default.png'],
  },
}

// Gutachter-Partner-Landingpage — serviert unter gutachter.claimondo.de
// via Middleware-Rewrite aus src/middleware.ts

const STATS = [
  { value: '50+', label: 'Partner-Gutachter bundesweit' },
  { value: '2.400+', label: 'abgeschlossene Aufträge' },
  { value: '48h', label: 'Berichtfertigstellung' },
  { value: '4,8★', label: 'Kundenzufriedenheit' },
]

const VORTEILE = [
  {
    icon: ClipboardList,
    title: 'Aufträge ohne Akquise',
    text: 'Claimondo übernimmt Marketing, Leadgewinnung und Kundenkontakt. Du erhältst fertig terminierte Aufträge direkt in der App — ohne Kaltakquise.',
  },
  {
    icon: Smartphone,
    title: 'Digitale Komplettlösung',
    text: 'Feldmodus mit GPS-Navigation, digitale Schadenerfassung, automatische Berichtvorlagen, Kalender-Sync und Dokumenten-Upload — alles in einer App.',
  },
  {
    icon: CreditCard,
    title: 'Faire & pünktliche Abrechnung',
    text: 'Transparente Honorarvereinbarung, automatische Monatsabrechnung, keine versteckten Gebühren. Dein Geld kommt — pünktlich, jeden Monat.',
  },
  {
    icon: Shield,
    title: 'Rückendeckung durch unser Team',
    text: 'Dispatch-Team koordiniert Termine, Admin-Support bei Fragen, Kanzlei-Partner für rechtliche Absicherung. Du bist nicht allein.',
  },
  {
    icon: MapPin,
    title: 'Aufträge in deiner Region',
    text: 'Wir matchen Aufträge nach deinem Standort und deiner Isochrone. Du fährst kurze Wege — kein stundenlanger Fahrtaufwand für einzelne Termine.',
  },
  {
    icon: TrendingUp,
    title: 'Wachse mit uns',
    text: 'Je mehr du lieferst, desto mehr bekommst du. Bewertungen, SLA-Performance und Kapazitäten bestimmen deinen Rang im Netzwerk.',
  },
]

const SCHRITTE = [
  {
    nr: '01',
    icon: FileText,
    title: 'Profil anlegen',
    text: 'Lade deine Zulassung, Haftpflicht und Pflichtdokumente hoch. Unser Team prüft und schaltet dich innerhalb von 48 Stunden frei.',
  },
  {
    nr: '02',
    icon: Calendar,
    title: 'Aufträge empfangen',
    text: 'Sobald du freigeschaltet bist, bekommst du Auftragsanfragen per App und WhatsApp. Annehmen, ablehnen — volle Kontrolle.',
  },
  {
    nr: '03',
    icon: Car,
    title: 'Begutachtung durchführen',
    text: 'Fahre zum Termin mit der Claimondo-App. Feldmodus führt dich durch die Schadenerfassung. Bericht in 48 Stunden fertig.',
  },
  {
    nr: '04',
    icon: CreditCard,
    title: 'Abrechnung — automatisch',
    text: 'Kein Rechnungen schreiben. Jeder abgeschlossene Auftrag wird erfasst. Abrechnung läuft automatisch zum Monatsende.',
  },
]

const FEATURES = [
  'Digitale Schadenerfassung mit Foto-Upload',
  'GPS-Routing zum Besichtigungsort',
  'Automatische Berichterstellung',
  'Kalender-Integration (Google / Apple)',
  'WhatsApp-Benachrichtigungen',
  'Echtzeit-Auftragsstatus',
  'Monatliche Abrechnungsübersicht',
  'Direkter Draht zum Dispatch-Team',
]

const FALLBEISPIELE = [
  {
    fahrzeug: 'Opel Karl',
    tag: 'Verborgene Totalschäden',
    situation: 'Von außen: nur Kratzer und eine leichte Delle sichtbar. Versicherungs-Gutachter: kosmetischer Schaden, kein strukturelles Problem.',
    ergebnis: 'Nach Demontage durch unabhängigen Gutachter: Rahmenlängsträger verschoben — Totalschaden.',
    verlust: '€7.000',
    verlustText: 'wären ohne unabhängiges Gutachten einfach verloren gegangen.',
    farbe: 'from-red-900/30 to-transparent',
    borderFarbe: 'border-red-500/20',
  },
  {
    fahrzeug: 'Tesla Model 3',
    tag: 'E-Auto Sonderwissen',
    situation: 'Standard-Gutachten mit DAT/Audatex: €22.000. Das Programm kannte die Verbundzeiten für US-Fahrzeuge nicht — Steuergeräte unter Schwellerblenden nicht erfasst.',
    ergebnis: 'Mit Tesla-Originaldaten und Spezial-Gutachter: €48.000.',
    verlust: '+€26.000',
    verlustText: 'mehr für den Kunden — durch Fachwissen, das Standard-Software nicht liefert.',
    farbe: 'from-amber-900/20 to-transparent',
    borderFarbe: 'border-amber-500/20',
  },
  {
    fahrzeug: 'NDR-Reportage-Fall',
    tag: 'Automatisierte Kürzungen',
    situation: 'ControlExpert-Prüfbericht ohne Fahrzeugbesichtigung: Schadensumme auf €2.000 gedrückt. Der Versicherer hatte gezahlt, der Fall galt als abgeschlossen.',
    ergebnis: 'Unabhängiges Gutachten nach Demontage: €9.000 tatsächlicher Schaden.',
    verlust: '€7.000',
    verlustText: 'verloren — ohne Widerspruch. BGH VI ZR 65/18 hätte den vollen Betrag gesichert.',
    farbe: 'from-[#4573A2]/20 to-transparent',
    borderFarbe: 'border-[#4573A2]/30',
  },
]

export default function GutachterPartnerPage() {
  return (
    <div className="min-h-screen bg-[#0D1B3E] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Partner-Programm für Kfz-Sachverständige',
            description:
              'Plattform für unabhängige Kfz-Sachverständige: vorqualifizierte Aufträge per App, GPS-Feldmodus, automatische Abrechnung, Dispatch-Support. Aktuell über 50 Partner bundesweit.',
            url: PARTNER_URL,
          }),
          breadcrumbsSchema([
            { name: 'Claimondo', url: 'https://claimondo.de/' },
            { name: 'Gutachter werden', url: PARTNER_URL },
          ]),
        ])}
      />

      {/* ── Topbar — Glass auf Navy mit Schild-Logo ─────────── */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl"
        style={{
          background: 'rgba(13,27,62,0.72)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          backdropFilter: 'saturate(180%) blur(24px)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(123,163,204,0.18) 50%, transparent 100%)',
          }}
        />
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
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
                Gutachter
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {[
              { href: '#vorteile', label: 'Vorteile' },
              { href: '#so-funktioniert-es', label: "So funktioniert's" },
              { href: '#app', label: 'Die App' },
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
          <Link
            href="/gutachter/willkommen"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4573A2] px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(69,115,162,0.5)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_6px_18px_rgba(123,163,204,0.55)] active:scale-[0.97]"
          >
            Jetzt bewerben
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Hintergrund-Glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[#4573A2]/20 blur-[120px]" />
          <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-[#1E3A5F]/40 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 sm:py-36">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/40 bg-[#4573A2]/10 px-4 py-1.5 text-sm font-semibold text-[#7BA3CC]">
            <Star className="h-3.5 w-3.5 fill-[#7BA3CC]" />
            Deutschlands führendes KFZ-Gutachter-Netzwerk
          </div>

          <h1
            className="mx-auto max-w-4xl text-balance text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-6xl md:text-7xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Mehr Aufträge.{' '}
            <span className="bg-gradient-to-r from-[#7BA3CC] to-[#4573A2] bg-clip-text text-transparent">
              Weniger Verwaltung.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-white/65 sm:text-xl">
            Claimondo übernimmt Akquise, Koordination und Abrechnung.
            Du begutachtest — wir regeln den Rest.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/gutachter/willkommen"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_12px_36px_rgba(123,163,204,0.50)] active:scale-[0.98]"
            >
              Jetzt als Gutachter bewerben
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#so-funktioniert-es"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              Mehr erfahren
            </a>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <div className="text-3xl font-extrabold text-white">{s.value}</div>
                <div className="mt-1 text-xs text-white/50">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Vorteile ───────────────────────────────────────── */}
      <section id="vorteile" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">Warum Claimondo?</div>
            <h2
              className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Alles was du brauchst —{' '}
              <span className="text-[#7BA3CC]">nichts was du nicht willst</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/50">
              Konzentriere dich auf dein Handwerk. Den Rest erledigt Claimondo.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VORTEILE.map((v) => {
              const Icon = v.icon
              return (
                <div
                  key={v.title}
                  className="group rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all hover:border-[#4573A2]/50 hover:bg-white/8"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4573A2]/20">
                    <Icon className="h-6 w-6 text-[#7BA3CC]" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{v.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Fallbeispiele ─────────────────────────────────── */}
      <section className="border-y border-white/10 bg-[#060e1f] py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">Warum deine Arbeit zählt</div>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Echte Fälle. Echte Unterschiede.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-white/50">
              Das ist der Unterschied zwischen einem Versicherungs-Gutachter und dir.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {FALLBEISPIELE.map((f) => (
              <div
                key={f.fahrzeug}
                className={`relative overflow-hidden rounded-3xl border ${f.borderFarbe} bg-gradient-to-br ${f.farbe} bg-white/5 p-6 backdrop-blur`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                    {f.tag}
                  </span>
                  <span className="text-xs font-bold text-white/40">{f.fahrzeug}</span>
                </div>

                <p className="text-sm leading-relaxed text-white/55">{f.situation}</p>

                <div className="my-4 border-t border-white/10" />

                <p className="text-sm leading-relaxed text-white/80">
                  <span className="font-semibold text-white">Ergebnis nach unabhängigem Gutachten:</span>{' '}
                  {f.ergebnis}
                </p>

                <div className="mt-4 rounded-2xl bg-white/5 p-4">
                  <div className="text-3xl font-black tracking-tight text-white">{f.verlust}</div>
                  <div className="mt-1 text-xs text-white/50">{f.verlustText}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-white/30">
            Quellen: NDR-Reportage „Versicherungs-Gutachter vs. unabhängige Sachverständige" · BGH VI ZR 65/18 · BGH VI ZR 174/24
          </p>
        </div>
      </section>

      {/* ── So funktioniert's ──────────────────────────────── */}
      <section id="so-funktioniert-es" className="border-y border-white/10 bg-[#0a1428] py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center">
            <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">Der Weg zum ersten Auftrag</div>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              In 4 Schritten startklar
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {SCHRITTE.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={s.nr} className="relative">
                  {i < SCHRITTE.length - 1 && (
                    <div className="absolute left-[calc(50%+2rem)] top-6 hidden h-px w-full bg-gradient-to-r from-[#4573A2]/40 to-transparent lg:block" />
                  )}
                  <div className="text-center">
                    <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#4573A2]/40 bg-[#4573A2]/15">
                      <Icon className="h-7 w-7 text-[#7BA3CC]" />
                      <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4573A2] text-[10px] font-black text-white">
                        {s.nr.slice(1)}
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/50">{s.text}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/gutachter/willkommen"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-8 py-4 text-base font-bold text-white shadow-xl shadow-[#4573A2]/30 transition-all hover:bg-[#7BA3CC]"
            >
              Jetzt starten — kostenlos bewerben
              <ArrowRight className="h-5 w-5" />
            </Link>
            <p className="mt-3 text-sm text-white/40">Bewerbung dauert ca. 5 Minuten · Freischaltung in 48h</p>
          </div>
        </div>
      </section>

      {/* ── App-Features ──────────────────────────────────── */}
      <section id="app" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7BA3CC]">Die Claimondo-App</div>
              <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                Dein digitales Büro —{' '}
                <span className="text-[#7BA3CC]">immer dabei</span>
              </h2>
              <p className="mt-4 text-lg text-white/55">
                Vom Auftragseingang bis zur Abrechnung: alles läuft über die Claimondo-Plattform.
                Kein Papierkram, keine Excel-Tabellen, kein Chaos.
              </p>

              <ul className="mt-8 space-y-3">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-white/70">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[#4573A2]" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mock App-Screen */}
            <div className="relative">
              <div className="rounded-3xl border border-[#4573A2]/30 bg-[#0D1B3E] p-6 shadow-2xl shadow-[#4573A2]/10">
                {/* Fake App UI */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#7BA3CC]">Heute, 09:15</div>
                    <div className="text-lg font-bold text-white">3 neue Aufträge</div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4573A2]/20">
                    <BarChart3 className="h-5 w-5 text-[#7BA3CC]" />
                  </div>
                </div>

                {[
                  { name: 'BMW 520d · Köln-Ehrenfeld', km: '4,2 km', time: '10:30 Uhr', status: 'Neu' },
                  { name: 'VW Passat · Düsseldorf-Mitte', km: '12 km', time: '14:00 Uhr', status: 'Bestätigt' },
                  { name: 'Audi A4 · Bonn-Beuel', km: '28 km', time: '16:30 Uhr', status: 'Neu' },
                ].map((a, i) => (
                  <div
                    key={i}
                    className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{a.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-white/40">
                        <MapPin className="h-3 w-3" /> {a.km}
                        <span>·</span>
                        <Calendar className="h-3 w-3" /> {a.time}
                      </div>
                    </div>
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      a.status === 'Neu'
                        ? 'bg-[#4573A2]/30 text-[#7BA3CC]'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {a.status}
                    </div>
                  </div>
                ))}

                <div className="mt-4 flex gap-2">
                  <div className="flex-1 rounded-xl bg-[#4573A2]/20 p-3 text-center">
                    <div className="text-2xl font-extrabold text-white">€2.840</div>
                    <div className="text-[10px] text-white/40">Honorar Mai</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-emerald-500/10 p-3 text-center">
                    <div className="text-2xl font-extrabold text-emerald-400">12</div>
                    <div className="text-[10px] text-white/40">Aufträge Mai</div>
                  </div>
                </div>
              </div>

              {/* Dekorativ */}
              <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#4573A2]/15 blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonial / Trust ───────────────────────────── */}
      <section className="border-y border-white/10 bg-[#0a1428] py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="flex justify-center gap-1 text-[#7BA3CC]">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-[#7BA3CC]" />
            ))}
          </div>
          <blockquote className="mt-6 text-2xl font-semibold italic leading-relaxed text-white sm:text-3xl">
            &ldquo;Seit ich bei Claimondo bin, habe ich 40 % mehr Aufträge als vorher.
            Die App spart mir täglich zwei Stunden Verwaltungszeit.&rdquo;
          </blockquote>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4573A2] text-sm font-bold text-white">
              MS
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Michael S.</div>
              <div className="text-xs text-white/40">Öbuv. Kfz-Sachverständiger · München · 3 Jahre bei Claimondo</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Finales CTA ───────────────────────────────────── */}
      <section className="py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Users className="mx-auto mb-4 h-12 w-12 text-[#4573A2]" />
          <h2
            className="text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Bereit? Dann leg los.
          </h2>
          <p className="mt-4 text-lg text-white/55">
            Die Bewerbung dauert 5 Minuten. Unser Team meldet sich innerhalb von 24 Stunden.
            Freischaltung in 48 Stunden.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/gutachter/willkommen"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-9 py-4 text-lg font-bold text-white shadow-[0_12px_36px_rgba(69,115,162,0.55)] transition-all duration-200 hover:bg-[#7BA3CC] hover:shadow-[0_16px_44px_rgba(123,163,204,0.60)] active:scale-[0.98]"
            >
              Kostenlos bewerben
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-white/30">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Keine Gebühren</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Kein Risiko</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Freischaltung in 48h</span>
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
              <span className="ml-2 text-sm text-white/30">Gutachter-Netzwerk</span>
            </div>
            <div className="flex gap-6 text-sm text-white/40">
              <Link href="/" className="hover:text-white">Für Kunden</Link>
              <Link href="/impressum" className="hover:text-white">Impressum</Link>
              <Link href="/datenschutz" className="hover:text-white">Datenschutz</Link>
              <a href="mailto:gutachter@claimondo.de" className="hover:text-white">gutachter@claimondo.de</a>
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-white/20">
            © {new Date().getFullYear()} Claimondo GmbH · KFZ-Schadenmanagement · Deutschlandweit
          </p>
        </div>
      </footer>
    </div>
  )
}
