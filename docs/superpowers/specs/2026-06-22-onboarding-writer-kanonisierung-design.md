# Onboarding-Writer-Kanonisierung — ein db_target→Tabelle-Router

**Datum:** 2026-06-22
**Status:** Design (Spec) — Review offen
**Kontext:** Folge aus dem Dynamisches-Onboarding-Kanonisierungs-Audit 2026-06-22.
**Leitprinzip (Aaron):** Eine kanonische Quelle, kein Funktions-/Writer-Herumgefuchtel.

---

## 1. Kontext & Problem

Das dynamische Onboarding ist **config-getrieben**: `onboarding_felder.db_target = {tabelle, spalte}`
ist die EINE Quelle, wo jedes Feld hingeschrieben wird (gerendert via `FieldRenderer`, switch auf
`feld.typ`). 5 `flow_key`s: `gutachter-finden`, `lead-erfassung`, `beauftragung`, `kunde-onboarding`,
`sv-onboarding`.

**Aber das Write-Routing ist fragmentiert** — dieselbe Config wird von **~4 verschiedenen Writern**
interpretiert, jeder mit eigener Tabellen-Behandlung:

| Writer | Datei | behandelte `db_target.tabelle` | Verhalten bei anderen |
|---|---|---|---|
| `saveOnboardingStep` | `components/onboarding/saveStep.ts` | `gutachter_finder_anfragen` (`ALLOWED_TABLES`) + Spezialpfade `claims`/`claim_parties` | **stilles `continue`** (Z.66) |
| `speichereFeststellungFlow` | `app/flow/[token]/self-service-actions.ts` | `leads` | — |
| Dispatch-Field-Writer | `app/dispatch/leads/[id]/_actions/*` | `leads` (+ `claims` via `updateFallField`) | — |
| SV-Writer | `schliesseSvBasicOnboardingAb` / `lade-sv-onboarding-phasen` | `profiles`, `sachverstaendige` | — |

**Konsequenzen:**
- **`db_target.tabelle` bedeutet je Consumer etwas anderes.** Ein Feld mit `tabelle='leads'` wird vom
  Dispatch/Flow geschrieben, von `saveOnboardingStep` aber **still verschluckt**.
- **Stiller Feld-Verlust:** `kunde-onboarding` hat 2 `leads`-Felder (fahrzeugschein_foto→kennzeichen,
  schadensfotos→schadensfoto_urls), die `saveOnboardingStep` skippt → gehen verloren.
- **Tote/falsche Targets bleiben unbemerkt:** `kunde-onboarding` hat 3 `faelle`-Targets, davon 2 auf
  **nicht-existente faelle-Spalten** (sa_signatur_data_url/dsgvo_zustimmung_am leben auf der gfa) →
  konnten nie schreiben, niemand merkt es (kein Fehler, nur `continue`). (Cleanup = CMM-49-Handoff,
  separat.)
- **Keine zentrale Ownership-/Allowlist-Stelle:** jeder Writer rollt seine eigene Sicherheit.

## 2. Ziele / Nicht-Ziele

**Ziele**
- **EIN** kanonischer Writer `saveOnboardingFields(ctx, felder, values)`, der `db_target.tabelle`
  generisch auf einen **registrierten Per-Tabelle-Handler** routet.
- **Unknown tabelle = Fehler** (kein stilles `continue`) → Config-Drift wird laut.
- Per-Tabelle **Ownership-Gate + Spalten-Allowlist + Coercion** an EINER Stelle je Tabelle.
- `db_target.tabelle` bedeutet **überall dasselbe**; kein Flow verliert ein Feld stumm.

**Nicht-Ziele**
- Die **Pseudo-Targets** `_termin`/`_finalize`/`_self` (Flow-Finalizer: Signatur, Termin-Buchung,
  SV-Self) — die sind KEINE Feld-DB-Writes; der Router ignoriert `_`-prefixed Targets, sie bleiben
  bei ihren Finalizern.
