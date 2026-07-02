# Golden-Path E2E-Harness — Design

**Datum:** 2026-07-02
**Status:** APPROVED (Aaron 2026-07-02: Design + Trade-off „Testdaten kurz in Prod mit hartem Cleanup" freigegeben; + Nachforderung „muss fuer alle Rollen funktionieren" → §4b Rollen-Abdeckung ergaenzt)
**Auslöser:** Funnel-Diagnose (Prod, 02.07.): 389 Leads → 93 konvertiert → 94 Claims → **84 mit SV** → **nur 2 Gutachten** → **0 Regulierung / 0 Abschluss**. Die hintere Funnel-Hälfte (Gutachten → Kanzlei → Regulierung → Abschluss) ist in Prod **nie e2e durchgelaufen**. Deckt sich mit vielen Session-Befunden (gebaut, nie durchgelaufen).

## 1. Zweck & Umfang

**Zweck:** Ein Harness, der EINEN synthetischen Fall durch die **echte** Kern-Pipeline treibt (Lead → Claim → SV-Zuweisung → Gutachten → Billing → Kanzlei-Mandat → Regulierung → Abschluss), nach **jeder Stufe** den erwarteten DB-Zustand assertet, und die Testdaten danach hart aufräumt. Er beweist, ob die hintere Hälfte überhaupt durchläuft, und legt **alle stillen Bruchstellen auf einmal** offen — als Launch-Readiness-Check + laufende Observability.

**In Scope:** Die operative Kern-Strecke über die server-seitigen lib-Funktionen. Per-Stage-Assertions. Test-Entity-Erzeugung + idempotentes Cleanup. Zwei Ausführungs-Hüllen (on-demand + nightly Cron mit Alert).

**Out of Scope:** Browser-/UI-E2E (dafür gibt es `tests/e2e/flows/smoke-vollstrecke.spec.ts`, Playwright). Die echte externe LexDrive/Salesforce-Integration (wird durch das Test-Daten-Safety-Net von `pushMandatToKanzlei` bewusst geblockt — separat überwacht). Last-/Performance-Tests. Reklamations-/Nachbesichtigungs-/Klage-Nebenpfade (nur der Happy-Path).

## 2. Architektur

Ein aufrufbarer Kern + zwei dünne Hüllen:

```
src/lib/health/golden-path.ts   ← Kern: runGoldenPath(): Promise<GoldenPathReport>
  ├─ setup()      Test-Entities anlegen (idempotentes Pre-Cleanup zuerst)
  ├─ stages[]     jede Stufe: drive() -> assert() -> {stage, ok, detail, ms}
  └─ cleanup()    finally: delete_fall_komplett + Test-Lead weg

src/app/api/cron/golden-path/route.ts   ← Hülle 1: on-demand + nightly Cron (CRON_SECRET)
                                            bei Fehler -> Dead-Letter/Alert, bei Erfolg -> resolved
```

**Fidelity-Prinzip:** Der Harness ruft die **echten** server-seitigen lib-Funktionen auf, die die App selbst nutzt — NICHT die `'use server'`-Actions (die Request-Auth + FormData brauchen). Alle relevanten Kern-Funktionen sind server-seitig aufrufbar (die meisten instanziieren selbst einen Admin-Client). Damit testet der Harness den echten State-Machine-Graphen, die echten Trigger (Billing-Hook), die echte Kanzlei-Push-Logik — genau dort, wo die 84→2→0-Klippe entsteht.

**GoldenPathReport:**
```ts
type StageResult = { stage: string; ok: boolean; detail: string; ms: number }
type GoldenPathReport = {
  ok: boolean                 // alle Stufen ok
  stages: StageResult[]
  fallId: string | null
  claimId: string | null
  cleanedUp: boolean
  error?: string
}
```

## 3. Der Golden-Path (Stufen, Drive-Funktion, Assertion)

Jede Stufe: **treiben** über die echte lib-Funktion, dann **asserten** gegen den DB-Zustand (Admin-Client-READ). Status-Sequenz verifiziert gegen `FALL_STATUS_TRANSITIONS` (state-machine.ts) — jeder Sprung ist im Graph gültig.

