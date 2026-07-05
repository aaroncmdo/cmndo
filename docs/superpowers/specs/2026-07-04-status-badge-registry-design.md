# Status-/Badge-Registry — Normalisierung aller Rollen-Badges auf eine getypte Single-Source

- **Datum:** 2026-07-04
- **Branch:** `kitta/status-badge-registry` (Worktree, Base `origin/staging`)
- **Status:** Design freigegeben (Brainstorming), wartet auf Spec-Review → dann Implementation-Plan
- **Autor:** Session `470d55c9` (Claude)

---

## 1. Problem / Kontext

Status- und Phasen-„Badges" (kleine gerundete Pills, die einen Zustand anzeigen) werden über alle 9 Rollen-Portale hinweg **inkonsistent und dupliziert** gerendert. Ein Audit (2 Explore-Agenten, 2026-07-04) fand:

- **~55 Badge-Render-Stellen** über Admin / Dispatch / Kanzlei / Kunde / Gutachter / Makler / Werkstatt / Mitarbeiter / Faelle.
- **~95 inline Label-/Farb-Maps** in **~60 Dateien** außerhalb der zentralen `src/lib/statusLabels.ts`.
- **Drei parallele „zentrale" Registries** existieren bereits nebeneinander:
  - `src/lib/statusLabels.ts` — `FALL_STATUS_*`, `AUFTRAG_STATUS_*`, `ABRECHNUNG_STATUS_*`, `PROVISION_STATUS_*`, `SCHADENS_URSACHE_*`, `VS_STUFEN_*`, `RG_STUFEN_*`, `LEAD_PHASE_LABELS`, `MANDATSTYP_*` + ein **7-Slot-Token-Farbsystem** (`neutral/active/pending/done/success/warning/danger`).
  - `src/lib/claims/lifecycle.ts` — `MAIN_PHASE_LABEL`, `SUBPHASE_LABEL` (Label-only, **keine** Farb-Companion → jeder Consumer erfindet eigene Farben).
  - `src/components/shared/claims/status-mappings.ts` — `CLAIM_STATUS` (bestes Muster: `label` + `labelKunde` + `tone` + `icon` + `isEndzustand`).

### Konkrete Schmerzpunkte
- **Termin-Status** ist **7×** unabhängig reimplementiert (kunde/dispatch/termine) mit divergierenden Werten.
- **Reklamation-Status** **3×** mit *unterschiedlichen* Farbwahlen (admin/gutachter/mitarbeiter).
- **Fall-Status** wird an mehreren Stellen roh nachgebaut, obwohl `FallStatusBadge`/`ClaimStatusBadge` genau das schon können (`UebersichtTab.tsx`, `ManualStatusOverrideModal.tsx`, `mitarbeiter/*`).
- **`lifecycle.ts` hat keine Farb-Companion** → `FaelleKanban`, `kanzlei/KanbanBoardClient`, `MaklerAktenList` (`PHASE_PILL_COLOR`), `mitarbeiter/*` erfinden je eigene Phasen-Farben oder rendern eine feste neutrale Pille.
- **`Rolle`** (~11 Kopien), **`Dokument-Typ`** (~10), **`Paket`** (~9) sind reine Label-Lookups, überall dupliziert.
- Raw-Tailwind-Farben (`bg-yellow-50`, `bg-green-100 text-green-700`) in ~35 Stellen umgehen das Token-System und die `token-audit`-CI.

---

## 2. Entscheidungen (aus dem Brainstorming)

| Frage | Entscheidung | Begründung |
|---|---|---|
| Wo liegt die Wahrheit? | **Zentrale getypte Code-Registry** (kein Postgres) | Labels = UI-Copy (Umlaut-Regel, i18n, Compile-Exhaustiveness, grepbar); Farben = Design-Tokens (Branding via `var(--brand-*)` + `token-audit`-Ratchet). Eine DB-Tabelle würde beide Guards umgehen. Registry-Shape mappt 1:1 auf eine spätere DB-Tabelle, falls Live-Editing je nötig wird. |
| „Für alle Rollen" | **Ein System + Label-Varianten wo nötig** | Verallgemeinert das bestehende `labelKunde`-Muster (`labelByRole`). Farbe/Ton pro Status gleich; Label optional rollen-spezifisch. |
| Scope | **Umfassend, in einer koordinierten Anstrengung** | Alle Status-/Enum-Maps ziehen in `lib/status`; geliefert als **gestapelte, reviewbare PRs** (nicht ein 60-Datei-Blob). |