- Die **Vorbefüll-Lese-Seite** (`load-needed-phases` liest faelle+claims+leads+vehicles) — eigene
  Kanonisierung (→ v_claim_full), separat (Read-Audit / CMM-49).
- Die `faelle`-Config-Targets selbst (Daten-Migration) = **CMM-49-Handoff** (`COORDINATION-onboarding-faelle-targets.md`).
- Die `FieldRenderer`/`typ`-Render-Logik (bleibt).

## 3. Architektur

```
  Consumer (5 Flows)              EIN Router                         Per-Tabelle-Handler (Registry)
  ─────────────────              ──────────                         ──────────────────────────────
  WizardClient / FlowFeststel-   saveOnboardingFields(ctx,          claims        → ownership(geschaedigter==user)
  lungStep / DispatchFields /  ─► felder, values):                  claim_parties → ownership(verursacher-Party)
  SvOnboarding                    group by db_target.tabelle        vehicles      → claim.vehicle_id, ownership via claim
                                  → für jede (tabelle, fields):     leads         → flow-token/dispatch-rolle
                                     handler = REGISTRY[tabelle]    profiles      → self (user==target)
                                     if !handler && !'_'-prefix     sachverstaendige → self
                                        → ERROR (kein continue)     gutachter_finder_anfragen → anon+rate-limit (staging)
                                     else handler.write(...)
```

### 3.1 `OnboardingWriteContext`
```ts
type OnboardingWriteContext = {
  supabase: SupabaseClient            // user-context (RLS) — Handler nutzen createAdminClient NACH Ownership
  user: { id: string } | null
  audience: 'kunde' | 'dispatcher' | 'sv'
  anfrageId?: string | null           // gfa (staging)
  leadId?: string | null
  fallId?: string | null              // → claimId via resolveClaimId
  svId?: string | null
}
```

### 3.2 `OnboardingTableHandler` (Registry-Eintrag)
```ts
type OnboardingTableHandler = {
  resolveTargetId: (ctx) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  ownershipGate:   (ctx, id) => Promise<{ ok: true } | { ok: false; error: string }>
  writableColumns: ReadonlySet<string>        // Defense-in-Depth ZUSAETZLICH zur Config
  coerce:          (spalte, val, typ) => unknown   // segmented→bool, checkbox→tstz, ''→null
  write:           (id, updates) => Promise<{ ok: true } | { ok: false; error: string }>
}
const REGISTRY: Record<CanonicalTable, OnboardingTableHandler>
```
- **claims / claim_parties:** die bestehenden `saveClaimsOnboardingFacts` / `saveVerursacherPartyOnboardingFacts`
  (saveStep.ts) werden zu diesen Handlern (Ownership = geschaedigter==user via `resolveOwnedClaimId`).
- **vehicles** (NEU): `resolveTargetId` = `claims.vehicle_id` (via claimId); Ownership = via Claim;
  writableColumns = {kennzeichen_aktuell, hersteller, modell, baujahr, …}.
- **leads** (NEU als Handler, Logik aus Flow/Dispatch extrahiert): id = ctx.leadId; Ownership =
  Flow-Token-Resolve bzw. Dispatch-Rolle.
- **profiles / sachverstaendige** (NEU): id = user.id bzw. sv-by-user; Ownership = self.
- **gutachter_finder_anfragen:** der bestehende generische Insert/Update-Pfad (Shell-Insert +
  Rate-Limit) wird der gfa-Handler.

### 3.3 Router `saveOnboardingFields`
1. Gruppiere `felder` nach `db_target.tabelle`.
2. Für jede Gruppe: `'_'`-prefixed Targets überspringen (Flow-Finalizer-Sache, nicht Feld-Write).
3. `handler = REGISTRY[tabelle]`; **fehlt einer → `{ ok:false, error:'onboarding: unbekanntes db_target.tabelle='+tabelle }`** (+ `console.error`) — KEIN stilles Verschlucken.
4. `resolveTargetId` → `ownershipGate` → updates bauen (nur `writableColumns`, `coerce`) → `write`.
5. Aggregiertes Ergebnis (erste Fehler-Gruppe bricht ab, wie heute).