| # | Stufe | Drive (echte Funktion) | Assertion (DB) |
|---|---|---|---|
| 0 | Pre-Cleanup | alte `golden-path-*`-Reste löschen | keine Reste mehr |
| 1 | Lead | `createLead(admin, {source_channel:'golden_path', status}, {email:'golden-path+<ts>@claimondo.test', vorname/nachname/telefon})` | `leads`-Row existiert |
| 2 | Claim | `convertLeadToFall(admin, leadId, TEST_KB_USER_ID)` | `claims`-Row + `faelle_claim_bridge` (fall_id) + `operative_status` gesetzt |
| 3 | SV-Zuweisung | `setSvIdForFall(admin, fallId, TEST_SV_ID)` | `claims.sv_id == TEST_SV_ID` |
| 4 | Status → sv-termin → besichtigung | `transitionFallStatus(fallId, 'sv-termin')` → `transitionFallStatus(fallId, 'besichtigung')` | `operative_status == 'besichtigung'` |
| 5 | Gutachten + Billing | `gutachten`-Upsert `{claim_id, sv_id:TEST_SV_ID (NOT NULL!), fertiggestellt_am, gesamt_schadensbetrag:5500}` → `transitionFallStatus(fallId, 'gutachten-eingegangen')` | `gutachten`-Row · `operative_status=='gutachten-eingegangen'` · **`claims.lead_preis_netto` gesetzt** (Billing-Hook feuerte, AAR-924) |
| 6 | Filmcheck → Kanzlei | `transitionFallStatus(fallId, 'filmcheck')` → `transitionFallStatus(fallId, 'kanzlei-uebergeben')` | `operative_status=='kanzlei-uebergeben'` |
| 7 | Mandat-Push | `pushMandatToKanzlei(fallId)` | Rückgabe `success` ODER `skipped:true` (Test-Daten-Safety-Net greift für `@claimondo.test`) — beweist Code-Pfad läuft; externer Push bewusst nicht exerziert |
| 8 | Regulierung | `transitionFallStatus(fallId, 'anschlussschreiben')` → `transitionFallStatus(fallId, 'regulierung')` | `operative_status=='regulierung'` |
| 9 | Abschluss + Billing-Backstop | `transitionFallStatus(fallId, 'zahlung-eingegangen')` → `transitionFallStatus(fallId, 'abgeschlossen')` | `operative_status=='abgeschlossen'` |
| 10 | Cleanup | `admin.rpc('delete_fall_komplett', {p_fall_id, p_claim_id})` + `leads.delete` | Claim/Fall/Lead weg |

Jede Stufe ist **isoliert** (eigene drive+assert), sodass der Report exakt zeigt, **welche** Stufe bricht — nicht nur „irgendwo gescheitert".

## 4. Comms-Safety (First-Class-Requirement)

`transitionFallStatus` + `convertLeadToFall` feuern **echte Outbound-Comms** (Kunde-Email/WhatsApp, SV-Mitteilungen, bei `kanzlei-uebergeben` eine LexDrive-Kanzlei-Email). Der Harness darf **keine echten Nachrichten an echte Empfänger** senden.

**Mechanismen (kombiniert):**
1. **`@claimondo.test`-Kontakte** für Lead/Kunde — die bestehenden Test-Daten-Safety-Nets (z.B. `pushMandatToKanzlei` Z.129–154) erkennen sie und skippen externe Calls.
2. **Dedizierter Test-SV** (`ist_aktiv=false`, `@claimondo.test`) — SV-Mitteilungen gehen an eine Test-Adresse; der inaktive SV ist aus dem Dispatch-Matching ausgeschlossen.
3. **Keine reale Kanzlei-Bindung** am Test-Claim → die Kanzlei-Email bei `kanzlei-uebergeben` findet keinen realen Empfänger (kein Versand).
4. **Impl-Auflage (Plan/Build):** Vor dem ersten Prod-Lauf JEDEN Side-Effect-Pfad der getriebenen Transitions lesen und verifizieren, dass er für die Test-Entity zu einem Test-Empfänger oder No-Op auflöst. **Falls ein Pfad einen realen Empfänger treffen würde, MUSS ein Test-Daten-Guard ergänzt werden** (analog `pushMandat`) — oder der Harness stoppt vor dieser Transition (partieller Golden-Path) statt zu senden. Comms-Safety schlägt Vollständigkeit.

