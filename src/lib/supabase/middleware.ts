import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { entscheideMfaGate, hatVerifiziertenFaktor } from '@/lib/auth/mfa-gate'
import { validateRememberToken } from '@/lib/auth/twofa/validate-remember-token'
import { createAdminClient } from '@/lib/supabase/admin'

// BUG-83 Befund 7: gleiche Konstante wie in server.ts.
const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// 2026-05-12: Hinter nginx-Reverse-Proxy ist request.url der INTERNE
// Listen-Origin (z.B. http://0.0.0.0:3001). Redirects gebaut mit
// externalUrl(request, '/login') landeten deshalb auf '0.0.0.0:3001/login'.
// Wir bauen die externe URL stattdessen aus den X-Forwarded-Headers,
// fallen auf 'host' zurueck, und erst danach auf request.url (lokaler Dev).
function externalUrl(request: NextRequest, path: string): URL {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    return new URL(path, `${forwardedProto ?? 'https'}://${forwardedHost}`)
  }
  const host = request.headers.get('host')
  if (host) {
    const proto = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return new URL(path, `${proto}://${host}`)
  }
  return new URL(path, request.url)
}

export async function updateSession(request: NextRequest) {
  // AAR-622: Public-Path-Kurzschluss — kein Supabase-Client, kein Auth-Call,
  // kein GoTrue-Hit für Crons (/api/*), Landing-Pages und Login-Flows.
  // Vorher lief getUser() (HTTP-Call zu GoTrue) auf JEDEM Request inkl.
  // der ~15 Cron-Endpoints die alle 5-30 Min feuern → GoTrue-Überlastung.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Collect cookies that need to be set on the response
  const cookiesToUpdate: { name: string; value: string; options: Record<string, unknown> }[] = []

  // BUG-83 Befund 7: User-Wahl "Angemeldet bleiben" wird in cm_remember
  // gespeichert. Bei Refresh-Token-Rotation respektiert die Middleware
  // diese Wahl, sonst wuerden Session-Cookies versehentlich zu langlebigen
  // werden sobald supabase einen Token rotiert.
  const remember = request.cookies.get(REMEMBER_COOKIE_NAME)?.value !== '0'

  // AAR-login-loop: gleiche Domain-Logik wie in server.ts — alle Auth-Cookies
  // auf .claimondo.de setzen damit claimondo.de ↔ app.claimondo.de teilen.
  const cookieDomain = process.env.NODE_ENV === 'production' ? '.claimondo.de' : undefined

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: remember
        ? { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax', domain: cookieDomain }
        : { maxAge: undefined, path: '/', sameSite: 'lax', domain: cookieDomain },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // CRITICAL FIX: Do NOT call request.cookies.set() — it corrupts
          // the cookie store in Next.js 16 proxy and causes TypeError.
          // Instead, collect cookies and apply them only to the response.
          cookiesToUpdate.push(...cookiesToSet.map(c => {
            const opts = c.options ?? {}
            // Wenn remember=false, hartes Session-Cookie erzwingen.
            const finalOpts = remember
              ? { ...opts, domain: cookieDomain }
              : { ...opts, maxAge: undefined, expires: undefined, domain: cookieDomain }
            return {
              name: c.name,
              value: c.value,
              options: finalOpts,
            }
          }))
        },
      },
    }
  )

  // AAR-622: getUser() bleibt für geschützte Pfade — getSession() kann bei
  // abgelaufenem Token null zurückgeben ohne GoTrue zu fragen, was jeden
  // eingeloggten User fälschlicherweise auf /login schickt. Der große Gewinn
  // (Crons, public paths) kommt vom Early-Return oben, nicht von hier.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result?.data?.user ?? null
  } catch {
    user = null
  }

  // Build response — public paths sind bereits oben per Early-Return raus.
  // AAR-111: Reihenfolge gefixt — 2FA-Check MUSS vor Admin-Rollen-Check greifen,
  // sonst umgehen Admin-User den 2FA-Flow komplett solange sie unter /admin/* bleiben.
  let response: NextResponse

  if (!user) {
    // Nicht eingeloggt + geschützter Pfad → /login
    response = NextResponse.redirect(externalUrl(request, '/login'))
  } else {
    // AAR-939: 2FA-Gate auf Supabase-MFA/AAL statt claimondo_2fa_verified-Cookie.
    // Das Assurance-Level steckt im (oben per getUser validierten) Session-JWT und
    // läuft NICHT unabhängig von der Session ab → die alte Reload-Loop-Klasse ist
    // strukturell ausgeschlossen. currentLevel lokal aus dem JWT (kein Netz-Call);
    // hasVerifiedFactor aus user.factors (kommt mit getUser).
    let aalCurrent: 'aal1' | 'aal2' | null = null
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      aalCurrent = aal?.currentLevel ?? null
    } catch {
      aalCurrent = null
    }

    // KFZ-184/AAR-111: 2FA-Check ZUERST (vor dem Admin-Rollen-Check), sonst
    // umgehen Admin-User den 2FA-Flow solange sie unter /admin/* bleiben.
    const gateBasis = {
      isOn2faPage: request.nextUrl.pathname === '/login/2fa',
      isGoogleUser: user.app_metadata?.provider === 'google',
      aalCurrent,
      hasVerifiedFactor: hatVerifiziertenFaktor(user.factors),
    }

    // AAR-auth-haertung: Trusted-Device wird VALIDIERT, nicht nur auf Existenz
    // geprueft. Vorher liess `!!request.cookies.get('claimondo_remember')` jeden
    // beliebigen Cookie-Wert die 2FA umgehen (validateRememberToken war
    // totcode). Jetzt: Hash gegen auth_remember_tokens + User-Bindung +
    // revoked_am + Ablauf. DB-Hit nur, wenn ohne Token ueberhaupt eine
    // Challenge faellig waere (bei aal2 / kein Faktor / Bypass-Pfad: 0 DB-Calls).
    const rememberCookie = request.cookies.get('claimondo_remember')?.value
    let hasRememberToken = false
    if (
      rememberCookie &&
      entscheideMfaGate({ ...gateBasis, hasRememberToken: false }) === 'challenge'
    ) {
      try {
        hasRememberToken = await validateRememberToken(
          rememberCookie,
          user.id,
          createAdminClient(),
        )
      } catch (err) {
        // Fail-closed: bei DB-/Validierungsfehler KEIN Bypass -> 2FA-Challenge.
        console.error('[middleware] validateRememberToken fehlgeschlagen:', err)
        hasRememberToken = false
      }
    }

    const decision = entscheideMfaGate({ ...gateBasis, hasRememberToken })

    if (decision === 'challenge') {
      response = NextResponse.redirect(externalUrl(request, '/login/2fa'))
    } else if (request.nextUrl.pathname.startsWith('/admin')) {
      // 2FA OK → Admin-Rollen-Check (KFZ-203: Dispatch-User darf nicht auf /admin/*)
      const rolle = (user.app_metadata?.rolle ?? user.user_metadata?.rolle) as string | undefined
      if (rolle === 'dispatch') {
        response = NextResponse.redirect(externalUrl(request, '/dispatch/dashboard'))
      } else {
        response = NextResponse.next({ request: { headers: requestHeaders } })
      }
    } else {
      // 2FA OK (oder /login/2fa selbst / Google / kein Faktor) → durchlassen.
      // F2 (AAR-audit-2fa): /gutachter ist NICHT mehr befreit — SV mit Faktor
      // wird oben gechallenged (Enforcement folgt dem Faktor, nicht dem Pfad).
      response = NextResponse.next({ request: { headers: requestHeaders } })
    }
  }

  // Apply collected cookie updates to response
  for (const cookie of cookiesToUpdate) {
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }

  return response
}