## 4. Entscheidungen (Review)
- **E1 — `_`-Pseudo-Targets bleiben Finalizer-Sache.** Der Feld-Router ignoriert sie; `_termin`/
  `_finalize`/`_self` werden von den Flow-spezifischen Abschluss-Handlern verarbeitet (Termin-Engine,
  Signatur, SV-Self). Nur ECHTE Tabellen gehen durch die Registry.
- **E2 — Config differenziert pre/post-Conversion, nicht der Router.** `lead-erfassung`→`leads`,
  `kunde-onboarding`→`claims` ist schon in der Config kodiert. Der Router honoriert `db_target.tabelle`
  1:1 — keine implizite „lead-oder-claim"-Magie. (Falls je nötig: `conditional_on` / context-aware
  Handler, out of scope.)
- **E3 — Unknown tabelle = harter Fehler** (nicht `continue`). Das ist die Kern-Verbesserung — tote/
  falsche Targets (faelle-Reste) werden sofort sichtbar statt stumm verschluckt.
- **E4 — Ownership bleibt pro Tabelle** (claims=geschaedigter, leads=token/rolle, profiles=self, …).
  Der Router delegiert; die Sicherheits-Grenze ist im Handler (wie `resolveOwnedClaimId` heute).

## 5. Migration
| Schritt | Inhalt |
|---|---|
| WP-A | `saveOnboardingFields` + `REGISTRY` + Context; claims/claim_parties-Handler aus saveStep.ts extrahiert; gfa-Handler aus dem generischen Pfad. `saveOnboardingStep` ruft nur noch den Router. |
| WP-B | Neue Handler: vehicles, leads, profiles, sachverstaendige (Logik aus speichereFeststellungFlow / Dispatch-Writer / SV-Writer extrahiert). |
| WP-C | Die 4 Consumer (WizardClient, FlowFeststellungStep, Dispatch-Fields, SvOnboarding) auf `saveOnboardingFields` umstellen; Per-Flow-Writer werden dünn/entfallen. |
| WP-D | **CMM-49-Handoff** (separat): faelle-Config-Targets entfernen/migrieren + load-needed-phases faelle-Read → v_claim_full. |

## 6. Testing
- **vitest (pure):** Gruppierung nach tabelle; unknown-tabelle→Fehler (kein silent skip); coerce-Matrix
  (segmented→bool, checkbox→tstz, ''→null); writableColumns-Filter (Config-Spalte nicht in Allowlist → übersprungen + Warnung).
- **Per-Handler:** Ownership-Gate (claims geschaedigter==user; leads token/rolle; profiles self).
- **Integration je Flow:** ein Feld pro Tabelle landet am richtigen Ort; kunde-onboarding leads-Felder
  (heute verschluckt) landen jetzt; faelle-Target → lauter Fehler statt stumm.

## 7. Risiken
- **Ownership-Regression:** der claims-Gate (`geschaedigter_user_id==auth.uid()`) MUSS exakt erhalten
  bleiben (Defense-in-Depth + Allowlist). Handler-Extraktion 1:1, vitest-abgesichert.
- **leads-Handler-Kontext:** Flow (Token) vs. Dispatch (Rolle) haben unterschiedliche Ownership →
  der leads-Handler braucht beide Pfade aus dem Context (audience).
- **Verhaltensänderung „unknown=Fehler":** könnte bestehende stille Skips zu Fehlern machen → vor
  WP-C die Config auf nur-kanonische Targets bringen (WP-D faelle-Cleanup zuerst).

## 8. Definition of Done
- Alle 5 Flows schreiben über `saveOnboardingFields`; kein Per-Flow-`ALLOWED_TABLES` mehr.
- `db_target.tabelle` ∈ {claims, claim_parties, vehicles, leads, profiles, sachverstaendige, gfa};
  unknown → Fehler; kein stilles `continue`.
- kunde-onboarding leads-Felder landen (kein Verlust mehr); faelle-Targets sind weg (WP-D).
- vitest + Build + Ratchets grün; Ownership-Gates unverändert.
