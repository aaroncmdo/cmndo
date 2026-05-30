# HANDOFF — SV-Self-Service-Portal (Monika 6/7) + Login-Embed

**Session:** e00ee6d8 · **Datum:** 30.05.2026 · **Für:** die nächste Session, die hier ansetzt.
**TL;DR:** Drei Stränge gebaut/entschieden, alle in PRs gegen `staging` (ich bin **nicht** die Merge-Session → warten auf Merge). Beide Worktrees sind clean, alles gepusht.

---

## Cross-Reference-Tabelle

| Strang | PR | Branch | Spec/Plan-Doc | Status |
|---|---|---|---|---|
| **A · SV-Self-Service-Portal** (Monika Stream 6/7) | **#2051** | `kitta/aar-939-sv-portal-spec` | `docs/30.05.2026/AAR-939-stream6-7-sv-portal-spec.md` | gebaut, Gates grün, **wartet Merge** |
| **B · Stream 3b** (Lead→Termin) | — (kein PR) | — | `docs/29.05.2026/AAR-939-stream3b-lead-termin-reader-entscheidung.md` | **nur entschieden**, NICHT gebaut (98044b6b-Territorium) |
| **C · Login-Embed** | **#2057** | `kitta/aar-login-embed` | `docs/30.05.2026/AAR-login-embed-plan.md` | L1+L2+L3a gebaut, Gates grün, **wartet Merge** |

**Worktrees** (beide clean, alles gepusht): `.claude/worktrees/aar-939-sv-portal-spec`, `.claude/worktrees/aar-login-embed`.
**Memory:** `project_aar939_stream3b_sv_portal.md` (im MEMORY.md-Index).

---

## A · SV-Self-Service-Portal (Monika Stream 6/7) — PR #2051

Das ist „der Login" aus der Eingangsfrage (in der 560dd033-Triage als SV-Self-Service-Portal aufgelöst). Sitzt **hinter der bestehenden SV-Auth** (`requirePortalAccess(['sachverstaendiger'])`) — kein neuer Login.

**Gebaut:**
- **Stream 6** (Embed-Sites-Verwaltung): `src/app/sv-portal/` — Layout + `SVPortalShell` + Landing + Liste (`EmbedSitesList`) + 3-Step-Wizard (`EmbedSiteWizard` + `ThemePreview` + `DomainListInput`) + Server-Actions (`embed-sites/actions.ts`) + `src/lib/embed/site-write.ts`. Einstieg: Card auf `/gutachter/profil`.
- **Stream 7** (SV-Lead-Inbox): `sv-portal/anfragen/page.tsx` + Migration **`supabase/migrations/20260530133433_aar939_sv_inbox.sql`** (View `v_sv_inbox` security_invoker + RLS-Policy `gfa_select_sv_own`). **Live appliziert** (Plugin, getrackte Version 20260530133433, advisor-clean).

**Killer (adversariell gefangen):** Inbox-Owner-Scope läuft über **`embed_site_id → embed_sites.inhaber_profile_id`**, NICHT `zugeordneter_sv_id` (die ist bei `sv_embed` immer NULL → wäre 0 Zeilen gewesen).

**Offen / nächste Schritte:**
- **Daten-Smoke** der Inbox: rendert aktuell EmptyState (0 live `sv_embed`-Anfragen). Echter Smoke kommt mit der ersten Live-Monika-Site.
- **Produktentscheidungen (Spec §7, nicht-blockierend):** AGB-Versions-Quelle für Q7 (aktuell Platzhalter `monika-koop-agb-2026-05` in `site-write.ts`), Logo-SVG-Handling, `gclid/utm`-Sichtbarkeit in der Inbox.
- **Branding-Edge:** der Config-Endpoint erzwingt bei Variante A Claimondo-Default-Theme — falls der Login-Button (Strang C) auch auf A-Sites SV-gebrandet sein soll, kleiner Config-Tweak nötig.
- `baileys_routing_nummer` = zentrale Claimondo-WA-Nummer aus ENV (`KFZ_LP_BAILEYS_TARGET` — beim Bau gegen den Baileys-Send-Code bestätigen).

---

## B · Stream 3b — Lead→Termin (ENTSCHIEDEN, nicht gebaut)

Doc: **`docs/29.05.2026/AAR-939-stream3b-lead-termin-reader-entscheidung.md`** (verifizierte Entscheidungsvorlage). **98044b6b** baut das (Monika-Builder, Branch `kitta/aar-939-monika-billing`).

**Gelockte Entscheidungen:**
- **Reader = Option A** (kein View-Umbau): lead-only-Termin sichtbar über Heute-Tab + Nav-Badge + `/gutachter/termine/[id]`; nur das Kalender-Grid bleibt lead-blind.
- **CMM-25-Mine (kritisch):** Cron `cmm25_auto_expire_geblockte_termine` storniert `status='reserviert' AND fall_id IS NULL` nach 1 h → Monika-Termin-Writer muss `status='bestaetigt'` setzen (geforkt, nicht `reserveSvTerminForLead` 1:1).
- **Billing-Trigger:** bei **Besichtigung abgeschlossen** = `gutachter_termine.durchgefuehrt_am` (via `markTerminDurchgefuehrt`), **70 € netto + 19 % USt**, an `gutachter_finder_anfragen.abrechnungs_relevant` + `embed_abrechnung_positionen` (NICHT `gutachter_termine.bezahlt`).
- **Status-Enum-Falle:** `gfa.status` nutzt `termin_bestaetigt`, `gutachter_termine.status` nutzt `bestaetigt` — NICHT verwechseln.
- **Impl-Check:** ist der `durchgeführt`-Hook auftrag-gebunden? Lead-only-Termin braucht ggf. eigenen „Besichtigung abgeschlossen"-Button, sonst feuert das Billing nie.

