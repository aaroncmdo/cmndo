import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { TopbarAuthCta } from './TopbarAuthCta'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/shared'
import { MobileNav } from './MobileNav'

// AAR-462 F4: Topbar der öffentlichen Landing-Page.
// - Eingeloggte User sehen einen Smart-CTA „Zu meinem Portal →" (rollen-spezifisch).
// - Anonyme User sehen den klassischen „Anmelden"-Button.
// AAR-463 F5: LanguageSwitcher integriert. i18n-SEO: aktives Locale + Wechsel
// laufen jetzt ueber next-intl (useLocale + Locale-URL), kein locale-Prop mehr.
// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Schild-Icon + Wortmarke statt
// Text-Logo, dünner Hairline-Border, backdrop-blur-xl, sanfte Hover-Animations.
// i18n Wave A: nav.* Namespace via getTranslations — Dropdown-Labels + Menu-Items
// kommen aus de.json; hrefs bleiben unverändert.
export type AuthenticatedUser = {
  /** Rolle-spezifischer Portal-Pfad aus roleToPath() */
  portalPath: string
  /** Anzeige-Name (Profilname oder Email-Fallback) */
  displayName: string
}

type Props = {
  authenticatedUser: AuthenticatedUser | null
  /**
   * Ziel aller "Gutachter finden"-CTAs. Default = generischer Finder.
   * Der Makler-Hub (/m/[code]) uebergibt hier den ATTRIBUIERTEN Einstieg
   * (/start/makler/<id>) — sonst klaut der Header-CTA die Makler-Attribution
   * (kein promotion_code_id -> keine Provision).
   */
  finderHref?: string
}

const PILL =
  'relative rounded-full px-3.5 py-1.5 text-sm font-medium text-claimondo-ondo transition-all duration-200 hover:bg-claimondo-navy/5 hover:text-claimondo-navy'

