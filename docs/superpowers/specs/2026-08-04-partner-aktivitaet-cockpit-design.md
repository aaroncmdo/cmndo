# Partner-Aktivitäts-Cockpit — Design

**Datum:** 2026-08-04 · **Status:** Design (approved S1–S3, Aaron 04.08.) · **Autor-Session:** 3c886b70

Ein einheitliches, generisches „Cockpit" (Aktivitäts-Feed + Aktions-Leiste) für **jeden Partner-Typ** in dessen Detail-View: SV, Makler, Werkstatt, Flotte.

---

## 1. Motivation & Ist-Zustand (Prod-Audit 04.08., Playwright, 10 Routen)

Auslöser (Aaron): die Partner-Detail-Views sind „eine reine Vollkatastrophe". Empirischer Prod-Audit (staff-Login, echte IDs) ergab: **kein Hard-Crash** (alle 200, kein 500/React-#310/#418/leere-Shell), aber die Katastrophe ist **Inkonsistenz + Redundanz + fehlende Aktivität**:

| Typ | Route(n) | Zustand | Actions | Aktivität |
|---|---|---|---|---|
| **SV** | `/admin/vertrieb/sachverstaendige/[id]` · `/admin/sachverstaendige/[id]` · `/dispatch/sachverstaendige/[id]` | reich (Tabs Stammdaten/Verifizierung/Abrechnungen, Auslastung, Fälle/Tasks) — **3 verschiedene Views** | verify/freischalt (in Tabs) | ❌ |
| **Werkstatt** | `/admin/vertrieb/werkstaetten/[id]` · `/admin/werkstaetten/[id]` | reich (Leistung-KPIs, Zugang/Onboarding) — **2 Views** | Deaktivieren/Sperren/Bearbeiten (Header) | ❌ |
| **Makler** | `/admin/vertrieb/makler/[id]` | dünne Read-Karte — „verwalte weiterhin über die Makler-Liste" | ~keine | ❌ |
| **Flotte** | `/admin/vertrieb/firmen-flotte/[id]` | medium (Stammdaten + „Notizen (intern)"-Textarea + Fahrzeuge) | keine Lifecycle-Actions | ❌ |

**Befunde:**
- **F1 🔴 Inkonsistenz** — 4 Typen = 4 verschiedene Designs + 4 verschiedene Action-Sets, kein kohärentes Partner-Detail-Muster.
- **F2 🟠 Route-Redundanz (Doppel/Tripel-UI)** — SV 3 Routen, Werkstatt 2; derselbe Partner über mehrere zu pflegende Seiten.
- **F3 🟠 Null Aktivitätsverfolgung** in *irgendeiner* View → validiert die Cockpit-Anforderung.
- **F4 🟡 Bug** — Google Maps doppelt geladen auf `/admin/sachverstaendige/[id]` (Console „included multiple times … may cause unexpected errors").
- **F5 🟡 Fragmentierung** — Makler/Flotte verweisen „verwalte über die Liste".

---

## 2. Ziel & Scope

Ein **generisches** Partner-Cockpit, das in **allen 4** Detail-Views (SV/Makler/Werkstatt/Flotte) eingehängt wird und dort einheitlich bietet:
1. **Aktivitäts-Feed** — chronologisch, mischt **manuelle CRM-Einträge** (Anruf/Notiz/Mail/Einstufung) **und automatische System-Events** (freigeschaltet/gesperrt/verifiziert/Lead zugewiesen/Provision/Statuswechsel).
2. **Aktions-Leiste** — typ-abhängiges Set aus CRM- + operativen Aktionen.

**Scope-Entscheidung (Aaron):** alle 4 Typen gleichzeitig, eine generische Shared-Komponente (nicht ein-Typ-zuerst).

**Nicht-Ziel (YAGNI):** kein neues Berechtigungsmodell, keine Migration der reichen Typ-spezifischen Tabs (SV-Verifizierung etc.) — das Cockpit ist **additiv**. Die vollständige Route-Konsolidierung (F2) ist ein **Folge-Schritt** (siehe §8), nicht Teil der Cockpit-Kern-Umsetzung.

---

## 3. Entscheidungen (Brainstorming 04.08.)

- **Inhalt:** volles Cockpit — manuelle CRM-Einträge **+** System-Events in **einem** Feed + **beide** Aktions-Sets. (Aaron: Option 1.)
- **Scope:** alle 4 Partner-Typen, generische Shared-Komponente. (Aaron: „alle 4 gleichzeitig".)
- **Datenmodell:** **A — eine polymorphe `partner_aktivitaeten`-Tabelle** als Single-Source. (Aaron: A.)
- **Notizen-Reconciliation:** der bestehende Einzel-`notizen`-Text bleibt als angepinnte Zusammenfassung; `werkstatt_notizen` wird nach `partner_aktivitaeten` migriert.
- **Oberfläche:** primär die `[id]`-Detail-Seite; dieselbe Komponente kompakt im Drawer (`PartnerCockpit`).
- **Rollen:** staff (admin/dispatch/leadbearbeiter), wie `partner_lead_aktivitaeten`.

---

## 4. Datenmodell

Neue Tabelle **`partner_aktivitaeten`** (Single-Source des Feeds):

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `partner_typ` | text CHECK `('sv','makler','werkstatt','flotte')` | polymorpher Ref |
| `partner_id` | uuid NOT NULL | → `sachverstaendige`/`makler`/`werkstaetten`/`firmen`.id je nach `partner_typ` |
| `typ` | text CHECK | **manuell:** `anruf,notiz,email,einstufung,sonstiges` · **System:** `freigeschaltet,gesperrt,verifiziert,vertrag,lead_zugewiesen,provision,statuswechsel` |
| `text` | text | Freitext / Event-Beschreibung |
| `meta` | jsonb NULL | strukturierte Details (lead_id, betrag, alt→neu-Status …) |
| `ist_system` | boolean NOT NULL default false | true = auto-emittiert |
| `erstellt_von` | uuid NULL REFERENCES profiles(id) ON DELETE SET NULL | null bei System-Events |
| `erstellt_am` | timestamptz NOT NULL default now() | |

- **Index:** `(partner_typ, partner_id, erstellt_am DESC)`.
- **Polymorph** (`partner_typ`+`partner_id`) statt 4 FK-Spalten → passt zur generischen Komponente. **Trade-off:** kein DB-FK/Cascade auf die Partner-Tabelle → Integrität per App (die Write-Action prüft Existenz in der Typ-Tabelle) + RLS.
- **Notizen-Reconciliation:**
  - Der bestehende Einzel-`notizen`-Text pro Partner (`sachverstaendige.notizen`, `makler/werkstaetten.notizen`, via `v_vertrieb_kontakt` vereint) **bleibt** als „angepinnte Zusammenfassung" im Cockpit-Kopf (Zustand, kein Log).
  - **`werkstatt_notizen`** (die einzige Multi-Entry-Notiz-Tabelle) → Einträge einmalig nach `partner_aktivitaeten` (typ=`notiz`, partner_typ=`werkstatt`, erstellt_von=autor_user_id, erstellt_am=created_at) **migrieren**; `werkstatt_notizen` deprecaten (nicht droppen).
  - Neue manuelle Notizen schreiben in `partner_aktivitaeten`.

---

## 5. Komponenten & Oberfläche

Alle generisch unter `src/components/shared/partner/`:

- **`PartnerAktivitaetsFeed`** — Props `{ partnerTyp, partnerId, compact? }`. Liest `partner_aktivitaeten` (partner_typ+id, DESC), rendert die Chronik im Claim-Timeline-Stil (Muster `shared/claims/timeline/TimelineEventCard`). `typ → Icon/Label/Farbe` über die **Status-Registry** (`src/lib/status/`, neue Domain `partner_aktivitaet`, token-safe). `compact` = letzte N + „mehr".
- **`PartnerActionBar`** — Props `{ partnerTyp, partnerId, … }`. Config-getrieben (`PARTNER_ACTIONS[partnerTyp]`), rendert nur die für den Typ gültigen Buttons (Primitives `Button`).
- **`PartnerAktivitaetModal`** — manuelles Erfassen (typ: anruf/notiz/email/einstufung + Text + optionale meta).
- **Server-Actions `partner-aktivitaet-actions.ts`** — `logManuelleAktivitaet({ partnerTyp, partnerId, typ, text, meta })` (staff-gated, Result-Object `{ ok, error }`, `revalidatePath` der Detail-Route).
- **Helper `logPartnerEvent({ partnerTyp, partnerId, typ, text, meta })`** (`src/lib/partner/`) — der System-Event-Writer (service-role, `ist_system=true`, `erstellt_von=null`), aufgerufen aus bestehenden operativen Actions, **fire-and-forget** (try/catch — bricht nie den Haupt-Write).

**Oberfläche / Mount-Points:**
- Primär: je `[id]/page.tsx` (SV/Makler/Werkstatt/Flotte) eine Feed- + ActionBar-Sektion.
- Zusätzlich: der Drawer `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx` bekommt die **kompakte** Variante (`compact`).

---

## 6. Aktions-Set pro Typ (`PARTNER_ACTIONS`)

| Aktion | SV | Werkstatt | Makler | Flotte | Backing |
|---|---|---|---|---|---|
| Notiz | ✅ | ✅ | ✅ | ✅ | `logManuelleAktivitaet` |
| Anruf protokollieren | ✅ | ✅ | ✅ | ✅ | `logManuelleAktivitaet` |
| E-Mail (Vorlage) | ✅ | ✅ | ✅ | ✅ | Mail-Vorlagen-Infra (`VorlagenDrawerHost`/`mail-vorlagen.ts`) |
| Einstufung setzen | ✅ | ✅ | ✅ | ✅ | `updateVertriebFeld` |
| Verifizieren | ✅ | ✅ | — | — | `setzeSvVerifiziert` / `setWerkstattVerifiziert` |
| Freischalten | ✅ | (falls Action) | — | — | `gibBasicSvFrei` |
| Sperren/Entsperren | ✅ | ✅ | — | — | `svSperren`/`svEntsperren` (Werkstatt: Header-Action existiert) |
| Deep-Links (Konto/Karten) | — | — | — | ✅ | bestehende Flotte-Routen |

Jede operative Action ruft **zusätzlich** `logPartnerEvent` (→ erscheint im Feed).

---

## 7. System-Event-Wiring (`logPartnerEvent`)

| Event `typ` | Ausgelöst in |
|---|---|
| `freigeschaltet` | `gibBasicSvFrei` (SV) / Werkstatt-Aktivierung |
| `gesperrt` | `svSperren` / Werkstatt-Sperren |
| `verifiziert` | `setzeSvVerifiziert` / `setWerkstattVerifiziert` |
| `vertrag` | Vertrag-unterschrieben-Pfad |
| `lead_zugewiesen` | SV-Zuweisung (`api/sv-zuweisung`) / Werkstatt-Vermittlung |
| `provision` | Provisions-Release |
| `statuswechsel` | generischer Partner-Statuswechsel |

**Scope:** die hochwertigen Events zuerst (freischalten/sperren/verify + Lead-Zuweisung); Rest inkrementell (jeder ist ein 1-Zeilen-`logPartnerEvent`-Aufruf).

---

## 8. Route-Konsolidierung (F2) — Folge-Schritt

Zielbild: **eine kanonische Detail-Route pro Partner-Typ**; die redundanten Routen per `next.config.ts`-Redirect (301/308, exakt-Match) auf die kanonische umleiten + die Duplikat-`page.tsx` löschen (kanonischer Fix laut Redirect-Stub-Gate). Kandidaten:
- SV: kanonisch `/admin/vertrieb/sachverstaendige/[id]`; `/admin/sachverstaendige/[id]` → redirect. (`/dispatch/sachverstaendige/[id]` bleibt — eigene Rolle/Layout.)
- Werkstatt: kanonisch `/admin/vertrieb/werkstaetten/[id]`; `/admin/werkstaetten/[id]` → redirect.

⚠ Diese Konsolidierung ist **separat** vom Cockpit-Kern (eigener Plan/PR), da sie Consumer-Links betrifft (Regression-Check: alle Verweise auf die Alt-Routen). **Nicht Blocker** fürs Cockpit.

---

## 9. Sofort-Fix (F4) — Google Maps doppelt geladen

`/admin/sachverstaendige/[id]` lädt die Google-Maps-JS-API mehrfach (Console-Warning). Ursache: mehrfacher `<script>`/Loader-Include (vmtl. Standort-Places-Feld + eine zweite Karte). Fix: einen einzigen Maps-Loader (Singleton) nutzen. **Kleiner, sofort mergebarer PR** (unabhängig vom Cockpit).

---

## 10. Security, Error-Handling, Migration, Ratchets, Tests, Rollout

**Security/RLS** (via Supabase-Plugin, Regel 2):
- `partner_aktivitaeten`: RLS ENABLE; `CREATE POLICY … FOR ALL TO authenticated USING/WITH CHECK (is_staff())` — **explizites `TO authenticated`** (RLS-Policy-Gate), `anon` kein Grant (Anon-Grant-Gate: `notiz`-Muster ist sensibel → staff-only ist Pflicht).
- `logManuelleAktivitaet` = staff-gated · `logPartnerEvent` = service-role.

**Error-Handling** (AGENTS-Pattern): Actions liefern `{ ok, error }` (kein throw) + `revalidatePath`. `logPartnerEvent` = non-critical (try/catch).

**Migration:** `apply_migration` → `partner_aktivitaeten` + Index + RLS + Grants; Version ablesen → File exakt danach benennen (Twin-Drift-Regel); Types regen + committen. Einmal-Backfill `werkstatt_notizen → partner_aktivitaeten` in derselben Migration.

**Ratchet-Compliance:** Status-Registry (typ→Farbe, nicht inline) · Component-Set (`primitives/*`+`shared/*`) · **Flag-Drift-Snapshot** nach der Migration regenerieren (neue `typ`/`partner_typ`-Enums) · voller `npm run build`.

**Tests:**
- Unit: `PARTNER_ACTIONS`-Config (typ→erlaubte Aktionen) · Feed-`typ→label`-Mapping · `logPartnerEvent`-Payload-Shape.
- **Regel-4-Prod-Smoke** je Partner-Typ (staff-Login, Wegwerf-Partner): Detail-View → Feed rendert → Notiz hinzufügen → erscheint (DB-verifiziert) · eine operative Action (z.B. SV freischalten) → System-Event `freigeschaltet` im Feed. 0 Residue.

**Rollout/Koordination:** frischer Worktree off origin/staging (nicht der stale aar-956-Checkout), PR gegen **staging** (Regel 1). ⚠ Detail-View-Files (`sachverstaendige/[id]/page.tsx`, `PartnerCockpit.tsx`, `firmen-flotte/[id]`) werden von anderen Lanes angefasst → additiv einhängen + koordinieren.

---

## 11. Scope-Grenzen / offene Punkte

- **Kern-Umsetzung** = Tabelle + Feed + ActionBar + Modal + `logManuelleAktivitaet` + `logPartnerEvent` + Einhängen in die 4 `[id]`-Seiten + Drawer-compact + die hochwertigen System-Events.
- **Folge-Schritte (eigene Pläne/PRs):** F2 Route-Konsolidierung · F4 GMaps-Fix · inkrementelle weitere System-Events.
- **Offen für Umsetzungsplan:** exakte Datei-Wiring-Liste je operativer Action (writing-plans-Schritt).