---

## C · Login-Embed — PR #2057

Ein einbindbares **Login-Widget** (`<script>`) auf alle Marketing-/sonstigen Seiten **außer app.claimondo.de**. **Redirect-Modus** (kein Inline-Modal), **0 Migrationen**. Plan: **`docs/30.05.2026/AAR-login-embed-plan.md`** (revalidiert; alter Plan-Behauptungen wie „2FA-immer", `enabled_widgets`, Inline-Modal als falsch markiert).

**Gebaut:**
- **L1 — `continue`-Param** über alle Login-Pfade: `src/lib/auth/safe-continue.ts` (Open-Redirect-Whitelist, nur `*.claimondo.de`), `src/app/login/{actions.ts,page.tsx,LoginClient.tsx,2fa/page.tsx}`, `src/app/api/auth/callback/route.ts` (Google). 2FA-Hop via kurzlebiges Cookie `cm_login_continue`. Logged-in-Short-Circuit in `/login`.
- **L2 — Bundle** `src/embed/login/index.ts` (vanilla, Shadow-DOM, 1.2 KB gz) + `scripts/build-login-embed.mjs` + `public/embed/claimondo-login.{js,v1.js}` + `tsconfig.json`. Liest `data-site-id` → SV-Branding via bestehenden `/api/embed/config` → gebrandeter Button → Redirect `app.claimondo.de/login?continue=`.
- **L3a — Hauptdomain:** `src/components/landing/LoginCtaLink.tsx` ('use client') + `LandingTopbar.tsx` (anon Anmelden-Button trägt jetzt `continue`).

**Einbau-Snippet** (Aaron baut es selbst auf den LPs ein):
```html
<script src="https://claimondo.de/embed/claimondo-login.js" data-site-id="DEIN-SITE-SLUG" defer></script>
```
Optional: `data-mode="slot"` (+ `<div data-claimondo-login-slot></div>`), `data-label`.

**Offen / nächste Schritte:**
- **L3b** (optional): Bundle in die externen Cluster-LP-Header (`kfz-gutachter-*.de`) einbauen — Aaron macht den Einbau selbst.
- **L4** (Mein-Konto-Toggle) **bewusst gestrichen** (cross-domain Cookie geht nicht; `/api/auth/me` mit Wildcard-CORS + Credentials vom Browser verboten).
- **Mini-Lücke:** `force_password_change`-Pfad reicht `continue` noch nicht durch `/passwort-aendern` → Default-Portal (Edge-of-Edge).
- Eigenes **Linear-Ticket** für den Login-Embed kann Aaron anlegen (Branch ohne Nummer: `kitta/aar-login-embed`).

---

## Koordination & Konventionen

- **98044b6b** (Monika-Builder) besitzt: Widget **Stream 4** (`#2035`, Branch `kitta/aar-939-monika-widget`), **Stream 5** (`#2040`, gemergt), **Billing Stream 8** (Branch `kitta/aar-939-monika-billing`). **6/7 + Login-Embed = diese Session.**
- **Disjunkte Bundles:** `monika.v1.js`/`build-monika.mjs`/`build:embed` (98044b6b) vs `claimondo-login.js`/`build-login-embed.mjs`/`build:embed:login` (hier) — kein Konflikt.
- **Geteilter Touch-Point:** `api/embed-track` `ALLOWED_EVENTS` = `monika_*`-only (98044b6b-Territorium) — Login-Telemetrie würde das anfassen (vorerst weggelassen).
- **Worktree-Build-Flake:** voller `next build` im Worktree wirft sporadisch `EBUSY` beim Standalone-Output-Copy (`.next/standalone/.claude/worktrees/...`). Fix: `rm -rf .next` + retry; ODER „✓ Compiled successfully" + `tsc 0` als Gate-Evidenz (CI baut am Repo-Root sauber). Heap: `NODE_OPTIONS=--max-old-space-size=8192`.
- **Merge:** alle PRs `--base staging`. Diese Session ist NICHT die Merge-Session → PRs warten auf Merge-Session/Aaron.
- **DB:** Migrationen ausschließlich via Supabase-Plugin `apply_migration` (Regel 2); File-Name == getrackte Version.

---

## Priorisierte nächste Schritte

1. **Merge #2051 + #2057** (Merge-Session/Aaron) → dann SV-Portal + Login-Embed live auf staging.
2. **Daten-Smoke** SV-Portal-Inbox, sobald eine Live-Monika-Site eine Anfrage erzeugt (Strang A).
3. **Login-Embed:** Aaron baut `<script>` auf die LPs (L3b); optional `force_password_change`-continue-Lücke schließen.
4. **Stream 3b bauen** (98044b6b) gegen die Entscheidungsvorlage (CMM-25-Fix ist kritisch).
5. **Produktentscheidungen** SV-Portal §7 (AGB-Quelle, Logo-SVG, gclid/utm) — nicht-blockierend.

---

*Erstellt von Session e00ee6d8 (30.05.2026). Alle genannten Docs sind auf den jeweiligen Branches gepusht; PRs #2051 / #2057 sind die Einstiege.*
