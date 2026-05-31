# Smoke — Marketing-Split Live-Stand (31.05.2026)

**Kontext:** Nach Merge von PR #2083 (marketing-split Vollausbau) → staging (`eaf6e2393`) → main via Release-PR #2086 (`835c8a225`). Verifikation des **bestehenden Live-Stands** der Marketing-Split auf Prod. Die Marketing-Split laeuft auf Prod (claimondo.de :3006, PM2 `claimondo-marketing`); staging faehrt den Build nicht — daher ist Prod das einzige Smoke-Ziel. Alles read-only GETs.

**Single Entry Point:** `claimondo-marketing/_HANDOFF.md`. Memory: `[[project-marketing-split]]`.

**Ergebnis: GRUEN auf ganzer Linie.** Marketing/App-Trennung beidseitig sauber, Subdomain-Host-Routing greift, Tracking live, Karten laden, App unberuehrt.

---

## 1 · HTTP-Smoke (curl, alle drei Domains)

### A) claimondo.de — Marketing-Build (:3006) — alle 200
| Pfad | Code |
|---|---|
| `/` | 200 |
| `/faq` | 200 |
| `/ueber-uns` | 200 |
| `/gutachter-finden` | **200** (SERVICE_ROLE-abhaengig → `.next/standalone/.env.local`-Symlink intakt, kein 500) |
| `/schaden-melden` | 200 |
| `/gutachter-partner` | 200 |
| `/kfz-gutachter` | 200 |
| `/kfz-gutachter/koeln` | 200 |
| `/datenschutz` | 200 |
| `/impressum` | 200 |

### B) claimondo.de Portal-Pfade → App (Stream-8-Redirects) — alle 301
`/login`, `/admin`, `/kunde`, `/gutachter`, `/dispatch` → **301 → `https://app.claimondo.de/<pfad>`**.

### C) gutachter.claimondo.de — host-routed :3006 (middleware.ts)
| Pfad | Code | Ziel |
|---|---|---|
| `/` | 200 | intern rewrite → `/gutachter-partner` (URL bleibt `/`) |
| `/gutachter-partner` | 301 | → `/` (kanonisch) |
| `/faq` | 301 | → `https://claimondo.de/faq` (Cross-Link Hauptdomain) |

Exakt das `SUBDOMAIN_LANDING`-Schema aus `middleware.ts`.

### D) app.claimondo.de — App (:3000) intakt + Reverse-Redirect
| Pfad | Code | Ziel |
|---|---|---|
| `/` | 307 | → `/login` (App-Auth-Redirect, normal) |
| `/login` | 200 | App rendert |
| `/faq` | 301 | → `https://claimondo.de/faq` (Reverse via `src/proxy.ts`) |

→ **Kein Duplikat:** App leitet Marketing-URLs auf claimondo.de, Marketing leitet Portal-URLs auf die App. Bidirektional, eine kanonische Quelle je Flaeche.

### E) Tracking-Marker auf `claimondo.de/`
- GA4 `G-9YF2W9ZP2S`: present ✓
- googletagmanager-Script: present ✓
- Ahrefs `analytics.ahrefs.com`: present ✓
- Google Consent Mode v2 Default `denied` (`ad_storage`): present ✓
- `<title>`: „Kfz-Schaden digital geregelt — Gutachter, Anwalt & Auszahlung"
- HTML 579 KB (volle Landing rendert serverseitig)

---

## 2 · Screenshot-Analyse (Playwright Desktop 1440×900)

Artefakte in `docs/31.05.2026/smoke-marketing-stand/`. 3/4 mit 0 JS-Fehlern; Landing verifiziert trotz `networkidle`-Timeout (reines Analytics-Artefakt — gtag/Ahrefs halten das Netzwerk dauerhaft „busy", die Seite rendert vollstaendig).

| Shot | Befund |
|---|---|
| `smoke-stand-claimondo-landing.png` | Logo, Nav (Wie es funktioniert/Ratgeber/Gutachter/Ueber uns + „Gutachter finden"-CTA + „Anmelden"), Hero „Adrenalin geht. Anspruch bleibt." mit Schadenbild, „Schaden melden in 30 Sekunden"-Formular. Brand-Navy, Umlaute korrekt. **Voll gerendert.** |
| `smoke-stand-gutachter-finden.png` | **Live-Mapbox-Karte** (Duesseldorf/Duisburg/Essen, Isochrone-Overlay + SV-Marker, OSM-Attribution) → `NEXT_PUBLIC_MAPBOX_TOKEN` live gesetzt (kein Dummy-Token-Fehler). Heading, Termin/Schnell-Anfrage-Toggle, „Zum Termin-Portal"-App-Link (deferred Wizard). |
| `smoke-stand-gutachter-partner-subdomain.png` | gutachter.claimondo.de/ → host-routed Partner-Content: „Werden Sie Claimondo-Partner in Ihrer Region", Waitlist-Formular (Vorname/Nachname/E-Mail/Telefon/PLZ) + „Ihr Gebiet"-Karte (Deutschland, laedt). B2B-„Sie"-Ansprache, Umlaute korrekt. |
| `smoke-stand-app-login.png` | app.claimondo.de/login: „Claimondo", „Melde dich mit deinem Konto an" (du-Form), E-Mail/Telefon/Google-Tabs, Login-Formular, „© 2026 Claimondo GmbH". **App unveraendert intakt.** |

---

## 3 · Verdict + offene Punkte

**Verdict:** Der Live-Stand ist gesund. Die drei Merge-Schritte (feature→staging→main) waren rein additiv/dormant — **Prod wurde nicht angefasst** (laeuft weiter aus dem Stream-7-Tarball, content-identisch zu mainline). Kein Regress, kein 500, kein Duplikat, kein JS-Crash.

**Offen (kein Blocker, aus _HANDOFF.md):**
- **makler. + kfzgutachter. → :3006:** Content noch nicht im Build (laufen weiter auf :3000). Letztes offenes Bauteil des Subdomain-Streams. vhost-Switch je produktionskritisch → separat koordinieren.
- **GADS-AW-ID:** bewusst weggelassen (Aaron 31.05.). Sobald gewuenscht: AW-ID setzen, gtag laedt sie bereits konditional.
- **Deferred:** voller gutachter-finden-Onboarding-Wizard (eigenes Ticket, per App-Link ersetzt).

**Lessons (im Handoff + Memory):**
1. Nach jedem Marketing-Rebuild MUSS der `.next/standalone/.env.local`-Symlink neu (sonst SERVICE_ROLE weg → /gutachter-finden 500).
2. Jeder neue Standalone-Build MUSS ins Root-`tsconfig.json`-`exclude` (sonst zieht der Root-CI-`tsc --noEmit` ihn mit App-Pfad-Aliassen rein → false TS2307/TS2322 — Ursache des #2083-build-fix `1091c30fd`).