---

## 3. Architektur

### 3.1 Datenmodell — eine uniforme Entry-Form

```ts
// src/lib/status/types.ts
export type StatusSlot =
  | 'neutral' | 'active' | 'pending' | 'done'
  | 'success' | 'warning' | 'danger'   // die bestehenden 7 Token-Slots

export type ViewerRole =
  | 'kunde' | 'sv' | 'kanzlei' | 'makler'
  | 'werkstatt' | 'admin' | 'dispatch' | 'kundenbetreuer'

export type StatusDef = {
  /** Default / Fachsprache */
  label: string
  /** Optionale rollen-spezifische Varianten (verallgemeinert labelKunde) */
  labelByRole?: Partial<Record<ViewerRole, string>>
  /** Optionales Kurzlabel (Tabellen/Kanban) */
  short?: string
  /** Farbe = IMMER ein Slot, NIE eine rohe Tailwind-Klasse */
  slot?: StatusSlot
  /** Optional: Endzustand-Flag (für Status-Domains mit terminalen Zuständen) */
  isEndzustand?: boolean
  /** Optional: Icon-Key (der eigentliche LucideIcon liegt im Client-Companion) */
  iconKey?: string
}
```

**Drei fest eingebaute Prinzipien:**

1. **Farbe ist immer ein Slot, nie ein roher String.** Die Slot→Klasse-Auflösung lebt an **genau einer** Stelle (`src/lib/status/slots.ts`, = das heutige `STATUS_SLOT_CLASSES`). Das gibt `lifecycle.ts` die fehlende Farb-Companion und zieht `sv-status.ts` / Raw-Pills auf Tokens → **netto weniger** `token-audit`-Verstöße (Boy-Scout).
2. **Rollen-Varianz ist opt-in pro Status.** `resolveStatus(domain, code, role)` → `def.labelByRole?.[role] ?? def.label`. Default rollen-agnostisch; Variante nur wo das Produkt sie will (Kunde: „Wir verhandeln mit der Versicherung" / Admin: „Kommunikation VS").
3. **Type-Safety bleibt.** Domains mit TS-Union (`ClaimSubPhase`, `ClaimStatus`) werden per Union gekeyt → Compiler erzwingt Vollständigkeit. String-gekeyte DB-Enums bekommen `Record<string, StatusDef>` + sicheren Runtime-Fallback.

### 3.2 Modul-Layout

```
src/lib/status/
  types.ts        // StatusSlot, ViewerRole, StatusDef, DomainName-Union
  slots.ts        // STATUS_SLOT_CLASSES (die EINZIGE Farb-Quelle, aus statusLabels.ts hierher)
  palettes.ts     // Nicht-Status-Farbpaletten (schadens-ursache, sv-typ, kalender-typ) — 1 Datei, 1 Skip-Header
  domains/
    fall-phase.ts       // aus lifecycle.ts MAIN/SUBPHASE + NEUE Slots + Rollen-Varianten
    fall-status.ts      // aus FALL_STATUS_* (faelle.status)
    claims-status.ts    // aus CLAIM_STATUS (labelKunde -> labelByRole)
    termin.ts           // NEU (7 Kopien -> 1)
    lead.ts             // lead-phase + lead-status (+ finder-status)
    auftrag.ts          // AUFTRAG_STATUS + auftrag/phase.ts
    abrechnung.ts       // abrechnung-status + provision-status
    reklamation.ts      // NEU (3 divergente Kopien -> 1)
    ... (weitere, s. Domain-Inventar)
  registry.ts     // DOMAINS: Record<DomainName, Record<string, StatusDef>> (Runtime-Lookup)
  resolve.ts      // resolveStatus(), statusLabel(), statusSlotClass()
  icons.tsx       // (client) iconKey -> LucideIcon — hält lib/status React-/lucide-frei
  index.ts        // Barrel: re-exportiert Resolver + (temporär) Legacy-Konstantennamen
```