## 4b. Rollen-Abdeckung & Per-Rollen-Sichtbarkeits-Assertion

Der Admin-getriebene Pipeline-Lauf beweist, dass der **Zustand** fortschreitet — aber er umgeht die **Rollen-Ebene** (Auth + RLS-Sichtbarkeit). Um „funktioniert fuer alle Rollen" zu beweisen, assertet der Harness nach den relevanten Stufen zusaetzlich, dass die **zustaendige Rolle ihren Fall via die gegateten Claim-Views SEHEN kann**. Das faengt genau die wahrscheinliche Ursache der 84→2-Klippe: ein zugewiesener SV, der seinen Fall RLS-bedingt gar nicht sieht → kann kein Gutachten liefern.

**Funnel-Rollen (verifiziert gegen `user_role`-Enum):** `kunde`, `dispatch`, `sachverstaendiger`, `kundenbetreuer`, `kanzlei`, `admin`. (`leadbearbeiter`/`makler`/`werkstatt` = adjazent, nicht im Kern-Golden-Path.)

**Mechanismus:** kleiner SECURITY-DEFINER-Helper `golden_path_claim_visible_for(p_claim_id uuid, p_user_id uuid) RETURNS boolean` (via Migration) — setzt `request.jwt.claims` (`sub`=p_user_id, `role`=authenticated) lokal + gibt `claim_sichtbar_fuer_aktuellen_user(p_claim_id)` zurueck. Repliziert das etablierte JWT-Sim-Muster aus dem RLS-Safety-Net (#3334, `audit_claim_view_identity`). Der Harness ruft ihn via `admin.rpc` pro Rolle-Test-User. **Verifiziert vorab:** Gate-Funktion + gegatete Views (`v_claim_full`/`v_faelle_mit_aktuellem_termin`/…) existieren.

**Per-Stage-Rollen-Assertion:**
| Stufe | Rolle | Assertion |
|---|---|---|
| Claim erzeugt | `kunde` (geschaedigter_user_id) | sieht eigenen Claim (positiv) |
| SV-Zuweisung | `sachverstaendiger` (Test-SV-User) | **sieht zugewiesenen Fall** — Kern-Hypothese der Klippe |
| durchgehend | `kundenbetreuer` (kundenbetreuer_id) | sieht betreuten Claim |
| durchgehend | `dispatch` + `admin` | sehen Claim (breit) |
| Kanzlei-Stufe (komplett) | `kanzlei` | sieht Mandats-Claim |
| Gegenprobe (einmal) | fremder Test-User | sieht Claim **NICHT** (Negativ-Assertion) |

Die **Negativ-Assertion** (ein fremder Nutzer darf den Claim NICHT sehen) haelt das Gate ehrlich (kein Ueber-Exposure). Fehlt einer Rolle die Sicht auf ihre Stufe → der Report markiert genau **Rolle + Stufe** als Bruch.

**Bewusst NICHT in Scope:** per-Rollen-**Write**-Autorisierung (darf die Rolle ihre Aktion ausfuehren?) — das deckt der separate Claim-Write-Path-Audit ab; der Golden-Path treibt Writes via Admin-lib + assertet Rollen-**Sicht**.

## 5. Test-Entities & Cleanup

- **Persistenter Test-SV** (einmalig idempotent angelegt, NICHT pro Lauf gelöscht): `sachverstaendige`-Row + `profiles` + auth-User, `@claimondo.test`, `ist_aktiv=false`, klarer Marker. Wiederverwendet über Läufe (stabile `TEST_SV_ID`). Grund: SV-Anlage ist teuer + der SV muss aus dem Dispatch raus bleiben.
- **Persistenter Test-KB-User** für `convertLeadToFall(userId)` — reuse eines existierenden Test-KB (z.B. `aa000001…`) oder dedizierter `@claimondo.test`-KB.
- **Per-Lauf: Lead + Claim + Gutachten** — `@claimondo.test`, Marker (`source_channel='golden_path'`, Lead-Email-Prefix `golden-path+<ts>`). Nach jedem Lauf gelöscht.
- **Cleanup-Strategie:** Kein Transaction-Rollback (der Flow spannt mehrere Commits über die lib-Calls). Stattdessen: **(0) idempotentes Pre-Cleanup** (alle `golden-path-*`-Lead/Claim-Reste eines evtl. abgebrochenen Vorlaufs löschen) + **(10) `finally`-Cleanup** via `delete_fall_komplett(fall_id, claim_id)` (service-role-RPC) + `leads.delete`. Cleanup läuft AUCH wenn eine Stufe scheitert (finally), sodass ein Fehlschlag keine Waisen hinterlässt.

## 6. Form & Alerting

- **`/api/cron/golden-path`** (Route-Handler, `CRON_SECRET`-gated): ruft `runGoldenPath()`. Doppelnutzung: manueller `curl` (sofortiges „was bricht") + nächtlicher VPS-Crontab-Eintrag (laufende Beweisführung).
- **Alerting:** Bei `report.ok===false` → `recordFailedOperation({ operationType:'golden_path', dedupKey:'golden-path-daily', error: <erste gescheiterte Stufe> })` (Dead-Letter, `src/lib/reliability/dead-letter.ts`; der recovery-monitor-Cron eskaliert an Admins). Bei Erfolg → `markOperationResolved('golden-path-daily')`. (Alternativ/zusätzlich der Health-`persistAndAlert` — Entscheidung im Plan; Dead-Letter ist der schlankere Pfad.)
- **Output:** Response-JSON = der `GoldenPathReport` (pro Stufe ok + detail + ms). Für den manuellen Lauf sofort sichtbar.

## 7. Wiederverwendung

- **Muster** aus `src/lib/smoke/lifecycle-seed.ts` (Test-Marker, Admin-Client-Inserts, delete-by-marker) — aber NICHT der Seeder selbst (er erzeugt statische Phasen-Snapshots, treibt die Pipeline nicht).
- **Referenz** `tests/e2e/flows/smoke-vollstrecke.spec.ts` (Playwright, Browser) — andere Form (CI/Browser), kein Ersatz für den headless Prod-Cron.
- **Alerter** aus der Pipeline-Observability (`persist-and-alert.ts` / `dead-letter.ts`) — wiederverwenden, nicht neu bauen.

## 8. Risiken

- **Comms an reale Empfänger** (§4) — höchstes Risiko; mitigiert durch Test-Kontakte + Safety-Nets + Impl-Auflage-Verifikation.
- **Cleanup-Fehlschlag → Prod-Waisen** — mitigiert durch idempotentes Pre-Cleanup (nächster Lauf räumt auf) + `finally`-Cleanup + Marker-basierte Löschung.
- **Geteilte Prod-DB** — Testdaten existieren kurz in Prod; bewusst freigegeben (Aaron). Marker + `@claimondo.test` halten sie klar abgegrenzt.
- **Kanzlei-Extern nicht exerziert** — das Test-Safety-Net skippt den realen Salesforce-Push; die externe Integration wird NICHT vom Golden-Path geprüft (separate Überwachung; im Report als `skipped` sichtbar).
- **Nebenläufigkeit** — zwei parallele Läufe könnten sich beim Marker-Cleanup stören; mitigiert durch Timestamp-eindeutige Lead-Emails + der Cron läuft seriell.

## 9. Erfolgskriterien

- Ein `/api/cron/golden-path`-Aufruf treibt einen Fall von Lead bis `abgeschlossen` und meldet **pro Stufe** ok/fail mit Detail.
- Beim ersten Prod-Lauf werden die realen Bruchstellen der hinteren Funnel-Hälfte sichtbar (Erwartung: es bricht irgendwo — das ist der Wert).
- `claims.lead_preis_netto` wird nach Stufe 5 gesetzt (beweist den Billing-Hook e2e).
- Nach jedem Lauf: **keine** `golden-path-*`-Reste in Prod (Cleanup verifiziert).
- **Keine** echte Nachricht an einen realen Empfänger (Comms-Safety verifiziert).
- Cron alertiert bei Fehler über den bestehenden Dead-Letter/Recovery-Pfad.
- `build`/`tsc` grün.