// Exportiert NUR fuer den Regressionstest (middleware.test.ts) — die Prefix-Kollisionen
// dieser Allowlist sind Auth-Grenzen, die drei Warn-Kommentare allein nicht gehalten haben.
export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  // Marketing-Premium-Rework 13.05.2026: SEO-Crawler-Endpunkte MÜSSEN
  // unauthenticated erreichbar sein, sonst sieht Googlebot/GPTBot/ClaudeBot
  // beim Fetch der Sitemap/robots.txt einen 307 → /login. Die gesamte
  // Indexierung von claimondo.de wäre damit blockiert.
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt' ||
    pathname === '/opengraph-image' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico'
  ) return true
  // BUG-84 follow-up: /passwort-vergessen + /passwort-zuruecksetzen muessen
  // unauthenticated erreichbar sein, sonst redirected die Middleware den
  // User der gerade auf den Reset-Link in seiner Mail geklickt hat zu /login
  // und der gesamte Reset-Flow ist tot.
  const publicPaths = [
    '/login',
    '/flow',
    '/api',
    '/passwort-aendern',
    '/passwort-vergessen',
    '/passwort-zuruecksetzen',
    // Prefetch-gehaerteter Klick-Gate fuer Magic-Links/Reset (buildWelcomeConfirmLink zeigt
    // hierher). Empfaenger ist per Definition noch nicht eingeloggt -> muss public sein,
    // sonst schickt die Middleware ihn auf /login und der Flow ist tot. Exakter Pfad
    // '/auth/bestaetigen' (NICHT '/auth' — das oeffnete via startsWith fremde /auth/*).
    '/auth/bestaetigen',
    '/sv',
    // AAR-939 Part B2: Claimondo-Hosted-Widget-Seiten /g/[slug] (SVs ohne eigene
    // Website). Public/anon — traegt nur das Monika-Widget. WICHTIG: '/g/' MIT
    // Slash; '/g' wuerde via startsWith auch /gutachter* oeffnen (Auth-Bypass).
    '/g/',
    // Prefix-Kollision (prod-verifiziert 20.07.2026): '/kunde/termin/' MIT Slash.
    // Der Eintrag oeffnet die public Magic-Link-Tracking-Seite /kunde/termin/[token]
    // (WhatsApp-Link fuer SV-Live-Tracking, kein Login noetig).
    // OHNE Slash matchte startsWith auch '/kunde/termine' (Termin-Liste) UND
    // '/kunde/termine/[id]' (Termin-Detail) — beide sind auth-required und laden per
    // createAdminClient() (Service-Role, RLS-umgehend). Anon bekam dort 200-Shells
    // statt 307 -> /login; der Schutz haengt dann allein am Page-Guard, das
    // Middleware-Gate greift gar nicht. Gleiche Disziplin wie '/g/' oben.
    // Der nackte Legacy-Pfad '/kunde/termin' braucht KEINEN Eintrag: next.config.ts
    // faengt ihn per Exakt-Match-308 auf /kunde ab (Config-Redirect laeuft vor der
    // Auth-Middleware).
    '/kunde/termin/',
    // CMM-40: Re-Termin-Slot-Picker via Magic-Link (no-show-timeout-Cron schickt
    // /kunde/re-termin/[token]). Token-Validierung passiert in der Page selbst,
    // kein Login nötig — sonst landet der Empfänger auf /login statt im Picker.
    '/kunde/re-termin',
    // 2026-05-08: Token-basierter Termin-Bestätigungs-Pfad analog zu /sv und /upload —
    // Magic-Link aus Email, kein Login nötig. Token-Validierung in der Action.
    '/kunde-termin',
    // GEO-P2 SP2 (2026-08-05): NPS-Umfrage Magic-Link /kunde-nps/[token] — Post-Abschluss-
    // Kundenbewertung aus Email, kein Login (Token-Validierung in der Action). MIT Slash
    // (Prefix-Disziplin wie '/g/'/'/embed/'): '/kunde-nps' ohne Slash könnte künftige
    // '/kunde-nps<x>'-Routen fälschlich öffnen. Ohne Eintrag: 307 → /login — Regel-4-Prod-
    // Smoke-Befund 05.08.: der anonyme Kunde konnte nicht bewerten.
    '/kunde-nps/',
    // Netzwerk-Followup 03.08.: /werkstatt-empfehlung-Whitelist entfernt — die Route ist
    // retired (Batch-Erzeuger in P4 geloescht, live 0 Batches/0 Empfehlungen je erzeugt;
    // der Kunde waehlt self-served im Kunde-Finder, quelle='gutachter').
    // AAR-956 T1.1b: /anfrage-Whitelist entfernt — die Self-Service-Strecke
    // /anfrage/[token] ist retired (kanonischer Ersatz = /start → /flow). Alt-Links
    // fängt der 301-Redirect in next.config.ts ab (→ /).
    // AAR-956: kanonischer Konversions-Einstieg /start/[anfrageId]?exp=&sig= —
    // HMAC-gateter anon-Redirect (Marketing-Live-Buchung) → konvertiert die Anfrage
    // zum Lead + stellt den /flow-FlowLink aus. Ohne diesen Eintrag landet der
    // anon-Request auf /login statt im Flow (Smoke-Befund 03.06.).
    '/start',
    // AAR-956 Embed: gutachter-finder als Haupt-App-iframe-Embed (/embed/gutachter-finder).
    // Public/anon — Karte + 3-Step-Wizard + Termin-Engine inline, per iframe ueberall
    // einbettbar. MIT Slash ('/embed/') wie '/g/' — ohne Slash wuerde startsWith z.B.
    // ein kuenftiges geschuetztes '/embed-xyz' faelschlich oeffnen (Auth-Bypass).
    '/embed/',
    // AAR-134: SV-Token-Ablehnung via Email-Link (kein Login nötig)
    '/ablehnen',
    // AAR-339: ZB1-Upload-Link (/upload/zb1/[token]) — Kunde hat noch keinen
    // Account beim OCR-Upload; Token-Validierung läuft in der Action selbst
    '/upload',
    '/agb',
    '/nutzungsbedingungen',
    '/datenschutz',
    '/impressum',
    // 2026-05-08: Webform-Lead-Strecke MUSS für anonyme Besucher offen
    // sein — daraus entsteht der Lead, danach Self-Dispatch + Weiterleitung
    // ins Portal. Ohne diesen Eintrag landet der Besucher auf /login und
    // kann gar keinen Schaden melden.
    '/schaden-melden',
    // 2026-05-11: Neue Marketing-Pages aus PR #748 / #749 / #772 — waren
    // in der Allowlist vergessen, anonyme Besucher landeten auf /login.
    '/ersteinschaetzung',
    '/beratung-anfragen',
    '/makler/partner-werden',
    // (/werkstatt-partner-werden retired 2026-08-05 -> next.config-308 auf
    // /werkstatt/registrieren; der Config-Redirect greift VOR der Middleware.)
    // Saeule B: oeffentliche Makler-Selbst-Registrierung — anon MUSS rein, sonst
    // 307 -> /login (analog '/sv' fuer /sv/registrieren). SPEZIFISCHER Pfad, NICHT
    // '/makler' (das wuerde via startsWith das ganze Portal oeffnen = Auth-Bypass).
    '/makler/registrieren',
    // Werkstatt-Selbst-Registrierung (CTA der werkstatt.claimondo.de-Landing).
    // SPEZIFISCHER Pfad, NICHT '/werkstatt' (startsWith wuerde das ganze
    // Werkstatt-Portal oeffnen = Auth-Bypass).
    '/werkstatt/registrieren',
    // Flotten-Self-Signup (05.08., Aaron: Firmen als Partner hinzufuegen) — public
    // Registrier-Flow analog werkstatt/registrieren; SPEZIFISCHER Pfad, kollidiert via
    // startsWith NICHT mit dem geschuetzten '/flotte'-Portal (laengerer Praefix gewinnt).
    '/flotte/registrieren',
    // Prospect-Selbstbuchung Beratungsgespraech ({{Beratungslink}} aus Cold-Mails).
    // Links sind HMAC-signiert (exp+sig); Verify passiert in Route UND Action.
    '/beratung',
    // Makler-Wochenreport One-Click-Abmeldung (public, Token in der URL). Eigener
    // App-Pfad statt '/abmelden' — historisch, weil '/abmelden' in MARKETING_PREFIXES
    // stand und weg-301't wurde (tote Zone). Der Pfad bleibt wie er ist: die Links
    // sind bereits raus, ein Wechsel wuerde sie brechen.
    '/wochenreport-abmelden',
    // Win-back-Opt-out (public, Token in der URL) — Pflicht-Abmeldelink der
    // Reaktivierungs-Mails. Ohne diesen Eintrag 307't die Route auf /login und der
    // Link waere weiterhin tot (der proxy.ts-Fix allein reicht NICHT).
    // startsWith-Radius geprueft: unter /abmelden liegt nur [token] — kein Auth-Bypass.
    '/abmelden',
    // Cold-Mail Opt-out (public, HMAC-Token in der URL) — Ziel des Pflicht-
    // Abmeldelinks + des List-Unsubscribe-Headers. Bewusst EIGENER Pfad neben
    // '/abmelden': andere Suppression-Semantik (cold_mail_suppression vs.
    // leads.winback_opt_out) und eigener Token-Typ (HMAC statt reminder_token).
    '/partner-abmelden',
    // Weitere bestehende Marketing-Pages explizit, damit nichts mehr unbeabsichtigt
    // hinter den Auth-Guard rutscht:
    '/vorteile',
    '/wie-es-funktioniert',
    '/faq',
    '/ueber-uns',
    '/kfz-gutachter',
    '/gutachter-finden',
    '/gutachter-partner',
    '/schadensreport-2026',
    '/sa-volltext',
    // 2026-05-18: kfzgutachter-Ads-Landeseite (A/B-Test Variante B, noindex).
    // Reine Paid-Traffic-Seite — anonyme Besucher müssen sie ohne Login sehen.
    '/kfzgutachter-lp',
    // 2026-05-22: claimondo.de Content-Render-Routen (Doc 16) — 2 Cornerstones,
    // 57 Haftpflicht-Spokes, 10 Versicherer-Brief-Decoder. MÜSSEN für anonyme
    // Besucher + AI-/Such-Crawler offen sein, sonst 307 → /login und die gesamte
    // Indexierung der Wissens-Surface ist tot.
    '/kfz-haftpflicht-schaden',
    '/ratgeber',
    '/haftpflicht',
    '/decoder',
    // 2026-05-23: Pillar-C /sachverstaendige (8 SV-Verband-Spokes + Hub) — wie die
    // Doc-16 Content-Routen offen fuer anonyme Besucher + AI-/Such-Crawler,
    // sonst 307 -> /login und die Indexierung der SV-Surface ist tot.
    '/sachverstaendige',
    // 2026-05-28: Pillar-D Versicherer-Hubs (Sprint 1) — wie die Content-Routen offen
    // fuer anonyme Besucher + AI-/Such-Crawler, sonst 307 -> /login. Deckt /versicherer
    // + /versicherer/[slug] via startsWith.
    '/versicherer',
    // 2026-05-23: Stream-B Konversions-Hub (Doc 26 Stream B) — wie die Content-
    // Routen offen fuer anonyme Besucher + Crawler, sonst 307 -> /login.
    '/kosten-kfz-gutachten',
    // 2026-05-23: Stream-B.2 Konversions-Pages (Doc 26 — Misstrauens-Pages) —
    // offen fuer anonyme Besucher + AI-/Such-Crawler, sonst 307 -> /login.
    '/gegnerische-versicherung-zahlt-nicht',
    '/versicherung-schickt-gutachter',
    '/unverschuldeter-unfall-rechte',
    // 2026-05-23: Stream-B.4 Fahrzeugtyp-Konversions-Pages (Doc 26) —
    // offen fuer anonyme Besucher + AI-/Such-Crawler, sonst 307 -> /login.
    '/motorrad-gutachter',
    '/lkw-gutachter',
    '/e-auto-gutachter',
    // 2026-05-23: Stream-B.6 Tool-Page Unfallskizze (Doc 26) — Page (PDF-Vorlage liegt unter /downloads, per matcher von der Middleware ausgenommen).
    '/unfallskizze',
    // 2026-05-24: Stream-B.5 Cornerstone-Pillar „Unfall was tun" (Doc 26).
    '/unfall-was-tun-als-geschaedigter',
    // Firmen-Flotte Layer 2: NFC-Schadenkarten-Flow fuer Unfallgegner (/schaden/[token]).
    // PUBLIC/anon — Gegner hat keinen Account; der Token ist die Berechtigung
    // (analog /flow und /upload). Ohne diesen Eintrag → 307 → /login.
    '/schaden',
    // Slice 2c: Bestaetigungs-Link aus der SMS an den Unfallgegner
    // (/unfallmeldung/[token]). Ebenfalls PUBLIC/anon — derselbe Gegner, dasselbe
    // Token-ist-die-Berechtigung-Muster. Ohne diesen Eintrag landet er auf /login
    // und die Unfallmeldung an seine Haftpflicht wird nie ausgeloest.
    '/unfallmeldung',
  ]
  return publicPaths.some(path => pathname.startsWith(path))
}