**Server/Client-Grenze:** `lib/status/*` (außer `icons.tsx`) ist **React-/Icon-frei** → Server-Code (Emails, PDFs) importiert Labels ohne `lucide` zu bündeln. Das entkoppelt auch `status-mappings.ts`, das heute Icons in die Daten schweißt.

### 3.3 Resolver

```ts
// src/lib/status/resolve.ts
export function resolveStatus(domain: DomainName, code: string | null | undefined): StatusDef
export function statusLabel(domain: DomainName, code: string | null | undefined, role?: ViewerRole): string
export function statusSlotClass(slot: StatusSlot | undefined): string   // slots.ts lookup + neutral-Fallback
```

`resolveStatus` liefert immer einen `StatusDef` (Fallback = `{ label: code ?? '—', slot: 'neutral' }`, wie heute `getStatusMapping`).

### 3.4 Component-Layer

**Zwei Render-Pfade:**

| Pfad | Für | Aufruf |
|---|---|---|
| `<StatusBadge domain code role/>` | als Pille gerenderte Zustände (Tier 1) | Component |
| `statusLabel(domain, code, role?)` | als reiner Text gerenderte Labels (Tier 2) | Pure fn |

**Kanonischer Look:** die **Soft-Slot-Optik** (`bg-success-soft text-success-strong`, …) wird *die* Status-Pill-Behandlung. Sie ist die Mehrheits-Optik, rebrandet via `var(--brand-*)`, und ihr exakter Ton/Padding/Size wird nun aus **einer** Datei tunebar. Ein paar Tone-basierte/Ad-hoc-Stellen verschieben sich optisch minimal — das ist die Normalisierung, nicht ein Nebeneffekt.

**`StatusBadge` wird Dual-Mode (keine Renames):**

```tsx
// Registry-Modus (neuer kanonischer Pfad):
<StatusBadge domain="fall-phase" code={subPhase} role={viewerRole} size="sm" />

// Legacy-Modus bleibt während der Migration (tone / colorCls) -> am Ende gelöscht:
<StatusBadge tone="success">Bezahlt</StatusBadge>
```

Bei `domain`+`code` → `resolveStatus` → `labelByRole?.[role] ?? label` → `slot → STATUS_SLOT_CLASSES` → Soft-Slot-Span (exakt was `FallStatusBadge` heute rendert, generalisiert) + optionales führendes Icon. Sonst → heutiges tone/`colorCls`-Verhalten. **Null Breaking Changes**, inkrementelle Migration; am Ende wird der Legacy-Pfad (die Haupt-Farb-Leckstelle) gelöscht.

**Was subsumiert wird:**
- `FallStatusBadge` → Wrapper auf `<StatusBadge domain="fall-status" …/>` (Back-Compat, oder inline im Sweep).
- `ClaimStatusBadge` → `<StatusBadge domain="claims-status" role withIcon/>`; `viewerRole → labelKunde` wird `labelByRole`.
- die **~35 Raw-Pills** + die **`colorCls`-Escape-Hatch-Leaks** (`AbrechnungenListClient`, `support`, `organisationen`, `getSvStatus`/`sv-status.ts`) → lokale Farb-Maps werden Registry-Domains mit Slots.

**Dokumentierte Ausnahme:** `SchadensUrsacheBadge`. Seine Farben sind **Kategorie-Identität** (Wasserschaden-Blau, Brand-Rot…), keine Status-Semantik → `schadens-ursache` zieht als **Kategorie-Palette** (nicht Slot) in `palettes.ts` mit `// Token-Audit-Skip`-Header. Gleiches gilt für Kalender-Event-Farben (`termin-typ` `FARBEN`) und `sv-typ`-Identitätsfarben.

---

## 4. Domain-Inventar

### Tier 1 — Status/Phasen-Badges (Pills, bekommen `slot` + Rollen-Varianten)