function NavDropdown({
  label,
  hubHref,
  items,
}: {
  label: string
  hubHref: string
  items: ReadonlyArray<{ href: string; label: string }>
}) {
  return (
    <div className="group relative">
      <Link
        href={hubHref}
        aria-haspopup="true"
        className={`${PILL} inline-flex items-center gap-1 group-focus-within:bg-claimondo-navy/5 group-focus-within:text-claimondo-navy`}
      >
        {label}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
          aria-hidden
        />
      </Link>
      {/* Panel: pt-2 als Hover-Brücke (kein Gap-Close zwischen Trigger und Panel) */}
      <div className="invisible absolute left-0 top-full z-50 translate-y-1 pt-2 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="min-w-[264px] overflow-hidden rounded-ios-lg border border-claimondo-border bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(13,27,62,0.18)] backdrop-blur-xl">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="block rounded-ios-md px-3 py-2 text-sm font-medium text-claimondo-ondo transition-colors hover:bg-claimondo-navy/5 hover:text-claimondo-navy"
            >
              {it.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// Doc 35 Fix 2: „Ratgeber" + „Gutachter" als Cluster-Dropdowns im Header (Mega-
// Gateways zu Wissens-Cluster + Gutachter-Themen); „Wie es funktioniert" + „Über
// uns" bleiben einfache Links. „Vorteile"/„FAQ" liegen im Footer.
// Dropdown bewusst rein per CSS (group-hover + group-focus-within) — so bleibt der
// Header eine Server-Komponente. Der Trigger ist ein echter Link zum Hub: Touch/
// Klick navigiert zum Hub (graceful), Panel öffnet zusätzlich bei Maus-Hover und
// bei Keyboard-Fokus (focus-within → tab-bar in die Items).
export function LandingTopbar({ authenticatedUser, finderHref = '/gutachter-finden' }: Props) {
  const t = useTranslations('nav')

  // Menu-Arrays: hrefs kommen aus de.json, bleiben 1:1 übernommen.
  const ratgeberMenu = t.raw('ratgeber_menu') as ReadonlyArray<{ href: string; label: string }>
  const gutachterMenu = t.raw('gutachter_menu') as ReadonlyArray<{ href: string; label: string }>

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/55"
        style={{
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          backdropFilter: 'saturate(180%) blur(24px)',
        }}
      >
        {/* Hairline-Linie als sehr feiner Schatten unter dem Border */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(13,27,62,0.08) 50%, transparent 100%)',
          }}
        />

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Logo: Schild + Wortmarke. Mobile zeigt nur Schild. */}
          <Link
            href="/"
            aria-label="Claimondo Startseite"
            className="group flex items-center gap-2.5"
          >
            <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-[10px] shadow-[0_4px_12px_rgba(13,27,62,0.18)] transition-all duration-200 group-hover:shadow-[0_6px_18px_rgba(13,27,62,0.28)] group-hover:scale-[1.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/claimondo-shield.svg"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9"
              />
            </span>
            <span className="hidden sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/claimondo-wortmarke.svg"
                alt="Claimondo"
                width={140}
                height={22}
                className="h-[22px] w-auto"
              />
            </span>
            <span className="sr-only">Claimondo</span>
          </Link>

          {/* Desktop Nav – feine Pill-Hover + zwei Cluster-Dropdowns (Doc 35 Fix 2) */}
          <nav className="hidden items-center gap-0.5 md:flex">
            <Link href="/wie-es-funktioniert" className={PILL}>
              {t('wie_es_funktioniert')}
            </Link>
            <Link href="/check" className={PILL}>
              {t('check_pruefen')}
            </Link>
            <NavDropdown label={t('ratgeber')} hubHref="/ratgeber" items={ratgeberMenu} />
            <NavDropdown label={t('gutachter')} hubHref="/kfz-gutachter" items={gutachterMenu} />
            <Link href="/ueber-uns" className={PILL}>
              {t('ueber_uns')}
            </Link>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher variant="compact" />
            {/* Doc 35 Fix 1: Primär-Conversion-Ziel (gutachter-finden) als
                sichtbarer Header-CTA. md+ (Desktop); auf Mobile uebernehmen das
                Hamburger-Menue (MobileNav) + der StickyCallBar-Finder-Button. */}
            <Link
              href={finderHref}
              className="hidden items-center gap-1.5 rounded-full bg-claimondo-navy px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(13,27,62,0.25)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_6px_18px_rgba(13,27,62,0.35)] active:scale-[0.97] md:inline-flex"
            >
              {t('gutachter_finden')}
            </Link>
            {/* #18 P4: Sekundär-Finder „Werkstatt finden" — dezenter Outline-Stil, erst ab lg
                (Header-Platz); Mobile übernimmt das Hamburger-Menü (finder2). */}
            <Link
              href="/werkstatt-finden"
              className="hidden items-center gap-1.5 rounded-full border border-claimondo-navy/20 bg-white/70 px-4 py-2 text-sm font-semibold text-claimondo-navy backdrop-blur-sm transition-all duration-200 hover:border-claimondo-navy/40 hover:bg-white active:scale-[0.97] lg:inline-flex"
            >
              {t('werkstatt_finden')}
            </Link>
            {/* Marketing-Login-Persistenz: CTA hydratisiert den Login-Status client-
                seitig (Content-Seiten uebergeben authenticatedUser=null → SSR bleibt
                anonym/Crawler-neutral, Client schaltet Eingeloggte auf „Zu meinem
                Portal"). Klassen + Labels 1:1 wie zuvor. */}
            <TopbarAuthCta
              initialUser={authenticatedUser}
              portalLabel={t('zu_meinem_portal')}
              portalLabelShort={t('portal')}
              portalCtaClassName="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(13,27,62,0.25)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_6px_18px_rgba(13,27,62,0.35)] active:scale-[0.97]"
              loginTriggerClassName="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-semibold text-claimondo-navy backdrop-blur-sm transition-all duration-200 hover:border-claimondo-navy/15 hover:bg-white active:scale-[0.97]"
            />

            {/* Mobile (< md): Hamburger-Menue mit allen Nav-Punkten + Finder-CTA */}
            <MobileNav
              links={[
                { href: '/wie-es-funktioniert', label: t('wie_es_funktioniert') },
                { href: '/check', label: t('check_pruefen') },
                { href: '/ueber-uns', label: t('ueber_uns') },
              ]}
              ratgeber={{ hubHref: '/ratgeber', label: t('ratgeber'), items: ratgeberMenu }}
              gutachter={{ hubHref: '/kfz-gutachter', label: t('gutachter'), items: gutachterMenu }}
              finder={{ href: finderHref, label: t('gutachter_finden') }}
              finder2={{ href: '/werkstatt-finden', label: t('werkstatt_finden') }}
              menuLabel="Menü"
              closeLabel="Schließen"
            />
          </div>
        </div>
      </header>
      {/* Sprungziel fuer den "Zum Hauptinhalt springen"-Link aus dem Layout.
          Der Link steht auf JEDER Seite (app/[locale]/layout.tsx), sein Ziel
          #main-content gab es aber nur auf der Startseite (LandingPage.tsx) —
          gemessen am 24.08.2026: 381 von 382 Seiten ohne Ziel. Fuer Tastatur-
          und Screenreader-Nutzer lief der Link damit ins Leere (WCAG 2.4.1).
          Der Anker sitzt hier, weil die Topbar auf allen betroffenen Seiten
          steht und direkt vor dem Inhalt endet. tabIndex={-1} ist noetig, damit
          der Fokus wirklich springt und nicht nur gescrollt wird. */}
      <div id="main-content" tabIndex={-1} />
    </>
  )
}
