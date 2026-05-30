# AAR-939 Stream 6/7 — SV-Self-Service-Portal — Implementierungs-Spec

**Datum:** 30.05.2026
**Ticket:** AAR-939 (Monika-Embed) · **Branch dieser Spec:** `kitta/aar-939-sv-portal-spec` (off staging)
**Quelle:** Multi-Agent-Workflow (9 Agenten, ~1,26 M Tokens, read-only, **kein DB-Tool**) + adversarielle Verifikation. Schema-Fakten gegen `git show origin/staging:` (lokaler Checkout war hinter den gemergten aar939-Files).
**Scope-Lock (Aaron):** Monika = Anfrage → Lead → Termin. Kein Claim/Fall/Auftrag. Variante A (free, `embed_free`) = WhatsApp-only. Variante B (70 € netto/Termin) = Dispatch + Custom-Theme.
**Status der Verifikation:** Beide Skeptiker-Verdikte = **mit Vorbehalt / high** — die Roh-Synthese hatte einen **Killer** (unten), der hier korrigiert ist. Diese Fassung ist die geprüfte.

---

## TL;DR

- **Mount:** Neue Top-Level-Route-Gruppe **`src/app/sv-portal/`** (Option A), schlanke eigene Shell auf `shared/portal-nav/PortalNav` — **nicht** unter `/gutachter/` (GutachterShell ist 700-Zeilen-Cockpit-Ballast: Feldmodus/Map/FAB/Wetter). Auth via `requirePortalAccess(['sachverstaendiger','admin'])`.
- **Stream 6 (embed-sites-Wizard):** **jetzt baubar, ohne DB** — `embed_sites` ist gemergt (#2012), alle Writes laufen über Server-Actions mit `createAdminClient`. Keine neue Migration nötig.
- **Stream 7 (SV-Lead-Inbox):** braucht **ein** neues DB-Artefakt (eine spaltenreduzierte View `v_sv_inbox`) → **gated auf DB-Sperre-Aufhebung**. **Owner-Scope MUSS über `embed_site_id` laufen** (NICHT `zugeordneter_sv_id` — das ist der Killer).
- **2 echte Build-Blocker** + ~10 Entscheidungen (unten).

> ## 🔴 Killer, den die Verifikation gefangen hat
> Der naheliegende Owner-Link für die Inbox — `zugeordneter_sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id=auth.uid())` — ist **funktional tot**: `zugeordneter_sv_id` ist auf **jeder** `source='sv_embed'`-Zeile **NULL**. Verifiziert: der Stream-2-Webhook `insertAnfrage` *(src/lib/embed/anfrage.ts:117-148)* setzt `embed_site_id`/`source`/`variante`, aber **nie** `zugeordneter_sv_id` — diese Spalte schreibt ausschließlich der native Funnel *(gutachter-finder-actions.ts:198, svMatching.ts:133)*.
> **Korrekter Scope (erprobtes `embed_pos_sv_select`-Muster, Migration 154425):**
> ```sql
> source = 'sv_embed'
> AND embed_site_id IN (SELECT id FROM embed_sites WHERE inhaber_profile_id = auth.uid())
> ```
> Traversiert Anfrage → embed_site → Inhaber. `embed_site_id` IST gesetzt (vom Webhook). Ohne diesen Fix: Inbox liefert 0 Zeilen für jeden SV.

---

## 1 · Mount + Auth — Option A (empfohlen)

Neue Top-Level-Gruppe `src/app/sv-portal/`, parallel zu `/gutachter`, `/dispatch`, `/admin`, `/kanzlei`. Begründung: inhaltlich getrennte Funktion (Embed-Admin + Lead-Inbox + Whitelabel-Config) vs. `/gutachter/` Tagesgeschäft.

- **Auth-Guard:** `requirePortalAccess(['sachverstaendiger','admin'])` *(src/lib/auth/portal-guard.ts:49)* — `admin` als Test-Fallback wie `/dispatch`. ⚠️ Siehe Admin-Fallback-Hinweis unter Stream 7.
- **SV-Identität:** `getGutachterForUser(supabase, user.id, 'id, brand_primary, brand_secondary')` *(src/lib/gutachter.ts:23, `.limit(1).maybeSingle()` wegen Mehrfach-SV)*. ⚠️ `brand_accent`/`brand_logo_url` **vor Build live prüfen** — nicht in getrackter Migration belegt (nur `brand_primary`/`brand_secondary` getypt; kanonisch ist `sachverstaendige.brand_theme` jsonb).
- **Shell:** neue schlanke `SVPortalShell` auf `shared/portal-nav/PortalNav` (light, 2 Items: „Embed-Sites", „Anfragen"). **Claimondo-neutral** (interne Tool-Chrome, kein Whitelabel — AGENTS.md). Layout mit `MitteilungenProvider` wrappen (wie `dispatch/layout.tsx:18`).
- **Kein** `portal_zugang_freigeschaltet`-Hard-Gate (Self-Service unabhängig vom Cockpit-Onboarding) — **Aaron-Entscheidung**.
- **Erreichbarkeit:** Link aus `/gutachter/profil`-Account-Dropdown („Meine Embed-Sites & Anfragen"), kein neuer Cockpit-Sidebar-Eintrag.

*Verworfen:* Option B (Sub-Route unter `/gutachter/`) — erzwingt Cockpit-Chrome + koppelt an `portal_zugang`-Gate. Option C (Subdomain `sv.`) — Auth-Migration out-of-scope (Memory `feedback_subdomains`).

---

## 2 · Datengrundlage `embed_sites` (gemergt #2012, Migration 154349)

19 Spalten. Kern für Wizard + RLS:
- `id` uuid PK · `slug` text **UNIQUE** (= `data-site-id` im Widget, `?site_id=slug`) · `inhaber_profile_id` uuid **NOT NULL** FK `profiles` (= **RLS-Owner-Key** `auth.uid()`) · `sv_id` uuid FK `sachverstaendige` (Theme-Quelle).
- `name` NOT NULL · `variante` NOT NULL DEFAULT `'A'` CHECK A|B · `einzelpreis_eur` numeric DEFAULT 70.00.
- `brand_primary_override` / `_secondary_override` / `_accent_override` / `brand_logo_url_override` (nullable; NULL = erbt `sachverstaendige.brand_*`; nur Variante B wirksam).
- `empfaenger_email` NOT NULL DEFAULT `info@claimondo.de` · `cc_email` · `baileys_routing_nummer` **NOT NULL** (⚠️ Build-Blocker, s.u.; im Config-Endpoint bewusst NICHT geleakt).
- `erlaubte_domains` text[] NOT NULL DEFAULT `'{}'` (Origin-Allowlist) · `max_anfragen_pro_h` int DEFAULT 20 · `aktiv` bool DEFAULT true · `paused_grund`.
- `agb_akzeptiert_am` + `agb_version` (Q7-Consent-Snapshot, Variante B) · `tracking_*` (Stream 8b, ungenutzt) · `anfragen_gesamt`/`letzte_anfrage_am` (Telemetrie).

**RLS:** `embed_sites_admin_all` (is_admin ALL) · `embed_sites_owner_select` (SELECT `inhaber_profile_id=auth.uid()`) · **KEIN authenticated INSERT/UPDATE/DELETE** (default-deny → alle Writes via `service_role`). Read-Helper existiert: `ladeEmbedSite(slug)` *(src/lib/embed/anfrage.ts)*.

> ⚠️ **`embed_sites` fehlt in `database.types.ts`** (auch auf staging) → Server-Actions/Reads brauchen das `createAdminClient() as any`-Cast-Idiom (wie `route.ts` es dokumentiert), bis `generate_typescript_types` lief. `brand_primary`/`_secondary` auf `sachverstaendige` **sind** getypt → der `getGutachterForUser`-Brand-Select funktioniert ohne Cast.

---

## 3 · Stream 6 — Embed-Sites-Wizard (✅ JETZT baubar, ohne DB)

3-Step-Wizard (Blaupause: `admin/sachverstaendige/anlegen/BueroAnlegenWizard.tsx` — `STEPS`-Array, `validateStepN`, `fieldErrors`-Set statt silent-disabled-Button).

- **Step 1 — Basis & Domains:** `name`, `slug` (client `[a-z0-9-]`, UNIQUE-Konflikt erst per Action-Result), `erlaubte_domains` (Multi-Input → `primitives.Badge`+`CloseButton`-Chips), `empfaenger_email`, `cc_email`. Felder via `shared/forms/TextField`.
- **Step 2 — Variante & Branding:** Segmented A vs B. **A:** Theme-Picker + Logo **disabled** + Upgrade-Hint; Override-Werte bleiben im Form-State (für A→B). **B:** Color-Picker für `brand_*_override` (Default aus `getGutachterForUser`), Logo-Override. **Q7-Consent (nur B):** Checkbox „Ich akzeptiere die Kooperations-AGB (Version {hash})" → blockt „Weiter" bis gesetzt; Action schreibt `agb_akzeptiert_am`+`agb_version`.
- **Step 3 — Zusammenfassung & Snippet:** Read-only-Review → Submit → Snippet `<script src="https://claimondo.de/embed/monika.js" data-site-id="{slug}"></script>` + Copy-Button.

### ⚠️ Theme-Live-Preview — korrigiert (WYSIWYG)
Die Roh-Synthese wollte `hydrateTheme + generateCssVars('full')` (30 `--brand-*`-Vars) rendern. **Aber** der reale Stream-5-Config-Endpoint *(api/embed/config/route.ts)* liefert dem Widget ein **flaches 4-Feld-Objekt** `{primary, accent, text, logoUrl, brandedByClaimondo}` — kein hydratisiertes Theme. → Die Preview muss **dieses flache Modell** spiegeln (sonst sieht der SV im Wizard ein reicheres Theme als sein Widget tatsächlich rendert). Mapping wie der Endpoint: `primary = override ?? sv.brand_primary ?? CLAIMONDO_DEFAULT`, analog accent; `text = brand_secondary_override ?? CLAIMONDO_DEFAULT.text`. Variante A: Endpoint erzwingt ohnehin Claimondo-Default → Preview zeigt Default. Preview-Atoms (`primitives.Card/Button/Text`) erben `var(--brand-*)` — **kein handgerolltes Tailwind, keine inline-Hex** (Whitelabel-Gating-Memory: Brand-Smoke `--brand-primary→navy` muss durchschlagen).

### Pflicht-Gates der Server-Actions (createAdminClient → RLS-Bypass!)
- `inhaber_profile_id = user.id` **serverseitig** setzen (nie aus Client).
- `update`/`toggleAktiv`: **`WHERE inhaber_profile_id = auth.uid()`** prüfen — sonst IDOR auf fremde Sites (service_role umgeht RLS).
- `variante`, `einzelpreis_eur`, `sv_id`, `baileys_routing_nummer`, `agb_*` **nie** blind aus Client (Mass-Assignment, Live-RLS-Audit-12.05.-Klasse).
- Bei `variante='B'`: `agb_akzeptiert_am` serverseitig erzwingen (sonst Consent/Billing-Bypass per direktem Action-Call).
- `slug`-UNIQUE-Violation als `{ok:false,error:'Slug vergeben'}` abfangen, nicht throwen (Server-Action-Pattern).

---

## 4 · Stream 7 — SV-Lead-Inbox (braucht 1 DB-Artefakt → DB-Sperre)

- **Datenquelle:** `gutachter_finder_anfragen` (Reuse, keine neue Tabelle), `source='sv_embed'`, Join `embed_sites(name,slug)` über `embed_site_id`.
- **Owner-Scope — korrigiert:** `embed_site_id IN (SELECT id FROM embed_sites WHERE inhaber_profile_id=auth.uid())` (NICHT `zugeordneter_sv_id`).
- **Empfehlung statt Voll-Zeilen-Policy: eine spaltenreduzierte `SECURITY INVOKER`-View `v_sv_inbox`.** Grund (beide Skeptiker): eine `FOR SELECT`-Policy auf die ganze Zeile gäbe dem SV Sicht auf `gclid`/`utm_*`/`page_url`/`origin_domain` (Marketing-Attribution) — `column-REVOKE` wirkt **nicht** bei `table-GRANT` (Live-RLS-Audit-Lesson). Eine View mit ~15 fachlichen Spalten löst die Datenschutz-Frage sauber. → **Aaron-Entscheidung:** View (empfohlen) vs. Voll-Policy.
- **UI:** `sv-portal/anfragen/page.tsx` Server-Component → `PageHeader` + Status-Filter-Chips (`ui/Chip`, `?status=embed_free|neu`, Pattern `dispatch/leads/page.tsx:63`) + `shared/DataTable` (Name, Telefon, Schadentyp, Wunschtermin, Quelle-Site, Status-Badge, Datum) + `ClickableTr` → Detail-Drawer + `shared/EmptyState`.
- **Billing-Hinweis:** bei Variante B + `abrechnungs_relevant` → `abrechnungs_betrag_eur` (70 €) read-only anzeigen.
- **Status-Semantik:** A = `embed_free`, B = `neu`. „Qualifiziert"-Definition offen (s. Entscheidungen).

> ⚠️ **DB-Sperre:** Das `v_sv_inbox`-Artefakt (View **oder** Policy) ist die **einzige** DB-Änderung von Stream 6/7 und muss via **Supabase-Plugin `apply_migration`** (AGENTS.md Regel 2, Twin-Drift-konformes File) — **derzeit gesperrt.** Stream 6 braucht es nicht; Stream 7 ist ohne es nicht funktionsfähig (SV sähe 0 Zeilen). → Stream 7 nach Sperre-Aufhebung.
>
> ⚠️ **Admin-Test-Fallback:** Ein `admin`-User hat keine `sachverstaendige.profile_id`-Row → die gescopte Inbox liefert ihm 0 Zeilen, während `is_admin()` ihm via `gfa_admin_select` ALLE (auch native) zeigt. → In der Query `source='sv_embed'` auch für Admin erzwingen, oder die Abweichung dokumentieren.

---

## 5 · Reuse (Pflicht) + Komponenten-Set

`requirePortalAccess` · `getGutachterForUser` · `roleToPath` · `shared/portal-nav/PortalNav` · `MitteilungenProvider` · **`shared/DataTable`** (Inbox + Sites-Liste) · `shared/forms/TextField`+`SelectField` · `PageHeader` · `SectionCard` · `EmptyState` · `AvatarUpload` (Logo, SVG prüfen) · **`primitives/*`** (Button/Card/Modal/Badge/Text/Box/Stack/CloseButton — kein Raw-Tailwind) · `ui/Chip` (Filter) · `lib/branding/theme.ts`+`css-vars.ts` (Preview) · `lib/embed/anfrage.ts`→`extractHost` (Domain-Normalisierung, Schreib- **und** Leseseite teilen!) · `createAdminClient` · Blaupausen `BueroAnlegenWizard` (Wizard) + `dispatch/leads/page.tsx` (Inbox).

⚠️ **Kein `shared/StepIndicator`** (nur `GlassStepIndicator`, glass-spezifisch). `BueroAnlegenWizard` nutzt inline-STEPS ohne Indicator. → Entweder `GlassStepIndicator` adaptieren **oder** neuen solid `shared/StepIndicator` als Composite extrahieren (>2 Consumer). **Kein** `primitives/Checkbox` → Q7-Consent via `ui/checkbox` (shadcn, web-only erlaubt) oder `GlassCheckboxPill`.

---

## 6 · File-Plan

| Pfad | Zweck |
|---|---|
| `src/app/sv-portal/layout.tsx` | Auth (`requirePortalAccess`) + `getGutachterForUser` + `SVPortalShell` + `MitteilungenProvider`; kein `portal_zugang`-Gate |
| `src/app/sv-portal/SVPortalShell.tsx` | `'use client'` schlanke Shell auf `PortalNav` (2 Items), Claimondo-neutral |
| `src/app/sv-portal/page.tsx` | Redirect/Dashboard (2 StatCards: aktive Sites, offene Anfragen) |
| `src/app/sv-portal/embed-sites/page.tsx` | Sites-Liste (DataTable + EmptyState), `owner_select`-RLS |
| `src/app/sv-portal/embed-sites/EmbedSiteWizard.tsx` | 3-Step-Wizard (A/B-Gating, Q7, Live-Preview), Edit-Modus |
| `src/app/sv-portal/embed-sites/ThemePreview.tsx` | Flat-4-Feld-Preview (WYSIWYG zum Config-Endpoint) |
| `src/app/sv-portal/embed-sites/DomainListInput.tsx` | `erlaubte_domains`-Multi-Input (Badge-Chips) |
| `src/app/sv-portal/embed-sites/actions.ts` | `'use server'` create/update/toggle — IDOR-/Mass-Assignment-Gates (s. §3) |
| `src/app/sv-portal/embed-sites/[id]/page.tsx` | Edit/Detail + Snippet + Billing-Positionen (read-only) |
| `src/app/sv-portal/anfragen/page.tsx` | Stream 7 Inbox (DataTable + Chips) — **gated auf `v_sv_inbox`** |
| `src/app/sv-portal/anfragen/AnfrageDetailDrawer.tsx` | Read-only Detail-Drawer |
| `src/lib/embed/site-write.ts` | Form→Row-Mapping (slug-Regex) — **`extractHost` importieren**, nicht reimplementieren |
| `supabase/migrations/<recorded>_aar939_v_sv_inbox.sql` | **NEU, DB-gated:** spaltenreduzierte `v_sv_inbox` (SECURITY INVOKER, `embed_site_id`-Scope) — via Plugin |

---

## 7 · 🔴 Build-Blocker + Entscheidungen für Aaron

**Build-Blocker (müssen vor Bau geklärt sein):**
1. **`baileys_routing_nummer` (NOT NULL):** Woher beim Site-Anlegen? SV-Default-Spalte auf `sachverstaendige` (welche?) **oder** pro Site im Wizard eingeben? Ohne Quelle schlägt jeder `INSERT` fehl.
2. **Stream 7 `v_sv_inbox`** = neues DB-Artefakt → braucht DB-Sperre-Aufhebung (Stream 6 unabhängig baubar).

**Entscheidungen:**
3. Inbox-Sicht: **View `v_sv_inbox`** (spaltenreduziert, empfohlen — verbirgt gclid/utm) vs. Voll-Zeilen-Policy?
4. „Qualifiziert"-Definition: jede `sv_embed`-Zeile (empf.) vs. erst `konvertiert_zu_lead_id NOT NULL`? Sollen `embed_free`-(A)-Zeilen überhaupt in die Inbox?
5. `portal_zugang_freigeschaltet`-Gate weglassen (Self-Service, empf.) vs. übernehmen?
6. Mount-Erreichbarkeit: Account-Dropdown-Link (empf.) vs. Cockpit-Sidebar vs. nur URL?
7. AGB-Versions-Quelle/-Hash für Q7 (bestehende Abrechnungs-AGB vs. separate Monika-AGB)?
8. Logo Variante B: `AvatarUpload` (JPEG/PNG/WebP, kein SVG) vs. URL-Eingabe vs. SVG-Upload bauen? (`brand_logo_url_override` impliziert SVG.)
9. SV-Portal-Chrome: Claimondo-neutral (empf.) vs. gebrandet?
10. `tracking_*`-Felder im Wizard (Phase-2-Step) oder vorerst weglassen?
11. StepIndicator: `GlassStepIndicator` adaptieren vs. neuen solid `shared/StepIndicator` extrahieren?

---

## 8 · Risiken (verifiziert)
- **IDOR/Mass-Assignment** via `service_role`-Writes — Pflicht-Gate, DB schützt hier nicht (§3).
- **Stream-7 ohne `v_sv_inbox` tot** (0 Zeilen) — und `zugeordneter_sv_id` wäre der falsche Scope (Killer).
- **Types laggen** (`embed_sites`) → Cast-Idiom, Build-Gate beachten.
- **Snippet** referenziert `monika.js` (Stream 4 #2035, noch offen) — Wizard baubar, Live-Funktion hängt an Stream-4-Merge.
- **`brand_accent`/`brand_logo_url`** Existenz unbelegt → vor Build live prüfen (nicht aus Memory).

---

*Erstellt im isolierten Worktree (Session e00ee6d8), Branch `kitta/aar-939-sv-portal-spec`. Read-only Analyse, kein DB-Tool (Sperre eingehalten). Adversarielle Verifikation hat den `zugeordneter_sv_id`-Killer + 5 weitere Korrekturen eingebracht; diese Fassung ist die geprüfte.*