| Domain | Quelle(n) heute | Anmerkung |
|---|---|---|
| `fall-phase` | `lifecycle.ts` (`MAIN_PHASE_LABEL`,`SUBPHASE_LABEL`) | **bekommt Farb-Companion** (heute fehlt sie) |
| `fall-status` | `statusLabels.ts` `FALL_STATUS_*` | Rollen-Varianten ergänzen; `UebersichtTab`+`ManualStatusOverrideModal`-Dup killen |
| `claims-status` | `status-mappings.ts` `CLAIM_STATUS` | `labelKunde`→`labelByRole`; Icons in `icons.tsx` |
| `termin-status` | 7 Kopien (kunde/dispatch/termine + `lead-termin-gutachter.ts`) | **höchste Duplikation** |
| `lead-phase` / `lead-status` | `leadPhaseConstants.ts`, `LEAD_PHASE_LABELS`, `gutachter-finder/constants.ts` | **kollisions-verzögert** (aar-956 Finder) |
| `auftrag-status` | `AUFTRAG_STATUS_*` + `lib/auftrag/phase.ts` | |
| `abrechnung-status` | `ABRECHNUNG_STATUS_*` | **kollisions-verzögert** (kanonische-abrechnung) |
| `provision-status` | `PROVISION_STATUS_*` | **kollisions-verzögert** (kanonische-abrechnung) |
| `reklamation-status` | 3 divergente Kopien | **NEU zentralisieren** |
| `sv-onboarding-status` | `lib/sv-status.ts` (`SV_STATUS_BADGES`) | Raw-Tailwind → Slots |
| `support-ticket`, `partner-waitlist`, `zahlungs-status`, `sla`, `invitation-status` | diverse inline | kleinere Status-Domains |

### Tier 2 — Label-Lookups (meist Text; konsolidiert, keine Pille)

`rolle` (~11 Kopien), `dokument-typ`/`dokument-kategorie` (~10, + `pflicht-dokumente.ts`), `paket` (~9, + `lib/pakete.ts`), `kanal`, `task-typ`/`task-prio`, `unfallart`, `kuerzungsgrund`, `zahlungsweg`, `szenario`, `beleg-typ`, `SF`/`KK`, `ablehnungsgrund`, `onboarding-quelle`, `notification-event`/`notification-channel`.

### Paletten (Nicht-Status-Farben, `palettes.ts`, ein Skip-Header)

`schadens-ursache`, `sv-typ` (kfz/buero/akademie/community), `termin-typ`/Kalender-Hues.

