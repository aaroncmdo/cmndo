'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { Phone, X, Send, Check, Search, ChevronRight, ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { trackEvent } from '@/lib/analytics/track-event'
import { setUserData } from '@/lib/analytics/user-data'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

const PHONE_TEL = PHONE_E164

// ── Speicher fuer den Einklapp-Zustand ──────────────────────────────────────
// sessionStorage statt localStorage: "ich will die Leiste GERADE nicht" ist eine situative
// Entscheidung, keine dauerhafte Praeferenz. Sie ueberlebt den Seitenwechsel (sonst waere das
// Wegklicken sinnlos) und endet mit dem Besuch. Nach TDDDG §25 Abs. 2 einwilligungsfrei: sie
// stellt genau die Darstellung her, die der Nutzer ausdruecklich verlangt hat.
//
// Als externer Store statt als useState+useEffect, damit der Wert schon beim ersten
// Client-Render feststeht — sonst erscheint die Leiste kurz und springt dann weg.
const SPEICHER_SCHLUESSEL = 'claimondo:kontaktleiste-eingeklappt'
const zuhoerer = new Set<() => void>()

function abonniere(melde: () => void) {
  zuhoerer.add(melde)
  return () => {
    zuhoerer.delete(melde)
  }
}

function leseEingeklappt() {
  try {
    return sessionStorage.getItem(SPEICHER_SCHLUESSEL) === '1'
  } catch {
    return false // privater Modus / Speicher gesperrt — dann eben ohne Merken
  }
}

function setzeEingeklappt(zu: boolean) {
  try {
    if (zu) sessionStorage.setItem(SPEICHER_SCHLUESSEL, '1')
    else sessionStorage.removeItem(SPEICHER_SCHLUESSEL)
  } catch {
    /* s.o. — der Zustand gilt dann nur fuer diese Seite */
  }
  zuhoerer.forEach((melde) => melde())
}

type Props = {
  /** Quellen-Tag damit Dispatch sieht von welcher Seite der Rückruf kam */
  quelle?: string
  /** Wenn gesetzt: persistenter WhatsApp-Button in der Sticky-Bar (Content-Pages). */
  whatsappHref?: string
  /**
   * Ziel des mobilen "Gutachter finden"-Primaer-CTAs. Default = generischer Finder.
   * Der Makler-Hub (/m/[code]) uebergibt den ATTRIBUIERTEN Einstieg (/start/makler/<id>).
   * Ohne das klaut der auffaelligste Mobile-CTA die Makler-Attribution.
   */
  finderHref?: string
}

// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Sticky-Pill mit backdrop-blur,
// rounded-full Buttons, weichen 28-32px Schatten, active:scale Tap-Feedback.
// Modal mit Glass-Backdrop + rounded-Inputs.
export function StickyCallBar({ quelle = 'Hauptseite', whatsappHref, finderHref = '/gutachter-finden' }: Props) {
  const t = useTranslations('home')
  const tNav = useTranslations('nav')

  const zeitfensterOptions = t.raw('sticky_call.zeitfenster_options') as string[]

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [zeitfenster, setZeitfenster] = useState(zeitfensterOptions[0] ?? 'Schnellstmöglich')
  const [nachricht, setNachricht] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Am Seitenende ausblenden. Die Leiste ist `fixed` und verdeckte dort
  // Footer-Inhalt — gemessen 24.08.2026 auf vier Seiten und zwei Breiten je
  // 1 bis 6 Elemente, darunter die TELEFONNUMMER und die E-Mail-Adresse.
  // Also ausgerechnet die Kontaktwege, zu denen sie selbst führen will.
  //
  // ⚠ Platz am Seitenende zu reservieren löst das NICHT (erst versucht, wieder
  // verworfen): der Footer ist auf manchen Seiten höher als der Viewport
  // (1128 px bei 664 px Bildschirm auf /kfz-haftpflicht-schaden). Am Seitenende
  // füllt er den Bildschirm, und zusätzlicher Platz verschiebt nur, WELCHER
  // Teil des Footers unter der Leiste liegt. Auf zwei von vier Seiten wurde es
  // dadurch schlechter statt besser.
  //
  // Wer den Footer erreicht hat, braucht die schwebende CTA ohnehin nicht mehr:
  // dort stehen Telefon und E-Mail im Klartext.
  const [footerSichtbar, setFooterSichtbar] = useState(false)
  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    const beobachter = new IntersectionObserver(
      ([eintrag]) => setFooterSichtbar(eintrag.isIntersecting),
      { threshold: 0.01 },
    )
    beobachter.observe(footer)
    return () => beobachter.disconnect()
  }, [])

  // Dieselbe Ueberlegung wie beim Footer, nur fuer den ECHTEN CTA: die Leiste darf den
  // Absende-Button des Lead-Formulars nicht abfangen.
  //
  // Gemessen 29.08.2026 auf der Startseite bei 1440x900 (die verbreitetste Laptop-Groesse):
  // der Button "Jetzt kostenlosen Rückruf erhalten" liegt bei Dokument-Y 882 — bei 900 px
  // Viewport also knapp unterhalb der Falz. Wer minimal scrollt, um ihn zu sehen, hat ihn
  // in den unteren ~12 % — und dort trafen ALLE DREI Messpunkte (25/50/75 % der Breite)
  // "Sofort anrufen" bzw. "Rückruf" statt des Buttons. Beide fuehren zwar zum Rueckruf,
  // aber das Leiste-Formular startet LEER: Name, Telefon und Ort sind weg.
  //
  // ⚠ Warum Kollision statt "CTA sichtbar -> ausblenden": die Leiste ist selbst ein
  // Conversion-Element. Auf der Startseite steht das Formular im Hero, sie waere also
  // schon beim Laden verschwunden. Geprueft wird deshalb die TATSAECHLICHE Ueberlappung —
  // damit weicht sie genau dann, wenn sie im Weg ist, und sonst nie.
  //
  // ⭐ Aufgefallen ist das erst, NACHDEM die Vorschlagsliste vom Button wegkam (#5744):
  // solange die ueber ihm lag, war SIE das oberste Element. Ein Fehler kann einen zweiten
  // maskieren — nach einem Fix neu messen, nicht nur den Fix bestaetigen.
  const leisteRef = useRef<HTMLDivElement>(null)
  const [ctaKollision, setCtaKollision] = useState(false)
  useEffect(() => {
    // Design-Aufnahme 05.09.2026 (Playwright, document.elementFromPoint auf 1.155 Seiten):
    // der Submit-Button war nur EIN Opfer. Verdeckt waren ausserdem der Hero-CTA
    // "Lassen Sie uns mit der Versicherung reden" (Startseite, 390x844, OHNE Scrollen),
    // die Felder Name/Telefon/PLZ des Lead-Formulars (1280x720 und 1440x900, Stadtseite
    // Koeln) und die Antwort "Noch unklar" im /check-Wizard. Geprueft wird deshalb jedes
    // Feld und jeder Knopf des Lead-Formulars, jeder Hero-CTA (data-tracking *-hero bzw.
    // hero-*) und alles, was eine Seite mit data-sticky-bar-avoid markiert.
    const ZIELE = [
      '[data-tracking^="lead-form"] input',
      '[data-tracking^="lead-form"] select',
      '[data-tracking^="lead-form"] textarea',
      '[data-tracking^="lead-form"] button',
      '[data-tracking$="-hero"]',
      '[data-tracking^="hero-"]',
      '[data-sticky-bar-avoid]',
      '[data-sticky-bar-avoid] a[href]',
      '[data-sticky-bar-avoid] button',
      '[data-sticky-bar-avoid] input',
    ].join(',')
    let angefordert = false
    const pruefe = () => {
      angefordert = false
      const leiste = leisteRef.current
      if (!leiste) return
      const l = leiste.getBoundingClientRect()
      let kollidiert = false
      for (const ziel of document.querySelectorAll<HTMLElement>(ZIELE)) {
        if (leiste.contains(ziel)) continue
        const b = ziel.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (b.bottom > l.top && b.top < l.bottom && b.right > l.left && b.left < l.right) {
          kollidiert = true
          break
        }
      }
      setCtaKollision(kollidiert)
    }
    const geplant = () => { if (!angefordert) { angefordert = true; requestAnimationFrame(pruefe) } }
    pruefe()
    window.addEventListener('scroll', geplant, { passive: true })
    window.addEventListener('resize', geplant)
    return () => {
      window.removeEventListener('scroll', geplant)
      window.removeEventListener('resize', geplant)
    }
  }, [])

  // Die Leiste weicht, wenn der Footer da ist ODER sie den echten CTA verdecken wuerde.
  const automatischWeg = footerSichtbar || ctaKollision

  // ── Vom Nutzer eingeklappt ────────────────────────────────────────────────
  // Aaron 30.08.: die Leiste soll sich zur Seite wegschieben lassen. Das ist die dritte
  // Ebene neben den beiden automatischen — Footer-Naehe und CTA-Kollision entscheidet die
  // Seite, das Einklappen entscheidet der Nutzer, und seine Entscheidung schlaegt beide.
  //
  // Gelesen wird ueber useSyncExternalStore statt ueber einen useEffect. Zwei Gruende:
  //   1. `setState` synchron in einem Effect ist seit react-hooks v6 ein Lint-Fehler
  //      ("can trigger cascading renders") — und die Regel hat recht, es ist genau der
  //      Umweg, den dieser Hook ersetzt.
  //   2. Der Wert steht schon beim ERSTEN Client-Render fest. Mit dem Effect-Umweg waere
  //      die Leiste erst da und wuerde danach wegspringen.
  const eingeklappt = useSyncExternalStore(abonniere, leseEingeklappt, () => false)

  // Waehrend der Bewegung bleibt die Leiste im DOM, danach fliegt sie raus — sonst sind
  // Telefon-Link und Buttons ausserhalb des Bildes weiter per Tastatur erreichbar.
  // Abgeleitet statt eigener Effect: aus dem Speicher gelesen ist `faehrtGerade` false,
  // die Leiste ist also sofort weg (kein Einfahren bei jedem Seitenaufruf).
  const [faehrtGerade, setFaehrtGerade] = useState(false)
  const ausgehaengt = eingeklappt && !faehrtGerade

  function klappen(zu: boolean) {
    if (zu) {
      setFaehrtGerade(true)
      window.setTimeout(() => setFaehrtGerade(false), 340)
    }
    setzeEingeklappt(zu)
  }

  // Sichtbar ist die Leiste nur, wenn weder Automatik noch Nutzer sie wegnehmen.
  const weicht = automatischWeg || eingeklappt

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await erstelleOeffentlichenRueckruf({ name, telefon, zeitfenster, nachricht, quelle })
      if (r.ok) {
        setDone(true)
        // Conversion-Event: Rückruf-Anfrage = Lead (claimondo_rueckruf). Kein
        // Server-Event in public-rueckruf → client-seitig; Consent-Mode-Modeling.
        setUserData({ name, phone: telefon })
        trackEvent('generate_lead', { currency: 'EUR', value: 0, source: 'sticky-rueckruf' })
      } else setError(r.error)
    })
  }

  return (
    <>
      {/* Sticky Bar – Floating-Pill mit Glass-Backdrop */}
      {/* Aussen: nur Positionierung. Die mobile Zentrierung (-translate-x-1/2) muss auf einer
          EIGENEN Ebene bleiben — das Einfahren nutzt ebenfalls translate-x und wuerde sie sonst
          ueberschreiben (die Leiste spraenge beim Einklappen aus der Mitte). */}
      {!ausgehaengt && (
      <div
        ref={leisteRef}
        aria-hidden={weicht}
        className={`fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 ${
          weicht ? 'pointer-events-none' : ''
        }`}
      >
      {/* Innen: die Bewegung. Zwei verschiedene Arten wegzugehen —
          automatisch (Footer/CTA-Kollision) blendet nur aus, damit nichts wandert;
          eingeklappt faehrt zur Seite, weil der Nutzer genau das angestossen hat. */}
      <div
        className={`flex flex-col gap-2 ${
          'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
        } ${
          eingeklappt
            ? 'translate-x-[calc(100%+2rem)] opacity-0 rtl:-translate-x-[calc(100%+2rem)]'
            : automatischWeg
              ? 'opacity-0'
              : 'translate-x-0 opacity-100'
        }`}
      >
        {/* ZEILE 1 — Anruf als Primaeraktion, daneben WhatsApp.
            Aaron 25.08.: "mobil soll der Anruf primaer sein". Das dreht die
            Entscheidung vom 15.06. um, nach der "Gutachter finden" der mobile
            Primaer-CTA war (eigener navy-Button ueber der Leiste).
            Messbarer Anlass: bei 390x844 hatten "Gutachter finden" und
            "Sofort anrufen" am 24.08. EXAKT denselben Kontrast (16,03) und
            damit dieselbe wahrgenommene Prominenz — mobil gab es also gar
            keine erkennbare Primaeraktion. Jetzt traegt der Anruf die Leiste
            (navy, volle Breite, groessere Schrift), der Finder rutscht in
            Zeile 2 auf Weiss. */}
        <div className="flex items-stretch gap-2">
        <a
          href={`tel:${PHONE_TEL}`}
          data-tracking="call-sticky"
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-4 text-base font-bold text-white shadow-[0_8px_28px_rgba(13,27,62,0.34)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_36px_rgba(13,27,62,0.40)] active:scale-[0.97]"
        >
          <Phone className="h-4 w-4" />
          <span>{t('sticky_call.btn_anrufen')}</span>
          <span className="font-normal opacity-75">{PHONE_DISPLAY}</span>
        </a>
        {/* Dunkle Schrift auf dem WhatsApp-Gruen, nicht weisse: weiss auf
            #25D366 ergibt 1,98:1 und verfehlt die 4,5:1 fuer normalen Text
            deutlich (am gerenderten Output gemessen, 14 von 32 Messungen).
            Navy darauf sind 8,29:1. Die Kanalfarbe bleibt unangetastet —
            WhatsApp setzt in den eigenen Chat-Bubbles ebenfalls dunkle Schrift
            auf helles Gruen; die Wiedererkennung haengt an der Flaeche, nicht
            an der Schriftfarbe. */}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_24px_rgba(37,211,102,0.34)] transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ backgroundColor: '#25D366' }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z" />
            </svg>
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}
        </div>
        {/* ZEILE 2 — die beiden Nebenwege, sichtbar untergeordnet (Weiss statt Navy).
            Der Finder bleibt bewusst STEHEN und wird nur zurueckgestuft: ueber
            `finderHref` laeuft die Makler-Attribution (/start/makler/<id>) und
            der Ortsbezug der Stadtseiten. Ihn ganz zu entfernen haette beides
            gekappt. */}
        <div className="flex items-stretch gap-2">
        <Link
          href={finderHref}
          data-tracking="finder-sticky"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/85 px-5 py-3 text-sm font-semibold text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white active:scale-[0.97] md:hidden"
        >
          <Search className="h-4 w-4" aria-hidden />
          {tNav('gutachter_finden')}
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 rounded-full border border-white/60 bg-white/85 px-5 py-3 text-sm font-semibold text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white hover:shadow-[0_12px_32px_rgba(13,27,62,0.18)] active:scale-[0.97]"
        >
          {t('sticky_call.btn_rueckruf')}
        </button>
        {/* Wegschieben. Sitzt IN dieser Zeile, nicht darueber: eine eigene Zeile haette die
            Leiste hoeher gemacht — das Gegenteil dessen, wofuer der Griff da ist. `items-stretch`
            der Zeile gibt ihm die volle Hoehe, w-11 die Breite: 44x44 als Touch-Ziel.
            Glas statt Navy, weil er eine Bedienhilfe ist und kein Angebot — die Leiste soll
            nicht an drei Stellen zugleich rufen. */}
        <button
          type="button"
          onClick={() => klappen(true)}
          aria-label={t('sticky_call.einklappen_aria')}
          aria-expanded={true}
          className="flex w-11 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/85 text-claimondo-ondo shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white hover:text-claimondo-navy active:scale-[0.95]"
        >
          <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden />
        </button>
        </div>
      </div>
      </div>
      )}

      {/* Der Griff, der zurueckholt. Eigenes fixed-Element, damit er stehen bleibt, waehrend
          die Leiste hinausfaehrt.
          ⚠ BEWUSST ein Chevron und KEIN Telefon: ein Telefon-Symbol am Bildrand liest sich wie
          "hier anrufen" — der Klick klappt aber nur wieder aus. Das waere eine eingebaute
          Fehlklick-Einladung, ausgerechnet bei einer Zielgruppe unter Stress.
          48px, also ueber dem geforderten 44px-Touch-Ziel. */}
      <button
        type="button"
        onClick={() => klappen(false)}
        aria-label={t('sticky_call.ausklappen_aria')}
        aria-expanded={false}
        className={`fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/90 text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.16)] backdrop-blur-md sm:right-6 rtl:left-4 rtl:right-auto sm:rtl:left-6 ${
          'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
        } ${
          eingeklappt && !automatischWeg
            ? 'translate-x-0 opacity-100 hover:bg-white active:scale-[0.95]'
            : 'pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0 rtl:-translate-x-[calc(100%+1.5rem)]'
        }`}
      >
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
      </button>

      {/* Modal – Glass-Backdrop + glassy Sheet */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-md sm:items-center"
          style={{ background: 'rgba(13,27,62,0.45)' }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl border border-white/40 bg-white/95 p-6 shadow-[0_24px_64px_rgba(13,27,62,0.30)] sm:rounded-ios-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ WebkitBackdropFilter: 'blur(24px)' }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-claimondo-ondo transition-colors hover:bg-claimondo-bg"
              aria-label={t('sticky_call.close_aria')}
            >
              <X className="h-5 w-5" />
            </button>

            {done ? (
              <div className="py-8 text-center">
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'rgba(34,160,107,0.15)' }}
                >
                  <Check className="h-6 w-6" style={{ color: 'var(--brand-success, #22A06B)' }} />
                </div>
                <h3
                  className="text-xl font-bold text-claimondo-navy"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {t('sticky_call.success_heading')}
                </h3>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  {t('sticky_call.success_sub')}
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
                >
                  {t('sticky_call.btn_schliessen')}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h3
                    className="text-xl font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {t('sticky_call.modal_heading')}
                  </h3>
                  <p className="mt-1 text-sm text-claimondo-ondo">
                    {t('sticky_call.modal_sub')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_name')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_telefon')}
                  </label>
                  <input
                    type="tel"
                    required
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    autoComplete="tel"
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_telefon')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_zeitfenster')}
                  </label>
                  <select
                    value={zeitfenster}
                    onChange={(e) => setZeitfenster(e.target.value)}
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:outline-none"
                  >
                    {zeitfensterOptions.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_nachricht')}
                  </label>
                  <textarea
                    value={nachricht}
                    onChange={(e) => setNachricht(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_nachricht')}
                  />
                </div>

                {error && (
                  <p className="rounded-ios-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(13,27,62,0.22)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_32px_rgba(13,27,62,0.30)] active:scale-[0.98] disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {pending ? t('sticky_call.btn_submit_pending') : t('sticky_call.btn_submit')}
                </button>

                <p className="text-center text-[11px] text-claimondo-ondo/70">
                  {t('sticky_call.datenschutz_note')}
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
