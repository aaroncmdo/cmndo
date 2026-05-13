'use client'

// Claimondo Hauptseite — vollständige 12-Sektionen Landing-Page.
// Design: Montserrat (Headings/UI) · Noto Sans (Fließtext via globals.css)
// CI: navy #0D1B3E · ondo #4573A2 · shield #1E3A5F · light-blue #7BA3CC

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Phone, ChevronRight, Check, ChevronDown, ArrowRight,
  Users, MapPin, FileText, Scale, Monitor, Zap, Shield,
  MessageCircle, Star, Clock, Search,
} from 'lucide-react'
import { STAEDTE } from '@/app/kfz-gutachter/staedte'

const PHONE_DISPLAY = '0221 25906530'
const PHONE_TEL = '+4922125906530'
const PHONE_SHORT = '0221 25906530'

// ── Fade-up scroll animation ──────────────────────────────────────────────────
function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el) } },
      { threshold: 0.1 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(22px)',
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Shield SVG watermark ──────────────────────────────────────────────────────
function ShieldWatermark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 110" className={className} aria-hidden="true">
      <path d="M50 4 L92 20 L92 56 C92 78 74 94 50 100 C26 94 8 78 8 56 L8 20 Z"
        fill="none" stroke="#7BA3CC" strokeWidth=".8" />
      <path d="M50 14 L84 27 L84 56 C84 73 69 87 50 92 C31 87 16 73 16 56 L16 27 Z"
        fill="none" stroke="#7BA3CC" strokeWidth=".6" />
      <path d="M32 52 L44 64 L68 40" fill="none" stroke="#7BA3CC"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Section 1 — Hero ──────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-claimondo-navy" aria-labelledby="hero-heading">
      {/* Background radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 110%, rgba(30,58,95,.55) 0%, transparent 70%)',
        }}
      />
      {/* Shield watermark */}
      <ShieldWatermark className="pointer-events-none absolute -right-28 top-1/2 w-[480px] -translate-y-1/2 opacity-[0.04]" />

      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-14 pb-14 pt-16 md:grid-cols-[1fr_400px] md:items-center md:gap-14">

          {/* ── Left: Text ── */}
          <div>
            {/* Live pill */}
            <FadeUp className="mb-6">
              <div className="inline-flex items-center gap-2.5">
                <span
                  className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0"
                  style={{ animation: 'livePulse 2s ease-in-out infinite', boxShadow: '0 0 0 0 rgba(74,222,128,.4)' }}
                />
                <span className="text-sm font-medium text-white/70">
                  Jetzt erreichbar · Antwort unter 15 Min
                </span>
              </div>
            </FadeUp>

            {/* Headline */}
            <FadeUp delay={80}>
              <h1
                id="hero-heading"
                className="text-4xl font-extrabold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl lg:text-[52px]"
              >
                <span className="block">Unfall gehabt?</span>
                <span
                  className="block text-[#F5F1E8]"
                  style={{ textDecoration: 'underline', textDecorationColor: 'var(--brand-secondary, #7BA3CC)', textDecorationThickness: '2px', textUnderlineOffset: '6px' }}
                >
                  Wir regeln Ihren<br className="hidden sm:block" /> KFZ-Schaden.
                </span>
              </h1>
            </FadeUp>

            {/* Subline — Noto Sans via global p rule */}
            <FadeUp delay={160}>
              <p className="mt-5 max-w-[480px] text-lg leading-relaxed text-white/68 font-normal">
                Gutachten, Anwalt, Regulierung —{' '}
                <strong className="font-semibold text-white">0 € für Sie</strong>{' '}
                als Unfallgeschädigten.
              </p>
            </FadeUp>

            {/* CTA Buttons */}
            <FadeUp delay={240} className="mt-9">
              <div className="flex flex-wrap items-stretch gap-4">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="inline-flex items-center gap-3 rounded-xl bg-white px-6 py-4 font-bold text-claimondo-navy shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
                >
                  <Phone className="h-4 w-4 text-claimondo-ondo flex-shrink-0" />
                  <span>
                    <span className="block text-[15px]">Jetzt anrufen</span>
                    <span className="block text-xs font-normal opacity-50 mt-0.5">{PHONE_SHORT}</span>
                  </span>
                </a>
                <Link
                  href="/schaden-melden"
                  className="inline-flex items-center gap-3 rounded-xl border-2 border-white/30 px-6 py-4 font-semibold text-white/88 transition-all hover:border-white/70 hover:bg-white/10"
                >
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  <span>
                    <span className="block text-[15px]">Schaden melden</span>
                    <span className="block text-xs font-normal opacity-50 mt-0.5">Online in 2 Min</span>
                  </span>
                </Link>
              </div>
              <Link
                href="/gutachter-finden"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-claimondo-light-blue/40 bg-claimondo-light-blue/10 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:border-claimondo-light-blue hover:bg-claimondo-light-blue/20"
              >
                <Search className="h-4 w-4 text-claimondo-light-blue" />
                Gutachter in meiner Nähe finden
                <ArrowRight className="h-3.5 w-3.5 text-claimondo-light-blue" />
              </Link>
              <a
                href="https://wa.me/49221XXXXXXX"
                className="mt-4 ml-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/50 transition-colors hover:text-white/80"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp schreiben
              </a>
            </FadeUp>
          </div>

          {/* ── Right: Ansprüche-Card ── */}
          <FadeUp delay={160} className="w-full">
            <div
              className="rounded-[22px] border border-white/10 p-8"
              style={{ background: 'rgba(255,255,255,.05)', backdropFilter: 'blur(20px)' }}
            >
              <div className="mb-5 text-[15px] font-bold text-white">
                Was Ihnen als Unfallgeschädigtem zusteht:
              </div>
              <div className="flex flex-col divide-y divide-white/7">
                {[
                  'Reparatur oder Wiederbeschaffungswert',
                  'Mietwagen oder Nutzungsausfall',
                  'Gutachter- und Anwaltskosten (100 %)',
                  'Merkantile Wertminderung',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 py-3">
                    <Check className="h-[18px] w-[18px] flex-shrink-0 text-emerald-400" strokeWidth={2.5} />
                    <span className="text-[15px] font-medium text-white">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-400">
                  Alles kostenlos — die Versicherung des Unfallverursachers zahlt.
                </p>
              </div>
              <div className="mt-3 border-t border-white/7 pt-3">
                <p className="text-xs italic text-white/40">
                  Unsere Gutachten basieren auf echten DAT-Fahrzeugdaten.
                </p>
              </div>
            </div>
          </FadeUp>

          {/* Trust bar — spans both columns */}
          <FadeUp className="col-span-full">
            <div className="flex flex-wrap items-center gap-6 border-t border-white/12 pt-6 pb-2">
              {[
                { icon: '🛡', text: 'Offizieller DAT-Partner', bold: true },
                { icon: '📍', text: '110+ Gutachter in NRW' },
                { icon: '⭐', text: '5,0 Google Bewertungen' },
              ].map(({ icon, text, bold }, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span>{icon}</span>
                  <span className={`text-sm ${bold ? 'font-semibold text-white/80' : 'text-white/58'}`}>{text}</span>
                  {i < 2 && <span className="ml-6 hidden h-4 w-px bg-white/15 sm:block" />}
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </div>

      <style>{`
        @keyframes livePulse {
          0%   { box-shadow: 0 0 0 0 rgba(74,222,128,.5); }
          70%  { box-shadow: 0 0 0 7px rgba(74,222,128,0); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
        }
      `}</style>
    </section>
  )
}

// ── Section 2 — Zahlen ────────────────────────────────────────────────────────
// 2026-05-10: Glass-Cards statt solid-color-Border-Bug. Vorher waren bg-claimondo-*
// als "accent" gemeint, wurden aber als Background-Util angewendet — Cards waren
// vollflächig ondo/navy/light-blue eingefärbt. Jetzt Glass-Pattern wie der Hero.
const ZAHLEN = [
  { zahl: '2.000+', label: 'Erfolgreich durchgesetzte Fälle' },
  { zahl: '8 Mio. €+', label: 'Schadenssumme erwirkt' },
  { zahl: '32 Tage', label: 'Ø Abwicklungsdauer' },
  { zahl: '< 15 Min', label: 'WhatsApp-Antwortzeit' },
]

function ZahlenSection() {
  return (
    <div className="relative z-10 mx-auto -mt-10 max-w-6xl px-5 sm:px-8">
      <FadeUp>
        <div
          className="rounded-3xl border border-white/60 bg-white/75 p-8 shadow-[0_20px_48px_-8px_rgba(13,27,62,.12)] backdrop-blur-xl"
          style={{ WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}
        >
          <div className="flex flex-col justify-between gap-6 border-b border-claimondo-navy/10 pb-7 sm:flex-row sm:items-start">
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.18em] text-claimondo-ondo"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                Claimondo in Zahlen
              </p>
              <h2
                className="mt-2 text-balance text-2xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-3xl"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                Wir reden nicht — wir liefern.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-claimondo-shield sm:text-right">
              Erfahrungen aus über 2.000 erfolgreich abgewickelten Fällen mit unserer Partnerkanzlei.
            </p>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {ZAHLEN.map(({ zahl, label }, i) => (
              <FadeUp key={zahl} delay={i * 80}>
                <div
                  className="rounded-2xl border border-white/60 bg-white/65 px-5 py-5 shadow-glass-card backdrop-blur-md transition-all duration-200 hover:bg-white/85 hover:shadow-claimondo-lg"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div
                    className="text-3xl font-bold leading-none tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {zahl}
                  </div>
                  <p className="mt-2 text-sm leading-snug text-claimondo-ondo">{label}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </FadeUp>
    </div>
  )
}

// ── Section 3 — Versicherung aufklärung ──────────────────────────────────────
const INFO_CARDS = [
  {
    icon: FileText,
    title: 'Freie Gutachterwahl',
    href: '/vorteile',
    body: 'Sie dürfen Ihren Gutachter selbst wählen. Die gegnerische Versicherung hat kein Mitspracherecht — auch wenn sie Ihnen etwas anderes suggeriert. Nutzen Sie dieses Recht.',
  },
  {
    icon: Scale,
    title: 'Mehr als nur Reparaturkosten',
    href: '/vorteile',
    body: 'Nutzungsausfall, Mietwagen, merkantile Wertminderung, Anwaltskosten — alles zahlt die gegnerische Versicherung. Die wenigsten Geschädigten kennen alle Positionen.',
  },
  {
    icon: Shield,
    title: 'Ab 750 € gilt: Gutachten statt KVA',
    href: '/ersteinschaetzung',
    body: 'Ein vollständiges Gutachten ist Ihr gutes Recht — und deutlich mehr wert als ein Werkstatt-Kostenvoranschlag. Ab ca. 750 € Schaden haben Sie Anspruch auf einen unabhängigen Sachverständigen.',
  },
  {
    icon: Clock,
    title: 'Unterschreiben Sie nichts vorschnell',
    href: '/faq',
    body: 'Das erste Angebot der Versicherung ist selten das vollständige. Wer zu früh unterschreibt, verschenkt oft hunderte Euro. Lassen Sie alles prüfen — bevor Sie zustimmen.',
  },
]

function VersicherungSection() {
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mb-12">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
            Aufklärung
          </p>
          <h2 className="mt-2 max-w-lg text-3xl font-extrabold leading-tight tracking-[-0.03em] text-claimondo-navy sm:text-4xl">
            Was Ihnen die gegnerische Versicherung oft verschweigt.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-claimondo-ondo">
            Vier Dinge, die viele Unfallgeschädigte zu spät erfahren — und die Sie tausende Euro kosten können.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {INFO_CARDS.map(({ icon: Icon, title, href, body }, i) => (
            <FadeUp key={title} delay={i * 80}>
              <Link href={href} className="group flex flex-col gap-0 rounded-2xl border border-claimondo-border bg-white p-7 shadow-[0_1px_3px_rgba(13,27,62,.06)] transition-all hover:-translate-y-0.5 hover:shadow-claimondo-lg">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-claimondo-ondo/[0.06]">
                  <Icon className="h-[18px] w-[18px] text-claimondo-ondo" />
                </div>
                <h3 className="mb-3 text-[17px] font-bold tracking-[-0.02em] text-claimondo-navy">
                  {title}
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-claimondo-ondo mb-5">{body}</p>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-claimondo-navy transition-all group-hover:gap-2">
                  Mehr erfahren <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 4 — Der Claimondo-Unterschied ────────────────────────────────────
const UNTERSCHIED_CARDS = [
  {
    icon: Users,
    sub: 'Persönlicher Kontakt',
    title: 'Ihr persönlicher Schadensberater',
    body: 'Ein fester Ansprechpartner. Von der ersten Sekunde bis zur letzten Auszahlung. Erreichbar per Telefon, WhatsApp und direkt in Ihrem Portal.',
  },
  {
    icon: MapPin,
    sub: 'NRW-weit',
    title: '110+ DAT-Gutachter in NRW',
    body: 'Geprüfte Sachverständige innerhalb von Stunden bei Ihnen. KI-gestützte Vorabkalkulation bereits vor dem Ortstermin.',
  },
  {
    icon: Scale,
    sub: 'Rechtsbeistand',
    title: 'Fachanwälte für Verkehrsrecht',
    body: 'Für einfache Fälle und für komplizierte. Wenn die Versicherung kürzt oder blockiert — unsere Anwälte setzen Ihre vollständigen Ansprüche durch.',
  },
  {
    icon: Monitor,
    sub: 'Live-Status',
    title: 'Ihr digitales Schadens-Portal',
    body: 'Live-Status. Termine. Dokumente. Direktchat. Alles transparent — kein Warten auf Rückrufe. Überall verfügbar, jederzeit einsehbar.',
  },
]

function UnterschiedSection() {
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeUp>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
            Der Claimondo-Unterschied
          </p>
          <h2 className="mt-2 max-w-lg text-3xl font-extrabold leading-tight tracking-[-0.03em] text-claimondo-navy sm:text-[38px]">
            Kein Gutachter. Eine komplette Lösung.
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-claimondo-ondo">
            Vier Bausteine, die Claimondo von jedem klassischen Gutachter unterscheiden.
          </p>
        </FadeUp>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {UNTERSCHIED_CARDS.map(({ icon: Icon, sub, title, body }, i) => (
            <FadeUp key={title} delay={i * 80}>
              <div className="group flex flex-col rounded-2xl border border-claimondo-border bg-white p-6 shadow-[0_4px_12px_rgba(13,27,62,.06)] transition-all hover:-translate-y-0.5 hover:shadow-claimondo-lg">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-claimondo-md border border-claimondo-ondo/15 bg-claimondo-ondo/10">
                  <Icon className="h-6 w-6 text-claimondo-ondo" />
                </div>
                <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-claimondo-ondo">
                  {sub}
                </p>
                <h3 className="mb-2.5 text-base font-bold leading-snug tracking-[-0.02em] text-claimondo-navy">
                  {title}
                </h3>
                <p className="text-[13.5px] leading-relaxed text-claimondo-ondo">{body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 5 — KI-Vorabkalkulation ──────────────────────────────────────────
function KiSection() {
  return (
    <section className="relative overflow-hidden bg-claimondo-navy py-20">
      <div
        className="pointer-events-none absolute -bottom-16 -right-20 h-80 w-80 opacity-[0.04]"
      >
        <ShieldWatermark />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left */}
          <FadeUp>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-light-blue">
              KI-Schadenvorabkalkulation
            </p>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.032em] text-white sm:text-[38px]">
              Wissen Sie schon nach 60 Sekunden, was Ihr Schaden wert ist.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/68">
              Unsere KI berechnet auf Basis echter DAT-Daten eine erste Schadensschätzung — noch bevor ein Gutachter vor Ort war. Kein Formular. Kein Warten. Nur Ihr Kennzeichen und eine kurze Schadensbeschreibung.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {[
                'Echte DAT-Fahrzeugdaten in Echtzeit',
                'Kostenlos und unverbindlich',
                'Ergebnis direkt auf Ihr Handy',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[15px] text-white/82">
                  <Check className="h-[18px] w-[18px] flex-shrink-0 text-emerald-400" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-col items-start gap-3">
              <Link
                href="/schaden-melden"
                className="inline-flex items-center gap-2 rounded-xl bg-claimondo-ondo px-7 py-4 text-base font-semibold text-white transition-all hover:bg-claimondo-shield hover:translate-x-0.5"
              >
                Jetzt Schaden einschätzen lassen
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <span className="text-[13px] text-white/45">
                ⚡ Durchschnittlich 47 Sekunden bis zum ersten Ergebnis
              </span>
            </div>
          </FadeUp>

          {/* Right: KI Widget mockup */}
          <FadeUp delay={120}>
            <div
              className="rounded-[22px] border border-white/10 p-8"
              style={{ background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(20px)', boxShadow: '0 32px 64px rgba(0,0,0,.3)' }}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-claimondo-ondo/30 bg-claimondo-ondo/20 px-2.5 py-1 text-xs font-semibold text-claimondo-light-blue">
                  <Zap className="h-3 w-3" /> DAT KI-Analyse
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-white/60">Kennzeichen</p>
                  <div className="rounded-xl border border-white/12 bg-white/8 px-4 py-3 font-mono text-sm text-white/40">
                    z.B. K-AB 1234
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-white/60">Schadensbeschreibung</p>
                  <div className="h-16 rounded-xl border border-white/12 bg-white/8 px-4 py-3 font-mono text-sm text-white/40">
                    Heckschaden durch Auffahrunfall…
                  </div>
                </div>
              </div>

              <div className="my-5 border-t border-white/10" />

              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-claimondo-light-blue/70">
                Erste Schätzung — Beispielfall
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'Reparaturkosten', val: '3.400 – 4.200 €', main: true },
                  { key: 'Merkantile Wertminderung', val: '320 – 480 €', accent: true },
                  { key: 'Nutzungsausfall', val: '175 – 280 €' },
                  { key: 'Anwaltskosten', val: '340 – 420 €' },
                ].map(({ key, val, main, accent }) => (
                  <div key={key}>
                    <p className="text-xs text-white/55">{key}</p>
                    <p className={`mt-0.5 font-mono text-lg font-bold ${accent ? 'text-claimondo-light-blue' : 'text-white'}`}>
                      {val}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3">
                <span className="text-sm text-white/70">Geschätzter Gesamtanspruch</span>
                <span className="font-mono text-xl font-bold text-emerald-400">4.400 – 5.700 €</span>
              </div>
              <p className="mt-2.5 text-[10px] text-white/30">
                *Basierend auf echten DAT-Daten. Kein verbindliches Angebot.
              </p>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

// ── Section 6 — So funktioniert Claimondo ────────────────────────────────────
const STEPS = [
  { num: 1, icon: Phone, title: 'Sie melden sich', desc: 'Anruf, WhatsApp oder Online-Formular — wie es Ihnen passt.' },
  { num: 2, icon: Users, title: 'Ihr Berater übernimmt', desc: 'Ein fester Ansprechpartner kümmert sich sofort um Ihren Fall.' },
  { num: 3, icon: Shield, title: 'Gutachter vor Ort', desc: 'DAT-zertifizierter Sachverständiger kommt zu Ihnen — meist am nächsten Tag.', active: true },
  { num: 4, icon: Scale, title: 'Anwalt reguliert', desc: 'Unsere Partnerkanzlei übernimmt die vollständige Korrespondenz mit der Versicherung.' },
  { num: 5, icon: Star, title: 'Sie erhalten Ihr Geld', desc: 'Die vollständige Auszahlung direkt auf Ihr Konto. Ø 32 Tage.' },
]

function ProzessSection() {
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeUp className="text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
            So einfach geht's
          </p>
          <h2 className="mx-auto mt-2 max-w-xl text-3xl font-extrabold leading-tight tracking-[-0.03em] text-claimondo-navy sm:text-[36px]">
            Von der ersten Sekunde bis zur vollständigen Auszahlung.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-claimondo-ondo">
            Claimondo übernimmt jeden Schritt — Sie müssen sich um nichts kümmern.
          </p>
        </FadeUp>

        {/* Steps */}
        <div className="relative mt-16">
          {/* Connector line */}
          <div
            className="absolute left-[10%] right-[10%] top-6 hidden h-px lg:block"
            style={{
              background: 'repeating-linear-gradient(90deg, var(--brand-border, #e4e7ef) 0, var(--brand-border, #e4e7ef) 8px, transparent 8px, transparent 14px)',
            }}
          />
          <div className="grid gap-8 lg:grid-cols-5">
            {STEPS.map(({ num, icon: Icon, title, desc, active }, i) => (
              <FadeUp key={num} delay={i * 80}>
                <div className="flex flex-col items-center text-center lg:px-2">
                  <div
                    className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white ${
                      active
                        ? 'bg-claimondo-ondo shadow-[0_0_0_6px_rgba(69,115,162,.15)]'
                        : 'bg-claimondo-navy'
                    }`}
                  >
                    {num}
                  </div>
                  <Icon className="mt-3.5 h-7 w-7 text-claimondo-ondo" strokeWidth={1.8} />
                  <h3 className="mt-3 text-[15px] font-bold leading-snug text-claimondo-navy">{title}</h3>
                  <p className="mt-2 max-w-[160px] text-sm leading-snug text-claimondo-ondo">{desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>

        {/* CTA bar */}
        <FadeUp className="mt-12">
          <div className="flex flex-col items-center justify-between gap-6 rounded-2xl bg-claimondo-navy px-8 py-8 sm:flex-row sm:px-10">
            <div>
              <p className="text-xl font-extrabold tracking-[-0.02em] text-white">Bereit? Wir starten sofort.</p>
              <p className="mt-1 text-sm text-white/60">Kostenlos und unverbindlich — 0 € für Sie.</p>
            </div>
            <a
              href={`tel:${PHONE_TEL}`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-7 py-4 text-[15px] font-bold text-claimondo-navy shadow-[0_4px_16px_rgba(0,0,0,.12)] transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Jetzt Erstberatung starten
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ── Section 7 — Persönlicher Berater ─────────────────────────────────────────
function BeraterSection() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeUp>
          <div className="mx-auto max-w-3xl rounded-2xl border border-claimondo-border bg-claimondo-bg px-8 py-8 sm:px-12">
            <div className="flex flex-col items-center gap-8 sm:flex-row sm:flex-wrap">
              {/* Avatar placeholder */}
              <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-2xl font-extrabold text-white shadow-[0_4px_16px_rgba(13,27,62,.12)]">
                MM
              </div>

              <div className="hidden h-16 w-px bg-claimondo-border sm:block" />

              {/* Text */}
              <div className="flex-1 min-w-[200px]">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
                  Ihr persönlicher Ansprechpartner
                </p>
                <h3 className="mt-1.5 text-[18px] font-bold tracking-[-0.02em] text-claimondo-navy">
                  Marcel M. · Senior Schadensberater
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-claimondo-ondo">
                  Ein fester Ansprechpartner. Von der ersten Sekunde bis zur vollständigen Auszahlung — erreichbar per Telefon, WhatsApp und direkt in Ihrem Portal.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400"
                    style={{ animation: 'livePulse 2s ease-in-out infinite' }}
                  />
                  <span className="text-sm font-medium text-emerald-500">Jetzt verfügbar · Antwort in unter 15 Min</span>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-shrink-0 flex-col gap-2.5">
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-claimondo-navy px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield whitespace-nowrap"
                >
                  <Phone className="h-3.5 w-3.5" /> Jetzt anrufen
                </a>
                <a
                  href="https://wa.me/49221XXXXXXX"
                  className="text-center text-sm font-medium text-claimondo-ondo transition-colors hover:text-claimondo-navy"
                >
                  WhatsApp schreiben →
                </a>
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ── Section 8 — Kundenportal ──────────────────────────────────────────────────
const PORTAL_FEATURES = [
  { icon: Monitor, title: 'Live-Status Ihres Falls', sub: 'Jederzeit sehen, in welcher Phase Ihr Fall ist — vom Gutachten bis zur Auszahlung.' },
  { icon: FileText, title: 'Alle Dokumente an einem Ort', sub: 'Gutachten, Vollmachten, Schriftverkehr — sicher gespeichert und jederzeit abrufbar.' },
  { icon: MessageCircle, title: 'Direktchat mit Ihrem Berater', sub: 'Fragen direkt stellen — kein Telefonmenu, kein Warten auf Rückrufe.' },
  { icon: Clock, title: 'Terminübersicht und Benachrichtigungen', sub: 'Gutachtertermine, Deadlines und Updates — alles auf einen Blick.' },
]

function PortalSection() {
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left: Features */}
          <FadeUp>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
              Ihr digitales Portal
            </p>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.03em] text-claimondo-navy sm:text-[36px]">
              Transparenz vom ersten Tag an.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-claimondo-ondo">
              Kein Warten auf Rückrufe. Keine Ungewissheit. Ihr Fall — live und jederzeit einsehbar.
            </p>
            <div className="mt-8 flex flex-col gap-6">
              {PORTAL_FEATURES.map(({ icon: Icon, title, sub }) => (
                <div key={title} className="grid grid-cols-[40px_1fr] gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-claimondo-ondo/[0.06]">
                    <Icon className="h-[18px] w-[18px] text-claimondo-ondo" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-claimondo-navy">{title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-claimondo-ondo">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/schaden-melden"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-claimondo-navy px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
            >
              Jetzt Portal einrichten <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeUp>

          {/* Right: Browser mockup */}
          <FadeUp delay={120}>
            <div
              className="overflow-hidden rounded-2xl border border-claimondo-border shadow-[0_40px_80px_rgba(13,27,62,.15)]"
              style={{ transform: 'perspective(900px) rotateY(-5deg) rotateX(2deg)', transition: 'transform .3s' }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-0 border-b border-claimondo-border bg-claimondo-bg px-3 py-2.5">
                <div className="flex gap-1.5 mr-3">
                  {['#ff5f57','#ffbd2e','#28c840'].map((c) => (
                    <div key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex-1 rounded-md border border-claimondo-border bg-white px-3 py-1 text-center font-mono text-[11px] text-claimondo-ondo/70">
                  portal.claimondo.de
                </div>
              </div>
              {/* Portal body */}
              <div className="bg-claimondo-bg p-4">
                <div className="mb-3.5 flex items-center justify-between">
                  <p className="text-sm font-bold text-claimondo-navy">Willkommen, Max M.</p>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-claimondo-navy font-mono text-[9px] font-bold text-white">MB</div>
                    <p className="text-[11px] text-claimondo-ondo/70">Ihr Berater</p>
                  </div>
                </div>
                {/* Case card */}
                <div className="rounded-xl border border-claimondo-border border-l-4 bg-white p-3.5" style={{ borderLeftColor: 'var(--brand-success, #10b981)' }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[13px] font-bold text-claimondo-navy">K-AS-2024-0847</span>
                    <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">Aktiv</span>
                  </div>
                  <p className="mb-3 text-xs text-claimondo-ondo/70">BMW 520d · Heckschaden · Köln</p>
                  {/* Progress dots */}
                  <div className="flex items-center gap-1.5">
                    {['Gutachten', 'Anwalt', 'Regulierung', 'Auszahlung'].map((label, i) => (
                      <div key={label} className="flex flex-1 flex-col items-center">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${i < 2 ? 'bg-emerald-500' : i === 2 ? 'h-3.5 w-3.5 bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.2)]' : 'bg-claimondo-border'}`}
                          style={i === 2 ? { animation: 'livePulse 2s infinite' } : {}}
                        />
                        {i < 3 && <div className={`mt-1 h-px w-full ${i < 2 ? 'bg-emerald-500' : 'bg-claimondo-border'}`} />}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between">
                    {['Gutachten', 'Anwalt', 'Regulierung', 'Auszahlung'].map((l) => (
                      <span key={l} className="font-mono text-[9px] text-claimondo-ondo/70">{l}</span>
                    ))}
                  </div>
                </div>
                {/* Mini cards */}
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Nächster Termin', val: '12.05.2026', sub: 'Gutachter vor Ort' },
                    { label: 'Geschätzter Anspruch', val: '6.200 €', sub: 'Inkl. Wertminderung' },
                  ].map(({ label, val, sub }) => (
                    <div key={label} className="rounded-xl border border-claimondo-border bg-white p-3">
                      <p className="font-mono text-[10px] uppercase tracking-[.1em] text-claimondo-ondo/70">{label}</p>
                      <p className="font-mono text-[13px] font-bold text-claimondo-navy">{val}</p>
                      <p className="text-[11px] text-claimondo-ondo/70">{sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

// ── Section 9 — Bewertungen ───────────────────────────────────────────────────
const REVIEWS = [
  {
    initials: 'TM',
    name: 'Thomas M.',
    date: 'März 2026',
    text: 'Unfassbar schnell und kompetent. Gutachter war am nächsten Tag da, die Regulierung lief komplett ohne mein Zutun. Hätte nicht gedacht, dass das so reibungslos funktioniert.',
    color: '#0D1B3E',
  },
  {
    initials: 'SK',
    name: 'Sandra K.',
    date: 'Februar 2026',
    text: 'Die Versicherung hatte mir zuerst nur einen Bruchteil des Schadens angeboten. Claimondo hat am Ende mehr als doppelt so viel rausgeholt. Absolut empfehlenswert.',
    color: '#4573A2',
  },
  {
    initials: 'RP',
    name: 'Ralf P.',
    date: 'Januar 2026',
    text: 'Der feste Ansprechpartner hat alles erklärt und war immer erreichbar. Das Portal ist top — ich konnte jederzeit sehen, was gerade passiert. 5 Sterne ohne Zögern.',
    color: '#1E3A5F',
  },
]

function ReviewsSection() {
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeUp className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
              Das sagen unsere Klienten
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-claimondo-navy sm:text-[36px]">
              Echte Erfahrungen. Echte Ergebnisse.
            </h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-claimondo-border bg-white px-4 py-2 shadow-sm">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="font-mono text-sm font-bold text-claimondo-navy">5,0</span>
            <span className="text-xs text-claimondo-ondo/70">Google</span>
          </div>
        </FadeUp>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {REVIEWS.map(({ initials, name, date, text, color }, i) => (
            <FadeUp key={name} delay={i * 80}>
              <div className="flex h-full flex-col rounded-2xl border border-claimondo-border bg-white p-7 shadow-[0_4px_12px_rgba(13,27,62,.05)] transition-all hover:-translate-y-0.5 hover:shadow-claimondo-lg">
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ background: color }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-claimondo-navy">{name}</p>
                    <p className="text-xs text-claimondo-ondo/70">{date}</p>
                  </div>
                </div>
                <div className="mb-3 flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                {/* Noto Sans via p rule */}
                <p className="flex-1 text-sm italic leading-relaxed text-claimondo-ondo">{text}</p>
                <div className="mt-4 flex items-center justify-between border-t border-claimondo-border pt-3">
                  <span className="text-xs text-claimondo-ondo/70">Verifizierte Google-Bewertung</span>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 10 — NRW Einsatzgebiet ───────────────────────────────────────────
// SEO/internes Linking: die Stadt-Chips verlinken zu den /kfz-gutachter/<slug>-
// Landingpages (Quelle: src/app/kfz-gutachter/staedte.ts) — die Hauptseite ist
// der wichtigste interne Link-Hub auf die lokalen Subpages. Gezeigt werden die
// NRW-Städte; alle Standorte (inkl. bundesweit) hängen am /kfz-gutachter-Index.
const NRW_STAEDTE = STAEDTE.filter((s) => s.bundesland === 'Nordrhein-Westfalen')

function NrwSection() {
  return (
    <section className="relative overflow-hidden bg-claimondo-navy py-20">
      <div
        className="pointer-events-none absolute -left-16 top-1/2 h-96 w-96 -translate-y-1/2 opacity-[0.04]"
      >
        <ShieldWatermark />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <FadeUp>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-light-blue">
              Einsatzgebiet
            </p>
            <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.032em] text-white sm:text-[38px]">
              Überall in NRW — innerhalb von Stunden bei Ihnen.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/68">
              Unser Netz aus über 110 DAT-zertifizierten Gutachtern deckt das gesamte bevölkerungsreichste Bundesland ab. Egal wo in NRW — wir sind schnell vor Ort.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              {NRW_STAEDTE.map((s) => (
                <Link
                  key={s.slug}
                  href={`/kfz-gutachter/${s.slug}`}
                  prefetch={false}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-claimondo-ondo hover:bg-claimondo-ondo/25"
                >
                  <MapPin className="h-3 w-3 text-claimondo-light-blue flex-shrink-0" />
                  {s.name}
                </Link>
              ))}
              <Link
                href="/kfz-gutachter"
                className="inline-flex items-center gap-1.5 rounded-full border border-claimondo-ondo/40 bg-claimondo-ondo/15 px-4 py-2 text-sm font-semibold text-claimondo-light-blue transition-colors hover:border-claimondo-ondo hover:bg-claimondo-ondo/25"
              >
                Alle Standorte
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" />
              </Link>
            </div>

            <div className="mt-10 flex gap-8 border-t border-white/10 pt-8">
              {[
                { n: '110+', l: 'Gutachter in NRW' },
                { n: '< 24h', l: 'Ø Reaktionszeit' },
                { n: '18 Mio.', l: 'Einwohner erreicht' },
              ].map(({ n, l }) => (
                <div key={l}>
                  <p className="font-mono text-2xl font-bold text-white">{n}</p>
                  <p className="mt-1 text-sm text-white/55">{l}</p>
                </div>
              ))}
            </div>
          </FadeUp>

          <FadeUp delay={120}>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-6">
              <div
                className="flex h-60 items-center justify-center rounded-xl border border-white/8 bg-white/3"
                style={{
                  backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.02) 0, rgba(255,255,255,.02) 1px, transparent 0, transparent 50%) 0/8px 8px',
                }}
              >
                <div className="text-center">
                  <ShieldWatermark className="mx-auto h-32 w-32 opacity-30" />
                  <p className="mt-2 font-mono text-xs uppercase tracking-[.15em] text-white/30">
                    NRW Einsatzkarte
                  </p>
                </div>
              </div>
              <p className="mt-3 text-center font-mono text-[11px] tracking-[.08em] text-white/30">
                110+ Gutachter · Gesamtes NRW abgedeckt
              </p>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

// ── Section 11 — FAQ ──────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'Was kostet mich die Beauftragung von Claimondo?',
    a: 'Für Sie als Unfallgeschädigten entstehen keine Kosten. Gutachterkosten, Anwaltshonorar und alle Nebenkosten trägt die Haftpflichtversicherung des Unfallverursachers — das ist gesetzlich so geregelt.',
  },
  {
    q: 'Muss ich meinen Schaden selbst bei der Versicherung melden?',
    a: 'Nein. Sobald Sie sich bei uns melden, übernehmen wir die gesamte Kommunikation mit der gegnerischen Versicherung. Sie müssen nichts weiter tun.',
  },
  {
    q: 'Wie schnell ist ein Gutachter bei mir?',
    a: 'In den meisten Fällen innerhalb von 24 Stunden nach Ihrer Meldung. Unser Netz aus 110+ Gutachtern in NRW ermöglicht schnelle Einsätze ohne lange Wartezeiten.',
  },
  {
    q: 'Was passiert, wenn die Versicherung kürzt oder blockiert?',
    a: 'Dann schalten wir unsere Partnerkanzlei ein. Die Fachanwälte für Verkehrsrecht setzen Ihre vollständigen Ansprüche durch — notfalls vor Gericht. Das kostet Sie ebenfalls nichts.',
  },
  {
    q: 'Gilt das auch bei Teilschuld oder unklarer Haftungslage?',
    a: 'Ja, auch dann lohnt sich eine Prüfung. Wir klären die Haftungsfrage und sichern Ihnen mindestens die anteiligen Ansprüche. Eine kostenlose Erstberatung zeigt Ihnen schnell, was möglich ist.',
  },
]

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="bg-claimondo-bg py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <FadeUp className="mb-12">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-claimondo-ondo">
            Häufige Fragen
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-claimondo-navy sm:text-[36px]">
            Alles, was Sie wissen müssen.
          </h2>
        </FadeUp>
        <div className="flex flex-col gap-2">
          {FAQS.map(({ q, a }, i) => (
            <FadeUp key={i} delay={i * 60}>
              <div
                className={`overflow-hidden rounded-xl border transition-all ${
                  open === i ? 'border-claimondo-ondo shadow-[0_2px_12px_rgba(13,27,62,.08)]' : 'border-claimondo-border'
                } bg-white`}
              >
                <button
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  <span className="text-base font-semibold text-claimondo-navy">{q}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: open === i ? '300px' : '0' }}
                >
                  <div className="border-t border-claimondo-border px-6 pb-5 pt-4">
                    {/* Noto Sans via p rule */}
                    <p className="text-[15px] leading-relaxed text-claimondo-ondo">{a}</p>
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Section 12 — Pre-Footer CTA ───────────────────────────────────────────────
function PreFooterSection() {
  return (
    <section className="bg-claimondo-ondo py-20 text-center">
      <div className="mx-auto max-w-2xl px-5 sm:px-8">
        <FadeUp>
          <h2 className="text-3xl font-extrabold leading-tight tracking-[-0.03em] text-white sm:text-[38px]">
            Bereit? Starten Sie jetzt — 0 € für Sie.
          </h2>
          <p className="mt-4 text-lg text-white/82">
            Kostenlose Erstberatung. Kein Risiko. Claimondo kümmert sich um alles.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={`tel:${PHONE_TEL}`}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy shadow-[0_8px_24px_rgba(0,0,0,.15)] transition-all hover:-translate-y-0.5 hover:shadow-2xl sm:w-auto"
            >
              <Phone className="h-4 w-4" />
              Jetzt anrufen · {PHONE_DISPLAY}
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/40 px-8 py-4 text-base font-semibold text-white transition-all hover:border-white hover:bg-white/10 sm:w-auto"
            >
              Schaden online melden
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────
export function HauptseiteClient() {
  return (
    <>
      <HeroSection />
      <ZahlenSection />
      <VersicherungSection />
      <UnterschiedSection />
      <KiSection />
      <ProzessSection />
      <BeraterSection />
      <PortalSection />
      <ReviewsSection />
      <NrwSection />
      <FaqSection />
      <PreFooterSection />
    </>
  )
}