### Zu prüfen / evtl. droppen
`VS_STUFEN_*`, `RG_STUFEN_*`, `MANDATSTYP_*` haben laut Audit **keine** aktuellen UI-Badge-Consumer → in Registry als Label-Domains aufnehmen ODER (nach Verifikation „wirklich ungenutzt") droppen.

---

## 5. Liefer-Struktur (Migrations-Wellen)

Eine Anstrengung, ein Worktree/Branch, aber **gestapelte reviewbare PRs**. Das Re-Export-Barrel garantiert, dass der Baum an **jedem** Schritt kompiliert.

- **W0 · Foundation (der Architektur-PR — einziger, der Tiefen-Review braucht):**
  `lib/status`-Skelett (types, slots, palettes, resolver, `statusLabel`), Dual-Mode-`StatusBadge`, `icons.tsx`, **Barrel-Re-Exports aller bestehenden Konstantennamen**. Migration der 3 kanonischen Claim-Domains (`fall-phase` mit NEUEN Slot-Farben + Rollen-Varianten, `fall-status`, `claims-status`). Tests.
- **W1 · Termin-Familie:** `termin-status` (7 Kopien), `termin-typ` (Kalender-Palette). Unabhängig von Live-Sessions.
- **W2 · Reklamation + kleine Status-Domains:** `reklamation-status`, `support-ticket`, `partner-waitlist`, `zahlungs-status`, `sla`, `invitation-status`, `sv-onboarding-status`.
- **W3 · Label-Lookups (niedriges Sichtrisiko):** `rolle`, `dokument-typ`/`-kategorie`, `paket`, `kanal`, `task-typ`/`-prio`, `unfallart`, `kuerzungsgrund`, `zahlungsweg`, `szenario`, `beleg-typ`, `SF`/`KK`.
- **W4 · Kollisions-verzögert (nach Merge der überlappenden Sessions):** `abrechnung-status` + `provision-status` (überlappt `kanonische-abrechnung`), `lead-phase`/`lead-status`/`finder-status` (überlappt `aar-956`-Finder).
- **W5 · Cleanup:** Legacy-`tone`/`colorCls`-Escape-Hatch löschen, `component-set`/`token-audit`/`knip`-Baselines senken (Boy-Scout), Barrel-Re-Exports entfernen.

**Ausführung:** naturgemäß **parallele Subagenten** — W0 landet zuerst als geteilte Dependency, dann fächern die Domain-Wellen auf.

---

## 6. Guards & Constraints

- **`lifecycle` TS↔SQL-Parity-Gate: unberührt.** Wir dekorieren Codes nur mit Label/Farbe auf der Frontend-Seite; `v_claim_phase` emittiert weiter die Codes. `lifecycle.test.ts` bleibt grün.
- **`token-audit`: reduziert.** Slots-only → Raw-Pills wandern auf Tokens. Carve-out: `palettes.ts` (Kategorie-/Kalender-/SV-Typ-Farben) = **eine** Datei mit `// Token-Audit-Skip`, Ausnahme lokalisiert.
- **`component-set` + `knip`: Baselines senken** (Boy-Scout), sobald Raw-Pills/Inline-Maps verschwinden.
- **Server/Client:** `lib/status`-Daten **icon-frei** → Server-Code importiert Labels ohne `lucide`. Icons im Client-Companion `icons.tsx`.
- **`'use server'`-Regel:** Registry ist ein reines Lib-Modul → const/type-Exporte erlaubt (nie aus `'use server'`).
- **Umlaut-Regel:** jetzt an **einer** Datei durchsetzbar statt an 95. Alle Registry-Labels mit echten `ä/ö/ü/ß`.
- **i18n:** die wenigen `t('phaseLabel')`-Stellen bleiben diese Runde unberührt (Registry = deutsche SSoT; i18n-Keys rausziehen ist ein separates Anliegen).

---

## 7. Test-Strategie

- **TDD Resolver** (`resolve.test.ts`): Rollen-Varianten-Präzedenz (`labelByRole` vor `label`), Fallback bei unbekanntem Code, `slot → Klasse`, `null`-Code.
- **Type-Level-Exhaustiveness** für Union-gekeyte Domains (`fall-phase`/`claims-status`): ein Compile-Test, dass jeder Union-Wert einen Entry hat.
- **Pro Welle:** `npx tsc --noEmit` + `npm run build` (Routen/Layouts!) + Visual-Smoke der migrierten Portale.
- **Parity-Regression:** `lifecycle.test.ts` unverändert grün.

---

## 8. Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| Optische Drift an konvergierten Stellen | Bewusst + freigegeben; Ton zentral tunebar. Visual-Smoke pro Welle. |
| Datei-Kollision mit Live-Sessions (`kanonische-abrechnung`, `aar-956`-Finder) | Betroffene Domains in **W4** verzögert, nach deren Merge. |
| Worktree Write-Revert (dok. Infra-Gotcha) | Dateien außerhalb Worktree assemblen, atomar `cp`+`commit`. |
| 60-Datei-Mega-PR unreviewbar | Gestapelte PRs; Barrel hält Baum an jedem Schritt grün. |
| `lucide` versehentlich im Server-Bundle | Daten icon-frei; Icons nur im Client-Companion. |
| Domain als „ungenutzt" gedroppt, doch referenziert | Vor Drop `grep`-Verifikation (VS/RG/MANDATSTYP). |

---

## 9. Non-Goals / Zukunft (bewusst außen vor)

- **Keine DB-Tabelle** in dieser Runde. Registry-Shape mappt 1:1 auf eine spätere `status_definitions`-Tabelle, falls Live-Editing/Whitelabel-Status-Naming je ein echtes Requirement wird — Tür bleibt billig offen.
- **Kein i18n-Umbau** der wenigen `t()`-Stellen.
- **Kein Ändern der Phasen-Logik** (`lifecycle.ts`/`v_claim_phase`) — nur Präsentation.
- **Werkstatt-Portal:** laut Audit ~keine Status-Badges → nur betroffen falls Domain-Nutzung auftaucht.

---

## Appendix A — Inline-Map-Debt (Migrations-Ziele, aus Audit 2026-07-04)

**Kategorie (d) — lokale Label/Farb-Maps (Registry-Reimplementierungen):**
`admin/finance/(hub)/page.tsx` (`statusColors`), `admin/partner/waitlist/WaitlistTable.tsx` (`STATUS_LABELS`), `admin/team/TeamClient.tsx` (`ROLLE_*`/`KAT_*`), `admin/team/incentives/IncentivesClient.tsx` (`TYP_*`), `admin/statistiken/StatistikenClient.tsx` (`statusLabel/statusColor`, `KUERZUNGSGRUND_LABELS`, `UNFALL_LABELS`, `FAHRZEUGTYP_LABELS`), `admin/sachverstaendige/_karte/KarteHubClient.tsx` (`TYP_COLORS`), `admin/sachverstaendige/anlegen/AnlegenTabs.tsx` (`TAB_COLORS`), `admin/reklamationen/ReklamationenClient.tsx` (`GRUND_LABELS`), `dispatch/leads/_components/leadPhaseConstants.ts` (`PHASE_BADGES`/`PHASE_LABELS`), `dispatch/karte/TerminPopup.tsx` (`statusLabel()`), `dispatch/leads/[id]/DispatchGatesPanel.tsx` (`Q_LABELS`), `kunde/termine/KundeTermineClient.tsx` (`STATUS_LABEL`/`STATUS_BADGE`/`DOT_CLS`), `kunde/termine/[id]/KundeTerminDetailClient.tsx`, `components/kunde/TerminSectionCard.tsx` (`getStatusConfig`), `gutachter/tasks/page.tsx` (`PRIO_*`), `gutachter/feldmodus/FokusHeader.tsx` (`statusLabel()`), `components/claims/InvitationStatusBadge.tsx` (`STATUS_LABELS`), `components/makler/MaklerLeadsTable.tsx` (`cfg`), `components/makler/MaklerAktenList.tsx` (`PHASE_PILL_COLOR`), `mitarbeiter/performance/PerformanceClient.tsx` (`TL_COLORS`), `faelle/[id]/_tabs/DokumenteTab.tsx` (`DOK_LABELS`/`KAT_COLORS`), `lib/sv-status.ts` (`SV_STATUS_BADGES`).

**Kategorie (e) — Raw-Tailwind-Pills mit hardcodierten Farben:**
`admin/finance/(hub)/page.tsx`, `admin/finance/(hub)/provisionen/ProvisionenClient.tsx`, `admin/finance/(hub)/AbrechnungenSection.tsx`, `admin/team/incentives/IncentivesClient.tsx`, `admin/statistiken/StatistikenClient.tsx`, `admin/kanzlei-board/page.tsx`, `admin/faelle/(hub)/FaelleKanban.tsx`, `admin/_components/TageskalenderWidget.tsx`, `admin/_components/KritischeUpdatesWidget.tsx`, `admin/organisationen/OrganisationenClient.tsx`, `dispatch/leads/_components/LeadsViewToggle.tsx`, `dispatch/dashboard/page.tsx`, `dispatch/leads/[id]/SvDispatchPanel.tsx`, `dispatch/leads/[id]/_v2/DispatchFlowlinkPanel.tsx`, `kanzlei/kanban/KanbanBoardClient.tsx`, `kunde/termine/KundeTermineClient.tsx`, `gutachter/abrechnung/page.tsx` (Desktop **und** Mobile — dupliziert), `gutachter/reklamationen/ReklamationenClient.tsx`, `gutachter/auftraege/AuftragCard.tsx`, `gutachter/community/page.tsx`, `mitarbeiter/faelle/page.tsx`, `mitarbeiter/page.tsx`, `mitarbeiter/reklamationen/page.tsx`, `mitarbeiter/tasks/page.tsx`, `faelle/[id]/_tabs/UebersichtTab.tsx`.

**Duplikate bereits zentraler Maps:**
`ManualStatusOverrideModal.tsx` (`STATUS_LABEL` = ~Kopie von `FALL_STATUS_LABELS`), `lib/auftrag/phase.ts` (`AUFTRAGS_PHASE_LABEL` ≈ `AUFTRAG_STATUS_LABELS`), `FaelleKanban.tsx` (`SF_SHORT` = Short von `SF_LABELS`), `notifications/channels/email.ts` (Provision-Ternaries ≈ `PROVISION_STATUS_LABELS`), `leadPhaseConstants.ts` (überlappt `LEAD_PHASE_LABELS`).
