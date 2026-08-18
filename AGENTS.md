<!-- BEGIN:claimondo-hard-rules -->
# Harte Regeln (Niemals brechen)

Diese drei Regeln sind nicht verhandelbar. Jede Session, jeder Commit, jede Migration muss sie einhalten. Sie entstanden aus konkreten Incidents — siehe Session-Referenzen.

## Regel 1 — Nie direkt auf `main` pushen

Jede Arbeit läuft auf einem Feature-Branch mit Linear-Ticket-Namensschema (`kitta/aar-<nr>-<slug>`), PR gegen `staging`, Merge erst nach Review. **Direct-Push auf `main` ist verboten**, auch wenn der Commit „sauber" wirkt.

Begründung: Session vom 19.04.2026 — Commits `572cbea` (AAR-582) und `65a876b` (AAR-580) wurden direkt auf `main` gepusht. Inhaltlich sauber, aber der Flow-Bruch zerstört Preview-Deploys + Review-Spur + Rollback-Sicherheit.

Bei Unfall: `git revert` + neuer Branch + PR.

## Regel 2 — DDL nur über das Supabase-Plugin (MCP), nie über CLI oder raw SQL

Schema-Änderungen (ADD/DROP/ALTER COLUMN, CREATE/DROP TABLE, CREATE TRIGGER, CREATE FUNCTION, RLS-Policies usw.) ausschließlich über das **Supabase-Plugin** (`mcp__plugin_supabase_supabase__apply_migration`). **Nicht** über die supabase-CLI (`db push`) — die macht in unserem Multi-Worktree-Setup wiederkehrend Auth-/Link-/Drift-Ärger (Worktrees sind nicht linked, kein Token im `.env.local`). Entscheidung Aaron 2026-05-28: **immer das Plugin.**

Ablauf:

```
1. DDL schreiben.
2. apply_migration({ name: "<snake_case>", query: "<DDL>" })   → wendet an UND trackt in supabase_migrations.schema_migrations.
3. list_migrations   → die vom Plugin vergebene Version <V> ablesen (es setzt einen EIGENEN Timestamp — nicht den, den du raten würdest).
4. Migration-File committen als supabase/migrations/<V>_<name>.sql   → Dateiname == getrackte Version <V>.
5. execute_sql (READ) zum Verifizieren der Spalte/Constraint.
6. Typen regenerieren + MIT committen (src/lib/supabase/database.types.ts) — kein Aufschieben mehr:
   die Datei ist die Referenz des check:query-drift-Ratchets; Types-Lag erzeugt dort Baseline-
   Rauschen, das echte Drift-Bugs maskiert (16.07. empirisch: 130 aufgelaufene stale-Eintraege
   verdeckten 2 echte Silent-Bugs). Bei grossem Schema truncatet der MCP-Output → CLI nutzen:
   `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public`
   (reine LESE-Generierung — faellt NICHT unter das CLI-DDL-Verbot unten). Danach
   `npm run check:query-drift -- --update-baseline`, wenn die Baseline schrumpft.
```

**Pflicht: Schritt 3+4** — die getrackte Version ablesen und das committete File exakt danach benennen. Sonst **Twin-Drift** (File-Timestamp ≠ getrackte Version): `db reset` bzw. ein künftiges CLI-`db push` sähe das File als „nicht appliziert" und führte die DDL erneut aus → Fehler.

**Verboten:**
* **raw `execute_sql` mit DDL-Payload** (oder `POST /v1/projects/{ref}/database/query`) — bypasst das Migrations-Tracking → Drift. `execute_sql` nur für READ-Queries.
* **`npx supabase db push` / sonstige CLI-DDL** — die Auth-/Link-/Drift-Probleme aus unserem Setup (s. o.).
* **direkte DDL im Supabase Studio** ohne korrespondierende Migration-Datei.

Begründung: `apply_migration` ist — anders als raw `execute_sql` — der *getrackte* Pfad: es schreibt `schema_migrations` selbst, das Schema bleibt reproduzierbar. Der alte CLI-Zwang (AAR-600) richtete sich gegen *ungetracktes* Management-API-DDL; das Plugin-`apply_migration` trackt korrekt, und die CLI selbst war in unserem Multi-Worktree-Setup die eigentliche Fehlerquelle (kein Link/Token im Worktree). Einziger Fallstrick = Twin-Drift, den Schritt 3+4 verhindert (erstmals gelebt in DE-4 #1891: File von `001919` auf recorded `20260528081906` angeglichen).

## Regel 3 — Kein unbegleiteter Stash am Session-Ende

Wenn am Ende einer Session ein `git stash`-Eintrag existiert, der Code-Änderungen enthält, MUSS vor Session-Abschluss:

* entweder der Stash auf einen Branch gepoppt und committed werden (+ PR falls ready)
* oder der Stash explizit discardet werden (`git stash drop`) mit Begründung im Abschluss-Report
* **niemals:** Stash liegen lassen und die zugehörige DB-Migration trotzdem applizieren

Begründung: AAR-599 Prod-Breaker — N4-Code (sv_treffpunkt → besichtigungsort_*) lag im `stash@{0}`, DB-Migration wurde trotzdem via Management-API applied. Ergebnis: `main` referenzierte eine gedroppte Spalte, jeder Phase-2-Save + FlowLink-Anzeige warf Runtime-Errors. Die DB war voraus, der Code war zurück — genau die Drift-Konstellation, die Regel 2 verhindern soll.

**Session-Abschluss-Checkliste:**

```
git status                # Working-Tree clean?
git stash list            # Leer oder alte persistente Stashes dokumentiert?
git log --branches --not --remotes   # Alle lokalen Commits auf Remote gepusht?
```

## Regel 4 — Nach jedem PR ein vollständiger Prod-Playwright-Smoke

Eine Aufgabe ist erst **abgeschlossen**, wenn ihre betroffenen Nutzer-Flows auf **Prod** (`https://app.claimondo.de`) per Playwright end-to-end durchgespielt wurden. Build-, `tsc`- und CI-grün beweisen **Kompilierbarkeit, nicht Verhalten** — nur der Prod-Smoke beweist, dass das Feature für echte Nutzer live funktioniert. „Build grün" reicht **nicht** als Abschluss-Kriterium.

**Geltungsbereich:** Änderungen mit nutzersichtbarem/verhaltensrelevantem Impact (UI, Route, Server-Action, DB-Write-Pfad, Cron). Reine Docs-/Scripts-/Config-Änderungen ohne Runtime-Flow-Impact sind ausgenommen (im PR kurz vermerken — dieser Regel-PR selbst ist so ein Fall).

**Pflicht:** Sobald die Änderung auf Prod deployed ist, einen **vollständigen** Playwright-Smoke gegen Prod fahren, der **jeden** betroffenen Flow end-to-end abdeckt:

```
PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test <specs>   # oder das webapp-testing-Skill
```

**Ablauf:**

1. **ZUERST das operative Soll — vor jedem Seed, jedem Klick, jeder Spec-Zeile.** Formuliere als Nutzer-Schrittfolge, wie das Feature **operativ ablaufen SOLLTE** — aus Nutzer-/Business-Sicht, **hergeleitet aus der Fachlogik, NICHT aus dem Code gelesen**. Das Soll ist die Referenz, gegen die gesmoked wird; der Code ist der Prüfling, nicht der Maßstab. Das Soll gehört in den PR/Marker (kurz, in Prosa) und wird **mit Aaron abgesprochen**, bevor final bewertet wird.
2. **Smoke-Plan benennen** (im PR/Marker): welche Flows, welche Specs, welche Test-Konten — abgeleitet aus dem Soll aus Schritt 1.
3. **Nach Prod-Deploy:** vollständigen Smoke **gegen das Soll** fahren; Ergebnis (grün/rot + Assertions/Screenshots) im PR/Marker dokumentieren. **Jede Abweichung Code↔Soll ist ein BEFUND**, keine Seed-Hürde, um die man herumbaut.
4. **Rot →** Fix nachziehen (neuer PR); **nicht** als „erledigt" markieren, solange der Prod-Smoke rot ist.
5. **Deploy nicht in dieser Session?** Die Smoke-Pflicht **explizit im Marker** an die Merge-/Deploy-Session übergeben (**inklusive des ausformulierten Solls** + Flow-Liste + Test-Konten). Die Aufgabe bleibt **offen** bis zum grünen Prod-Smoke.

**Alles per UI:** Der Smoke fährt den operativen Weg durch die **echte Benutzeroberfläche** — echte Logins, echte Klicks, über **alle** beteiligten Rollen (z. B. Werkstatt UND Kunde), nicht per DB-Seed abgekürzt. DB-Seed ist **nur** für den realistischen **Ausgangszustand** erlaubt, den ein vorgelagerter (evtl. fremder/instabiler) Schritt erzeugt hätte. **Jeder Zustandsübergang, der zum getesteten Soll gehört, ist ein echter UI-Klick** — ein geseedeter Zwischenzustand verdeckt genau den Schritt, den der Smoke beweisen soll.

**Sicherheit — kein Kollateralschaden auf Prod:**

* Immer **Test-Konten** nutzen (`telefon = NULL`) → es gehen **keine** echten SMS/WhatsApp/Emails an reale Kunden raus.
* Flows, die zwingend echte Kunden-Comms oder destruktive/irreversible Writes auslösen würden: über Test-Lead/Test-Konto fahren; wenn technisch unmöglich, per Read-Surface + Live-DB-Verifikation absichern und **im Marker begründen**, warum der UI-Trigger nicht lief.
* **Niemals** Prod-Daten echter Kunden mutieren oder löschen.

Begründung: Wiederholt war „build grün" ≠ „live nutzbar" (Feature nie erreichbar, Route 500, Silent-DB-CHECK-Reject, den kein Build/`tsc` fängt). Der Prod-Smoke ist die einzige Instanz, die echtes Nutzerverhalten prüft. Codifiziert den Broadcast-Mandat (11.07., Aaron) als harte Regel.

Begründung „Soll zuerst" (Schritt 1, Aaron-Regel 27.07., verankert 11.08.): Ein Smoke, der nur die Implementierung nachfährt („seede den Zustand, den der Code erwartet, treibe den Pfad, den der Code nimmt"), bestätigt bloß *„Code tut, was Code tut"* — eine **Tautologie**. Er verdeckt die Lücke zwischen dem, was gebaut wurde, und dem, was Nutzer/Geschäft brauchen. Ausgelöst durch den #4567-Reparatur-Funnel-Smoke: auf `reparatur-laeuft` geseedet + nur den Abschluss getrieben → bestätigte den Code-Pfad statt des vollen operativen Wegs (Schadenmeldung → Kunden-Beleg). Wer das Soll erst nach dem Code formuliert, schreibt die Implementierung als Maßstab fest — genau das soll diese Regel verhindern.
<!-- END:claimondo-hard-rules -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:claimondo-language-rules -->
# Sprache & Zeichensatz — VERBINDLICH (nur Frontend)

Dieses Projekt ist ein deutsches Produkt für deutsche Nutzer. **Alle nutzersichtbaren Texte** werden auf Deutsch mit korrekten Umlauten geschrieben. Backend-Texte (Commits, Comments, Logs, interne Docs) sind freigestellt — ASCII-Ersatz ist dort egal.

## Pflicht: Umlaute in Frontend-Texten

| Falsch (ASCII-Ersatz) | Richtig (Umlaut) |
|---|---|
| `Fuer` | `Für` |
| `loescht` | `löscht` |
| `naechsten` | `nächsten` |
| `Aenderung` | `Änderung` |
| `Ueberweisung` | `Überweisung` |
| `groesse` | `größe` |
| `Strasse` | `Straße` |

In Frontend-Texten **niemals** `ae`/`oe`/`ue`/`ss` als Umlaut-Ersatz verwenden. Immer die echten UTF-8 Zeichen `ä`, `ö`, `ü`, `ß`, `Ä`, `Ö`, `Ü`.

## Pflicht (Umlaute) gilt für

- ✅ JSX-/TSX-String-Literale in der UI (Buttons, Labels, Toasts, Alerts, Headings, Form-Placeholder)
- ✅ Email-Templates (react-email-Files) die an User rausgehen
- ✅ PDF-Generation-Strings die User sehen
- ✅ WhatsApp-/SMS-Templates
- ✅ Notion-Updates und Linear-Issue-Texte (kunden-/team-sichtbar)

## Egal (ASCII-Ersatz erlaubt)

- Git Commit-Messages
- Code-Comments in TS/TSX/JS/SQL/JSON
- Interne Markdown-Dokumentation in `docs/`
- console.log-Strings und Error-Messages die nur in Logs landen
- Variablen-/Funktions-/DB-Namen (waren eh schon ASCII-only)
- ENV-Vars und API-Konstanten

## Begründung

Frontend-Umlaute sind Brand-Standard — `"Fuegt Loeschen-Funktion fuer Mandanten hinzu"` in einer UI wirkt unprofessionell. Backend-Code sieht außer Entwickler:innen niemand — dort lohnt der Friction nicht.

**Aktualisiert 2026-05-15** nach Aaron-Klarstellung. Der frühere Pre-Commit-Hook `.claude/hooks/check-umlauts.mjs` ist deaktiviert (exit 0). Eine spätere PostToolUse-Variante könnte stattdessen UI-Strings in `.tsx` / Email-Templates prüfen — TODO, nicht akut.
<!-- END:claimondo-language-rules -->

<!-- BEGIN:post-task-audit -->
# Post-Task-Audit — 7-Punkte-Pflicht-Selbstprüfung

Vor **jedem** Commit musst du die folgenden 7 Audit-Punkte explizit durchgehen. Kein Commit ohne dokumentierten Audit-Status. Der Audit ist nicht optional und nicht situationsabhängig — auch bei einer Ein-Zeilen-Änderung.

## Die 7 Audit-Punkte

### 1. Build Check
`npm run build` (oder mindestens `npx tsc --noEmit`) muss grün durchlaufen. Kein „typecheck reicht"-Ausweichen bei Änderungen an Routen, Layouts oder Server-Actions — bei diesen **immer** den vollen Build fahren, weil Next.js 15 dort Validator-Fehler zur Build-Zeit findet, die TypeScript allein nicht sieht.

### 2. UI-Erreichbarkeit
Jedes neue Feature muss über einen sichtbaren Einstiegspunkt (Button, Link, Nav-Item, Tab, Drawer-Trigger) erreichbar sein. Prüfe explizit:
- Gibt es einen Trigger-Button an der richtigen Stelle?
- Ist der Button für die richtige Rolle sichtbar (Dispatch/Admin/SV/Kunde)?
- Werden Redirects alter Pfade beibehalten, damit Bookmarks nicht brechen?

### 3. Redundanz-Check
Hast du Logik dupliziert statt eine bestehende Shared-Component / Shared-Util wiederzuverwenden? Vor jeder neuen Komponente prüfen:
- Gibt es schon `src/components/<Name>` oder `src/lib/<Name>`?
- Existiert eine ähnliche Funktion in der gleichen Domain (z. B. `lib/communications/send`, `lib/dispatch/findBestSV`)?
- Wenn ja → importieren statt kopieren. Wenn nein → Bei >2 Consumern direkt als Shared extrahieren.

### 4. Dead-Code-Check
- Alte Dateien tatsächlich gelöscht (`git status` prüfen) oder nur vergessen?
- Imports die ins Leere zeigen? (`grep -rn "from '<gelöschter-Pfad>'" src/`)
- Unbenutzte `revalidatePath`-Aufrufe auf Pfade die es nicht mehr gibt?
- Stale Kommentare die noch auf W-Phasen / alte Components verweisen?
- `const _unused =`-Variablen, `any`-Casts die mit dem Fix obsolet wurden?

### 5. Spec-Treue
Alle Akzeptanzkriterien aus dem Linear-Issue durchgehen — **in der Reihenfolge** in der sie im Ticket stehen. Bei jedem Haken-Punkt explizit fragen: „Habe ich **genau** das gebaut oder interpretiert?" Abweichungen müssen im Commit-Body mit Grund dokumentiert sein (z. B. „SachverstaendigeListClient nicht gelöscht weil Dispatch-Portal es noch nutzt").

### 6. Inkonsistenz-Check
- **Design-Tokens:** Farben aus dem Claimondo-Schema (`#0D1B3E`, `#4573A2`, `#7BA3CC`, `#f8f9fb`) — nie Tailwind-Defaults wenn ein Claimondo-Ton existiert
- **Naming:** `erstellt_am` vs `created_at` — DB-Spalten nicht raten, mit Supabase-MCP verifizieren
- **Umlaute:** UI-Strings + Commit-Messages + Kommentare auf echte `ä`/`ö`/`ü`/`ß` prüfen
- **Error-Handling:** Server-Actions liefern `{ success: boolean; error?: string }` — nicht `throw` mischen; bei Non-Critical-Sends (WA/Email) mit try/catch wrappen, damit Status-Updates atomar bleiben
- **revalidatePath:** bei jedem Write die betroffenen Routen (`/dispatch/leads/${id}`, `/admin/faelle`, etc.) nachziehen
- **Nested-FK:** Supabase `select('a(b(c))')` liefert je nach Cardinality Array oder Objekt — **immer** mit `Array.isArray(x) ? x[0] : x` normalisieren

### 7. Regression-Check
- Wird die geänderte Funktion/Route von anderen Stellen konsumiert? (`grep -rn "<funktionName>\\|<routePath>" src/`)
- Gibt es „Nachbar"-Features (andere Phasen / Tabs / Sub-Routen) die durch ein Layout-File oder einen Shared-State betroffen sind?
- Bleibt die Auth/Rollen-Weiche intakt? (Admin → nur admin, Dispatch → nur dispatch, etc.)
- Funktionieren alte Bookmarks per Legacy-Redirect weiter?

## Commit-Message-Format

Jede Commit-Message muss den Audit-Status im Body enthalten — ganz unten, direkt über der Co-Authored-By-Line. Format:

```
feat(KFZ-AAR-XXX): <titel>

<beschreibung der änderung>

Audit:
- Build: grün (npm run build / tsc --noEmit)
- UI: <neuer einstiegspunkt> an <position>
- Redundanz: <shared-component genutzt / keine duplikation>
- Dead-Code: <was gelöscht wurde / nichts>
- Spec: <alle akzeptanzkriterien erfüllt / abweichung siehe ...>
- Inkonsistenz: <tokens/naming/error-handling ok>
- Regression: <konsumenten geprüft — intakt>

Co-Authored-By: ...
```

Bei reinen Bugfix-Commits darf der Audit kürzer sein, aber alle 7 Punkte müssen angesprochen sein — und sei es mit „n/a (kein UI-Change)".

## Begründung

Bisher sind mehrfach Inkonsistenzen durchgerutscht (AAR-123 Tabs statt integrierter View, `flow_links.created_at` statt `erstellt_am`, `faelle.vollmacht_unterschrieben` existierte nicht, `KarteHubClient h-[calc(100vh-120px)]` nach Layout-Move). Jeder dieser Fehler wäre durch einen der 7 Punkte oben gefangen worden. Der Audit ist Pflicht, kein Vorschlag.

# Feature-Definition-of-Done — Journey-Zyklus (Fundament D1)

Verfassungsprinzip „Kein Feature ohne Reise" (Fundament §1, Prinzip 10): operatives Soll in Prosa **vor** dem Bau, Journey-Smoke **vor** dem Merge. Für jede Änderung, die eine der 10 Journeys (`docs/fundament/journeys/j01…j10`) berührt, gilt **zusätzlich** zum 7-Punkte-Audit dieser Zyklus:

1. **Soll zuerst (Journey-Delta VOR dem Bau).** Das neue/geänderte Soll-Verhalten wird als Journey-Abschnitt geschrieben — im **selben PR**, bevor der Code steht. Neue Journey → neue Datei im Pflichtformat (Fundament §A1); Änderung → Delta in der bestehenden Journey. Kein Feature-Code ohne vorher aufgeschriebene Soll-Erwartung.
2. **Journey-Spec nachziehen.** Der zugehörige Journey-Smoke (`tests/e2e/…`, Schrittnummer als Kommentar → Traceability Spec ↔ Journey) wird auf das neue Soll aktualisiert; neue nicht-automatisierbare Schritte als `test.skip` mit Begründung + Journey-Referenz (nie stillschweigend weglassen).
3. **Journey-Smoke grün VOR Merge.** Nachweis über den Prod-Smoke-Weg (Regel 4: Kommando + Output im PR) VOR dem Merge; der CI-Journey-Step (`e2e`-Job) läuft **post-merge** gegen prod und ist die Dauer-Absicherung (einmal grün → nie wieder rot gemergt). Rot → nicht mergen.

**Verhältnis zu Regel 4:** Regel 4 (Prod-Smoke nach Deploy) bleibt der Abschluss-Beweis für **jeden** verhaltensrelevanten PR. D1 zieht für **Journey-berührende Feature-Arbeit** den Beweis nach vorn (Soll + grüner Journey-Smoke als Merge-Voraussetzung) und macht damit „OFFEN: Regel-4" für die abgedeckten Journeys zur strukturellen Ausnahme statt zur Dauerschuld.

**Abgrenzung:** Reine interne Tools/Doku/Config/Scripts ohne Bezug zu einer J1–J10-Journey sind ausgenommen (im PR kurz vermerken). Steuerdokument des Programms: `docs/fundament/FUNDAMENT.md`; die 10 Journeys: `docs/fundament/journeys/`; der Journey-Smoke-CI-Step lebt im `e2e`-Job (`.github/workflows/ci.yml`).

# Server-Actions — Error-Handling-Pattern

Server-Actions (`'use server'`-Files unter `src/app/**/actions.ts`) müssen einem festen Pattern folgen, damit Caller keine try/catch-Mischung um sie wickeln müssen.

## Regel: Result-Object statt throw

```typescript
// ✅ RICHTIG — Result-Object
export async function markiereAlsBezahlt(
  abrechnungId: string,
  betrag: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('abrechnungen').update({...}).eq('id', abrechnungId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/finance')
  return { ok: true }
}

// ❌ FALSCH — throw
export async function markiereAlsBezahlt(abrechnungId: string, betrag: number): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('abrechnungen').update({...}).eq('id', abrechnungId)
  if (error) throw new Error(error.message)
}
```

**Caller-Pattern:**

```typescript
// ✅ Result-Check
const result = await markiereAlsBezahlt(id, brutto)
if (!result.ok) toast.error(result.error ?? 'Fehler')

// ❌ try/catch um Server-Action
try { await markiereAlsBezahlt(id, brutto) } catch (err) { toast.error(err.message) }
```

## Welcher Result-Shape?

Zwei akzeptierte Varianten — **konsistent innerhalb eines Files bleiben**:

* **`{ ok: boolean; error?: string }`** — Standard für boolean-Ergebnisse
* **`{ ok: true; data: T } | { ok: false; error: string }`** — wenn der Erfolgsfall einen Wert zurückliefert

Vermeide den Mix mit `success` (alte Files), neue Code-Pfade nutzen `ok`.

## Ausnahmen

* **Non-critical Sub-Operations** (WhatsApp/Email-Sends, Timeline-Inserts, Mitteilungen) bleiben in lokalen `try { ... } catch (err) { console.error(...) }`-Blöcken, damit ein Twilio-Fail nicht den Status-Update atomar bricht
* **Auth-Guards** (`requireAdmin()`-Helper) dürfen werfen — sie sind per Konvention Pre-Conditions und der Caller behandelt sie als Crash, nicht als Form-Fehler

## revalidatePath nicht vergessen

Jede mutierende Server-Action **muss** die betroffenen Routen revalidieren:

```typescript
revalidatePath('/admin/faelle')
revalidatePath(`/dispatch/leads/${leadId}`)
return { ok: true }
```

Faustregel: Welche Server-Component zeigt die geänderte Tabelle/Zeile an? Genau der Pfad muss revalidiert werden.

## Begründung

Vor AAR-800 mischten ~30 Server-Actions throw + Result-Object — Caller mussten beides absichern (try/catch + result.ok), oft brachen Errors stillschweigend durch. AAR-308/309 (`createKundeAccount`) hat das Pattern eingeführt, AAR-800/802 hat es konsequent durchgezogen. AAR-664 hat zusätzlich gezeigt, dass Konstanten/Types **nie** aus `'use server'`-Files exportiert werden dürfen — Client-Bundle macht `undefined` daraus.
<!-- END:post-task-audit -->

<!-- BEGIN:claimondo-component-set -->
# Komponenten-Set — verbindlich

Es gibt **drei Layer**, jeder mit einem klaren Zweck. Neuer Frontend-Code nutzt sie; handgerolltes Tailwind-Markup für Komponenten ist kein Standard mehr. (Entscheidung 12.05.2026, Mobile-App = React Native → der `primitives/*`-Dual-File-Pfad gilt. Ausführlich: `docs/12.05.2026/FRONTEND/KOMPONENTEN-SET-POLICY.md`.)

## 1 · Atom-Layer = `@/components/primitives/*`
Dual-File Web+Native (`*.web.tsx` + `*.native.tsx` + `*.types.ts`), gebunden an `src/lib/design-tokens.ts`. **Pflicht** für: Button, Card/Section-Container, Modal/Sheet/Drawer, Text, Box/Stack/Row, Badge, Icon, CloseButton.
- **Kein** `<button className="…rounded-…bg-claimondo-navy…">` und **kein** `<div className="bg-white rounded-… border border-claimondo-border p-…">` mehr für neuen Code — das sind `primitives.Button` bzw. `primitives.Card`/`shared/SectionCard`.
- Neue Atoms kommen hierhin (mit beiden Plattform-Files + `.types.ts`). Werte nur aus `design-tokens.ts`. Web/Native-Asymmetrien als JSDoc ins `.types.ts`.

## 2 · Composite-Layer = `@/components/shared/*`
Zusammengesetzte Bausteine, gebaut **auf** `primitives/*` (bzw. token-gebundenem Tailwind wo kein passendes Primitive existiert): `PageHeader`, `StatusBadge`/`FallStatusBadge`, `EmptyState`/`ErrorState`/`LoadingSkeleton`, `StatCard`, `SectionCard`, `DataTable` (Tabellen-Set `Table`/`Thead`/`Tbody`/`Tr`/`ClickableTr`/`Th`/`Td` + `DataTableContainer`), `forms/TextField`+`forms/SelectField`, `AvatarUpload`, `PhoneButton`, `GlassPanel`/`glass/*`, `portal-nav/*`, `fall-*`, `stammdaten/*`, `TerminCard`, `VersichererSelect`, `NotificationPreferencesForm`, `StepIndicator`, …
- Muster in **>2 Stellen** → hierhin extrahieren statt es zum dritten Mal inline zu bauen.
- **Tabellen-Listen / Dashboards:** `@/components/shared/DataTable` statt handgerolltem `<thead className="bg-claimondo-bg text-xs uppercase …">` / `<td className="px-4 py-3 …">`. `className` wird via `cn()`/tailwind-merge gemergt — kollidierende Caller-Klassen gewinnen ohne `!`. (Tailwind v4: `!important` ist der **Suffix** `class!`, nicht der Prefix `!class` — der Prefix generiert in v4 keine Regel.)

## 3 · Web-only Rich-Components = `@/components/ui/*` (shadcn/Radix)
Erlaubt **nur** für desktop-spezifische Rich-UI ohne sinnvolles Native-Pendant: `tabs`, `select`, `dialog`, `sheet`, `dropdown-menu`, `checkbox`, `input`, `label`, `textarea`, `separator`, `Chip`, `loading-button`, `PasswordInput`, `sonner`. **Nicht** für Atoms — Buttons/Cards/Badges/Modals kommen aus `primitives/*`; **Tabellen** aus `shared/DataTable` (`ui/table` war shadcn-getokt + 0-Consumer → 2026-05-12 gelöscht). (Die Mobile-App baut Listen/Tabellen/Date-Picker eh mit Native-Patterns neu, ein 1:1-Port ist nicht geplant — daher lohnt Radix' Accessibility-Arbeit für Web-Desktop, ohne die Atom-Konsistenz zu brechen.)

## Was NICHT betroffen ist
Reine Layout-Utilities (`flex`/`grid`/`gap-*`/`px-*`/`mt-*`) auf Wrapper-Divs bleiben normal — die Regel betrifft *Komponenten*, nicht Spacing. Farb-/Theming-Konventionen siehe Abschnitt „branding-rules".

## Begründung
Vor dieser Policy existierten drei „offizielle" Sets nebeneinander mit <10 % Adoption (`ui/*` shadcn fast tot, `primitives/*` ~28 Consumer) — handgerolltes Tailwind war der rationale Default für jeden Entwickler, und Inline-`StatCard`/`FilterChip`/`MiniDrawer`/`SectionCard` reproduzierten sich (Bestandsaufnahme: `docs/12.05.2026/FRONTEND/FRONTEND-REDUNDANZ-AUDIT-12.05.2026.md`, ~3.000–4.500 LOC dupliziert). Eine Schicht festlegen ist der Hebel.

## Durchsetzung (Ratchet, ab Phase 2)

CI fährt `npm run check:component-set -- --ratchet`. Es blockt **neue** handgerollte Buttons/Cards/Tables/Reimplementierungen gegen `scripts/component-set-baseline.json` (Menge der bei Phase-2-Start bekannten Verletzer). Bestand wird per **Boy-Scout** abgebaut: Wer ein File anfasst, migriert dessen Buttons/Cards aufs Primitive und senkt die Baseline mit `npm run check:component-set -- --update-baseline`. Lokal (ohne Flag) bleibt das Script `--warn` (exit 0).

**Button-API:** `onClick`/`variant` sind kanonisch und die einzigen Namen. Die früheren `onPress`/`tone`-Aliase wurden nach dem Rename-Codemod entfernt (alle Call-Sites migriert). `loading` zeigt Spinner + deaktiviert.

Design/Plan: `docs/superpowers/specs/2026-05-28-component-set-ratchet-design.md` + `docs/superpowers/plans/2026-05-28-component-set-ratchet.md`.
<!-- END:claimondo-component-set -->

<!-- BEGIN:claimondo-status-registry -->
# Status-Registry-Gate (Ratchet)

Status-/Phasen-Badges ziehen Label + Farbe aus der zentralen getypten Registry `src/lib/status/` (`resolveStatus`/`statusLabel`/`statusSlotClass` + `<StatusBadge domain=.../>` / `<FallStatusBadge>` / `<FallPhaseBadge>`). Farbe = einer der 7 Token-Slots (`neutral/active/pending/done/success/warning/danger`), nie roh — branded via `var(--brand-*)`, token-audit-safe. Rollen-Varianten via `labelByRole` (verallgemeinert das alte `labelKunde`).

CI fährt `npm run check:status-registry -- --ratchet`. Es blockt **NEUE** inline Status-/Farb-Maps (`const STATUS_COLORS = {…}`, `PHASE_PILL_COLOR`, `*_BADGE`, `*_CLS`) + Status-Farb-Ternaries (`status === 'x' ? 'bg-…'`) in `src/app/**` + `src/components/**` (ohne `ui/primitives/shared` — dort leben die sanktionierten Badge-Komponenten) gegen `scripts/status-registry-baseline.json`. Bestand (41 grandfathered) wird per **Boy-Scout** abgebaut: Consumer auf die Registry migrieren + Baseline mit `npm run check:status-registry -- --update-baseline` senken. Lokal (ohne Flag) `--warn` (exit 0).

**Skip** (echte Nicht-Status-Farben — Chart-/Kategorie-Palette, Kanal-Identität): `// status-registry-skip: <grund>`-Header am File-Anfang. Pure-Logik: `scripts/lib/status-registry-scan.mjs`.

**Nur COLOR-Logik gegatet** — reine Label-Maps (`Record<code,string>` ohne Farbe) sind erlaubt (Labels ≠ Branding). Zentrale Maps (`src/lib/statusLabels.ts`, `src/lib/status/*`, `src/components/shared/claims/*`) liegen ausserhalb des Scans = bewusst exempt.

Design: `docs/superpowers/specs/2026-07-04-status-badge-registry-design.md`.
<!-- END:claimondo-status-registry -->

<!-- BEGIN:dead-code-gate -->
# Dead-Code-Gate (knip)

CI fährt `npm run check:knip -- --ratchet`. Die Drift-Bremse blockt **NEUE** ungenutzte Files + **NEUE** unused/unlisted Dependencies gegen `scripts/knip-baseline.json`. Bestand (aktuell ~113 tote Files, meist verwaiste CMM-23-/W-Phasen-Reste + transition-dead Email-Templates während des P3-Sweeps) wird per **Boy-Scout** abgebaut: Wer tote Files entfernt, senkt die Baseline mit `npm run check:knip -- --update-baseline`. Lokal (ohne Flag) bleibt das Script `--warn` (exit 0).

**Was gegatet wird:** unused **files** + unused/unlisted **dependencies** (verlässlichste Kategorien).
**Was NICHT gegatet wird** (nur `--warn`, sichtbar aber non-blocking): unused **exports** (~200) + **types** (~23) — zu FP-behaftet wegen Barrel-Re-Exports (`index.ts`) und Server-Actions, die per `<form action={fn}>` verdrahtet sind (für knip unsichtbar).

**Dep-Whitelist** (`WHITELISTED_DEPS` in `scripts/check-knip.mjs`): von knip als unused gemeldet, aber echt genutzt — verifiziert per file:line (17-Agenten-Audit 2026-05-29). Enthält u.a. `@types/google.maps` (ambient global `google.maps.*`, Drop bricht tsc — Incident in #2015), `@types/mapbox-gl`, `next-themes`, `shadcn`/`tw-animate-css` (CSS-`@import`, knip parst kein CSS), `supabase` (CLI). Neue FP → hier mit Begründung ergänzen, NICHT die Baseline aufblähen.

**knip-JSON-Gotcha:** Im `--reporter json` ist `issue.files` ein **Array** (`[{name}]` = File selbst unused; `[]` = nur andere Issues wie unused exports). Truthy-Check (`if (issue.files)`) zählt falsch — immer `Array.isArray(x) && x.length > 0`. Ebenso respektiert der JSON-Reporter `workspaces.project` nicht wie der Default-Reporter → scripts/, *.config, sentry/instrumentation gehören in top-level `ignore` (nicht nur `project`).

Audit/Befund: `docs/superpowers/specs/2026-05-29-knip-deadcode-audit.md`.
<!-- END:dead-code-gate -->

<!-- BEGIN:test-gate -->
# Test-Gate (vitest Ratchet)

CI (`ci.yml`) faehrt `build` + ~20 Checks (typecheck/lint/alle Ratchets), aber **NIE `vitest run`** — das Script `test = vitest run` existiert, wird in CI nur nie aufgerufen. Dadurch sammelt `staging` **still Test-Breakage** an (15.07.: 15 rote Files; 19.07. gemessen: 19 Files / 31 Tests — wachsend), die <30 Min spaeter auf prod steht. `build`/`tsc` fangen das nicht (rote Unit-Tests brechen den Next-Build nicht).

CI faehrt jetzt einen **parallelen `vitest`-Job** (`npm run check:vitest -- --ratchet`, auf PRs + push, **kein `needs`** → laeuft parallel zum `build`, verlaengert die CI-Wall-Clock also nicht). Er blockt **NEUE** rot fehlschlagende Test-**Files** gegen `scripts/vitest-baseline.json`. **File-level** (nicht Test-level) = robust gegen per-Test-Flakiness; der Lauf nutzt `--retry=2` gegen transiente Flakes. Lokal (ohne Flag) `--warn` (exit 0, listet alle roten Files).

**Bestand (grandfathered)** wird per **Boy-Scout** abgebaut: wer ein rotes File gruen macht, senkt die Baseline mit `npm run check:vitest -- --update-baseline`. Ein **echter Flake** (nicht reproduzierbar rot) bleibt in der Baseline **mit Begruendung im PR** — nicht die Baseline fuer echte Regressions aufblaehen.

Pure-Logik: `scripts/check-vitest.mjs` (analog `check-knip.mjs`). **Kein prod-DB-Zugriff** — die vitest-Suite ist Unit/pure (kein `--env-file`), der Job braucht keine DB-Secrets und saettigt daher **nicht** den prod-Pool (anders als die `check:rls-*`-Checks).
<!-- END:test-gate -->

<!-- BEGIN:redirect-stub-gate -->
# Redirect-Stub-Gate (Ratchet)

**Eine `page.tsx`, die auf ALLEN Pfaden `redirect()`/`permanentRedirect()` (aus `next/navigation`) macht und KEINEN Content-`return` hat, ist verboten.** Solche reinen Redirect-Stubs triggern deterministisch **React-#310/#418** im Next-AppRouter → der Redirect feuert NICHT, prod rendert eine **leere 200-Shell** (Nav/Layout ohne Content). Kein Build/tsc/DB-Test/anderer Ratchet fängt das — **nur ein echter Prod-Render-Smoke**. Belegt 06.–07.07.: `/werkstatt/vermittlungen`, `/kunde/einstellungen`, `/gutachter/onboarding`, `/kunde/termin` rendeten alle leere Shells.

**Kanonischer Fix (in `next.config.ts` `redirects()` ~20× belegt — AAR-889/CMM-14):** HTTP-301/308-Redirect via `next.config.ts` `redirects()` + die `page.tsx` LÖSCHEN. Der Config-Redirect greift auf der Routing-Ebene **vor** jedem RSC-Render + vor der Auth-Middleware → bulletproof + anon-curl-verifizierbar (308 ohne Login). **Exakt-Match** (kein `:path*`) → aktive Sub-Routen (z.B. `/kunde/termin/[token]`, `/gutachter/onboarding/buero`) leben weiter.

**Abgrenzung (0 False-Positives):** NICHT betroffen sind **Content-Seiten**, die im Normalfall JSX rendern und nur als **Guard** redirecten (`if(!user)redirect('/login'); … return <JSX>`), (shell)-Layouts, DB-getriebene Router mit `return`. Faustregel: irgendein Content-`return` → ok; redirectet auf allen Pfaden (kein return) → Stub.

CI fährt `npm run check:redirect-stubs -- --ratchet`. Blockt **NEUE** Stubs gegen `scripts/redirect-stub-baseline.json` (Baseline = grandfatherte Bestands-Stubs, per Boy-Scout auf 0 abgebaut mit `-- --update-baseline`). Lokal (ohne Flag) `--warn` (exit 0). Pure-Logik: `scripts/lib/redirect-stub-scan.mjs` (unit-getestet). Broadcast/Details: `BROADCAST-redirect-stub-antipattern` (Memory).
# Fixed-Overlay-Safe-Area-Gate (Ratchet)

**Ein `position: fixed`-Overlay steht ausserhalb des Layout-Flusses und beansprucht seine Bildschirmecke DAUERHAFT. Landet Seiteninhalt dort, ist er nicht mehr klickbar — der Klick trifft das Overlay.** Die Ecke muss deshalb **im Fluss** reserviert werden.

**Zweimal real passiert, beide Male nur per Hand-Smoke gefunden** (kein Build/tsc/Ratchet fing es): **16.07.** der `GlobalPosteingangFab` fing Klicks auf die ZB1-Footer-Ecke ab; **11.08.** war „Weiter" im Embed-Wizard bei **1280×720** unklickbar (`document.elementFromPoint()` auf der Button-Mitte traf den FAB; bei 1920×1080 frei — deshalb fällt es auf grossen Monitoren nie auf). **Ein z-Index löst es nicht:** senken → das Overlay verschwindet hinter Modals (genau deshalb wurde es 16.07. von 9990 auf 950 gesenkt); heben → es frisst wieder Klicks.

**Der Vertrag** (Gegenstück zu `.has-corner-pill` für die Ecke *oben rechts*, siehe `globals.css`): Wer ein persistentes Ecken-Overlay mountet, reserviert dessen Footprint auf dem **scrollenden `<main>`** — `lg:pb-20` (80px > FAB-Footprint 64px). Betroffen sind die 4 Shells, die den FAB mounten: `gutachter/GutachterShell`, `admin/layout`, `faelle/layout`, `mitarbeiter/layout` (dispatch mountet ihn **nicht**). **Falle:** die Shells hatten `md:pb-0`/`lg:pb-0` — Bodenabstand nur für die **mobile** Tab-Bar, auf Desktop bewusst null. Genau dort lebt der FAB (`hidden lg:flex`).

CI fährt `npm run check:fixed-overlay -- --ratchet`. **Zwei Regeln** gegen `scripts/fixed-overlay-safearea-baseline.json`:
* **Regel 1 (hart, Baseline 0):** File mountet ein Overlay aus `OVERLAY_COMPONENTS` → sein `<main>` MUSS `lg:pb-{MIN_SAFE_PB}`+ tragen. Präzise, 0 False-Positives.
* **Regel 2 (grandfathered, Baseline 5):** **NEUE** Elemente mit `fixed` + `bottom-*` + `right-*` (ohne `inset-0` = kein Vollflächen-Backdrop). Persistentes Overlay → Safe-Area sicherstellen **und** in `OVERLAY_COMPONENTS` eintragen; flüchtig/harmlos (Toast, Drawer, Bubble) → `-- --update-baseline`.

Pure-Logik: `scripts/lib/fixed-overlay-scan.mjs` (unit-getestet, 17 Fälle). **Kommentare werden gestrippt** — ohne das blendet ein Erklär-Kommentar mit `lg:pb-20` im `<main>`-Tag das Gate (beim Selbsttest 11.08. passiert). Lokal (ohne Flag) `--warn` (exit 0).
<!-- END:redirect-stub-gate -->

# E2E-Toplevel-FS-Gate (Ratchet)

**Ein `readFileSync(...)` auf MODUL-EBENE einer Playwright-Spec ist verboten.** Fehlt die Datei, wirft es bereits **beim Import** → die gesamte Playwright-**Collection** crasht, und damit fallen **ALLE** anderen Journey-Smokes mit aus (auch die kerngesunden). Genau das hielt den `main`-e2e-Job vom **05.–11.08. dauerhaft rot**: `tests/e2e/flows/feststellung-flow-gate.spec.ts` las einen **local-only** Seed top-level (`scripts/smoke/.feststellung-flow-gate-seed.json`, Generator läuft bewusst nicht in CI) → auf main lief **kein einziger** Journey-Smoke mehr, echte Regressionen wären unbemerkt geblieben. Kein Build/tsc/anderer Ratchet fängt das.

Verschärfend: die e2e-Steps laufen **sequenziell**. Scheitert ein Journey-Smoke, werden die **nachfolgenden Seed-Steps übersprungen** → deren Seed-Dateien fehlen → der abschließende `playwright test`-Lauf crasht an der nächsten top-level lesenden Spec. Ein einzelner roter Journey kann so die ganze Collection mitreißen.

**Richtig** (Muster: `tests/e2e/flows/reparatur-funnel-abschluss-smoke.spec.ts`):
```ts
let seed: any = null
try { seed = JSON.parse(readFileSync(join(process.cwd(), 'scripts/smoke/.x-seed.json'), 'utf8')) } catch { /* nicht geseedet */ }

test('…', async ({ page }) => {
  test.skip(!seed, 'Seed-Fixture fehlt — local-only Prod-Smoke, läuft nicht im e2e-Job')
  …
})
```
Fehlt der Seed, **skippt** der Test sauber statt die Collection zu sprengen. Ist der Seed CI-erzeugt, ist der fehlgeschlagene Seed-Step ohnehin schon als CI-Fehler sichtbar — das Skippen verschluckt also nichts.

CI fährt `npm run check:e2e-toplevel-fs -- --ratchet`. Es blockt **NEUE** Verletzer-Specs gegen `scripts/e2e-toplevel-fs-baseline.json`. Lokal (ohne Flag) `--warn` (exit 0). Pure Logik: `scripts/lib/e2e-toplevel-fs-scan.mjs` (unit-getestet, 15 Fälle) — **Brace-Depth-Tracking** statt Einrückungs-Heuristik: auf Depth 0 = Modul-Scope, innerhalb `try { … }`/Funktion/`test()`-Body ≥ 1 → nicht geflaggt. Kommentare + String-Inhalte werden entrauscht (ein `{` im String verschiebt die Depth nicht).

**Baseline = 12 grandfathered** (Stand 11.08.), per **Boy-Scout** abzubauen: wer eine dieser Specs anfasst, kapselt ihren Seed-Read und senkt die Baseline mit `npm run check:e2e-toplevel-fs -- --update-baseline`. **Bekannte Grenze** (dokumentiert, nicht versteckt): ein über mehrere Zeilen verteilter Aufruf, bei dem `readFileSync` erst nach einer öffnenden Klammer auf einer Folgezeile steht, wird nicht erkannt — der Guard fängt die real aufgetretene Form, er ist eine Drift-Bremse, kein Beweis. Echter Sonderfall → `// e2e-toplevel-fs-skip: <grund>`.

Kontext: `BROADCAST-main-ci-e2e-red-feststellung-seed-crash` (Memory).

# Flag-Drift-Gate (Ratchet)

CHECK-invalide enum-Literale in Supabase-Writes/Filtern sind verboten — seit 22.07. **volle Abdeckung**: ALLE public ANY-ARRAY-enum-CHECKs (Status, Kanäle, Typen, Rollen, Kategorien, …), nicht mehr nur status-*benannte* (der alte conname-Filter deckte nur ~1/3 ab und verbarg den `nachrichten.kanal='system'`-Silent-Fail). Ein `.update({ status: 'geplant' })` auf `gutachter_termine` (wo `'geplant'` nicht im `gutachter_termine_status_check` steht) wird von Postgres **verworfen** → **stiller Fehlschlag**, den kein Build/tsc/anderer Ratchet fängt (belegt 05.07.: `geplant` in `slots.ts`, `kunde_storniert` in `kb-booking.ts` — beide Silent-Fail-Bugs). Ebenso Filter mit toten Werten (`.eq('status','durchgefuehrt')` matcht 0 Rows).

CI fährt `npm run check:flag-drift -- --ratchet`. Es blockt **NEUE** Verletzer-Files gegen `scripts/flag-drift-baseline.json`. Der Scanner (`scripts/lib/flag-drift-scan.mjs`, unit-getestet) fängt `col: 'literal'` in `.update/.insert/.upsert({...})` + `.eq/.neq/.in('col', …)`, löst die Tabelle über das `.from('<table>')` der Kette auf und prüft gegen den DB-CHECK-Snapshot `scripts/lib/status-check-constraints.json`. Bewusst hoch-präzise (nur String-Literale, nur bekannte CHECK-Spalten) → 0 False-Positives. Lokal (ohne Flag) `--warn` (exit 0).

**Constraint-Snapshot regenerieren** — seit 23.07. **selbst-wartend** (analog zum schema-snapshot): der Cron `.github/workflows/schema-snapshot-regen.yml` regeneriert `status-check-constraints.json` nächtlich aus prod (via RPC `audit_enum_check_constraints`, Migration `20260723003308`) und öffnet bei Drift einen PR. Manuell/lokal: `node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs`. Ein NEUER enum-Wert MUSS **zuerst** per MCP-Migration in den CHECK, DANN wird der Snapshot regeneriert — nie umgekehrt. (Das SQL im Header von `scripts/check-flag-drift.mjs` ist nur noch das manuelle Debug-Äquivalent.)

**Baseline = 0** (Stand 22.07.: die urspr. 6 grandfatherten Drift-Funde — `beleg-review`, `ad-hoc-anforderung`, `twilio/inbound` u.a. — sind alle abgebaut). Die 76→253-Spalten-**Vollabdeckung** (22.07.) lief mit **0 Verletzungen** durch: die Erweiterung fand genau EINEN echten Silent-Fail (`nachrichten.kanal='system'` in `tasks/reminder-sender.ts`, seit jeher 0/159 Zeilen — per Migration `20260722211730` gefixt: `'system'` in den CHECK ergänzt), sonst sauber. Teil des interaction-flags-Audits (`docs/superpowers/specs/2026-07-11-interaction-flags-db-driven-audit-design.md` §8, Detektor #5). Folge-Detektor **#1** (Direkt-status-Writes ausserhalb der Engine) ist jetzt gebaut — siehe **Operative-Status-Write-Gate** direkt unten; **#4** (inline-Branding-Gates) bleibt dokumentierte spätere Phase.

# Operative-Status-Write-Gate (Ratchet)

**Ein direkter Write auf `claims.operative_status` ausserhalb der State-Machine-Engine ist verboten.** Ein `.from('claims').update({ operative_status: … })` umgeht `transitionFallStatus` → **kein `fall.status_changed`-Event, keine Timeline, keine `phase_transitions`**. Genau diese Klasse (Detektor #1 des interaction-flags-Audits) erzeugte den **Werkstatt-Reparatur-Abschluss-Bypass** (17.07.): der Abschluss eines Selbstzahler/Kasko-Claims war für KB/Admin/Flottenmanager **unsichtbar**, auch rückwirkend in der Fallakte. Single-Writer-Funnel = die Engine (`transitionFallStatus` bzw. der `src/lib/faelle/reparatur-cursor.ts`-Helper).

CI fährt `npm run check:operative-status-writes -- --ratchet`. Es blockt **NEUE** Verletzer-Files gegen `scripts/operative-status-writes-baseline.json`. Der Scanner (`scripts/lib/operative-status-write-scan.mjs`, unit-getestet, 13 Fälle) ankert an `.from('claims').update(…)` und erkennt den Payload in drei Formen: inline-Objekt, `.update(IDENT)` mit `const IDENT = { operative_status: … }`, und `IDENT.operative_status = …` (Engine-Muster). Bewusst nur **`.update`** (nicht `.insert` — der initiale Cursor bei Anlage ist legitim) und nur **`claims`** → 0 False-Positives (Read-Mappings wie `{ operative_status: gelesenerWert }` ausserhalb eines claims-`.update` werden NICHT geflaggt). Lokal (ohne Flag) `--warn` (exit 0).

**Allowlist** (sanktionierte, absichtliche Direkt-Writer — in `check-operative-status-writes.mjs`): `state-machine.ts` (DIE Engine), `claims/endzustand-actions.ts` (dokumentierte Cursor-Ausnahme: die 2 nicht-terminalen Endzustand-Outcomes sind Cursor-Werte, die die Engine liest — `state-machine.ts:52-66`) + `lexdrive/process-event.ts` (der `manual_status_override`-Pfad ist BEWUSST validierungs-frei — Admin forciert per VS-Webhook einen Status; funneln würde den Override-Zweck brechen). Neue legitime Cursor-Ausnahme → Allowlist mit Begründung, **nicht** die Baseline aufblähen.

**Baseline = 2 grandfathered** (bekannte Direkt-Writer, per Boy-Scout auf den Funnel heben): `kanzlei-wunsch/actions.ts` (an_externe_kanzlei_uebergeben / in_kommunikation_vs — Nicht-Matrix-Terminals) + `termine/close-nur-gutachter-termin.ts`. Abgebaut von urspruenglich 4: `gutachter/team/actions.ts` (sv-zugewiesen) ist auf den Funnel gehoben (#4579), `lexdrive/process-event.ts` in die Allowlist (Manual-Override, s.o.). Der Reparatur-Abschluss (`reparatur-abschluss-actions.ts`) war der 5. — er ging schon mit `kitta/reparatur-cursor-funnel` aus der Baseline. Marker: `coordination-an-status-achsen-lane-werkstatt-abschluss-bypass`.

# Intake-Funnel-Gate (Ratchet)

**Ein direkter `createLead(...)`-Aufruf ausserhalb des Intake-Moduls ist verboten.** Jeder Lead-Eintrittspunkt geht über **`createCase`** (`src/lib/intake/create-case.ts`) — nur der garantiert neben dem Lead auch den **FlowLink** (C2 §7#1, DECISIONS 2026-08-04). Ein roher `createLead`-Aufruf erzeugt einen Interessenten **ohne jeden Kunde-Kanal**: bleibt die Rückmeldung aus, hat er keinen Weg zurück in seinen Vorgang — und niemand merkt es, weil der Lead ja existiert.

Genau diese Klasse hatten der Aircall-Webhook (C2b D-4b), der matelso-Webhook (#5292) und der öffentliche Rückruf (#5308). Beim Rückruf gemessen: **2 von 2 Rückruf-Leads ohne FlowLink** — 100 % der Klasse, still.

**Fix:** `createCase(client, { mode: 'lead-first' | 'direct-claim', base, extra })`. `base`/`extra` bleiben **unverändert** — `createCase` ruft intern dasselbe `createLead` (Writer-Konsistenz + leads-Audit bleiben) und ergänzt nur den FlowLink (non-fatal, kein neues Fehlerrisiko). `mode='lead-first'` wenn die Meldung noch kein Fall ist (Konversion später über `/flow`); `direct-claim` zieht zusätzlich `convertLeadToFall` (dann ist `triggerByUserId` Pflicht).

⚠ **Falle beim Unit-Test der Call-Site:** `create-case.ts` importiert `'server-only'`, das in der vitest-Node-Umgebung **schon beim Import** wirft. Wer eine Call-Site migriert, macht damit deren Test rot (und der vitest-Ratchet blockt neue rote Files). **`createCase` mocken** — nicht die inneren Teile; ein Mock nur auf `ensureCanonicalFlowLinkForLead` reicht **nicht**. Vorbild: `src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`. Assertions ziehen dann `createCaseMock.mock.calls[0][1].extra` statt Argument 3 von `createLead`.

CI fährt `npm run check:intake-funnel -- --ratchet`. Es blockt **NEUE** Verletzer-Files gegen `scripts/intake-funnel-baseline.json`. Lokal (ohne Flag) `--warn` (exit 0). Pure Logik: `scripts/lib/intake-funnel-scan.mjs` (unit-getestet, 16 Fälle). **Kommentare werden gestrippt** — ohne das flaggt jede Erklärung („läuft über createCase statt createLead") ihr eigenes File; Imports/Re-Exports/`typeof`-Referenzen zählen nicht.

**Allowlist** (per Design direkte Aufrufer, nie geflaggt): `src/lib/intake/create-case.ts` (DER Funnel), `src/lib/leads/create-lead.ts` (die Definition), `src/lib/start-link/issue-canonical-flowlink.ts` (erzeugt selbst kanonische FlowLinks — über `createCase` zu gehen wäre zirkulär), `src/app/schaden/[token]/actions.ts` (**NFC-Schadenkarte = Gegner-Flow**: der Verursacher tappt die Karte, die Daten landen in `gegner_*` mit `schuldfrage='gegner'`; Geschädigter ist die Flotten-Firma. Ein FlowLink gäbe dem **Gegner** einen Kanal in den Vorgang des Geschädigten — fachlich falsch).

**Baseline = 6 grandfathered** (Stand 16.08.): `admin/faelle/anlegen`, `dispatch/leads`, `dispatch/kalender/spontan`, `makler/erstelle-anfrage`, `flotte/schaden-fortsetzung`, `gutachter/auftraege/vermittle-partner-werkstatt`. Nach einer Migration `npm run check:intake-funnel -- --update-baseline`. Echter Sonderfall → **Allowlist mit Begründung**, nicht die Baseline aufblähen.

⚠ **Die Baseline ist eine Prüfliste, keine Schuldenliste.** Vor jeder Migration klären, **wer** der Lead ist — Kunde, Gegner oder interner Stub. Gemessen 16.08.: `flotte/schaden-fortsetzung` hat bereits FlowLinks (4 Leads, 0 ohne → Migration wäre redundant), `admin/faelle/anlegen` hat **0 Leads auf prod** (kein gemessener Nutzen; ruft zudem `convertLeadToClaim`, nicht `convertLeadToFall` → dort wäre nur `mode:'lead-first'` sicher, nie `direct-claim`). Priorisieren lässt sich das mit einer Zählung je `source_channel` gegen `flow_links` — aber die Zahl priorisiert nur, sie entscheidet nicht.

# i18n-Coverage-Gate (Ratchet)

**Ein dynamisch adressierter i18n-Key muss in den Messages existieren.** Baut der Code den Key zur LAUFZEIT aus einer TS-Union — z.B. `subphase-visibility.ts`: `` `${extern ? 'subKunde' : 'subIntern'}.${lifecycle.subPhase}` `` — und fehlt ein Union-Wert in den Messages, wirft next-intl `MISSING_MESSAGE` und die UI rendert den **rohen Key**: das deutsche Produkt zeigt dann wörtlich `phasen.subIntern.reparatur_terminfindung`.

**Die Lücke, die dieses Gate schliesst:** `check:i18n` prüft nur die **Parität ZWISCHEN** den Locales — fehlt ein Key in **allen 6**, ist die Parität erfüllt und der Check grün. `check:i18n-render` kompiliert nur **definierte** Messages und kennt keine Code-Referenzen. Belegt 19.07. auf prod (Playwright-Console auf der Fallakte): `MISSING_MESSAGE: phasen.subIntern.reparatur_terminfindung (de)` — derselbe Scan fand zusätzlich `filmcheck`, `qc-pruefung`, `anschlussschreiben`, `nachbesichtigung-laeuft`, also **häufige** Zustände (jeder Claim im QC), die live rohe Keys zeigten.

CI fährt `npm run check:i18n-coverage -- --ratchet`. Je Eintrag der `COVERAGE`-Liste (in `scripts/check-i18n-coverage.mjs`) werden die Werte einer TS-Union gegen die Keys unter einem Messages-Pfad der **Quell-Locale `de.json`** verglichen (die übrigen 5 deckt die `check:i18n`-Parität ab). Abgedeckt: `phasen.main` (`ClaimMainPhase`) + `phasen.subIntern`/`phasen.subKunde` (`ClaimSubPhase`). **Baseline 0** — keine grandfatherte Schuld, jede neue Lücke blockt. Pure Logik: `scripts/lib/i18n-coverage-scan.mjs` (unit-getestet, 10 Fälle, CRLF- + kommentar-sicher).

**Neue dynamische Namespace-Familie?** → `COVERAGE`-Eintrag ergänzen. Die Wertemenge kommt entweder aus einer TS-Union (`type: 'ClaimSubPhase'`) ODER aus einem `const NAME = [...] as const`-Array (`constName: 'QUALI_VALUES'`) — genau eins pro Eintrag. Adressiert der Key ein verschachteltes Objekt statt eines Labels direkt (z.B. `quali.optionen.<wert>.{label,hint}` in `QualiOptionen.tsx`), zusätzlich `subKeys: ['label', 'hint']` setzen — dann wird pro Wert jedes Feld einzeln geprüft. Ein umbenannter Typ/Const oder fehlender Namespace ist ein **harter** Fehler (sonst würde das Gate still blind).

**Bewusst NICHT abgedeckt:** statisch literale `t('foo.bar')`-Referenzen — dafür bräuchte es Namespace-Scope-Tracking über `useTranslations`-Variablen (FP-anfällig, und ein FP blockt die ganze Fleet). Mögliche spätere Erweiterung; die dynamische Klasse ist die, die real geblutet hat.

# Termin-Bezug-Gate (Ratchet)

**Naive Legacy-Bezug-Filter auf `gutachter_termine` sind verboten** — `.eq/.neq/.in('fall_id'|'claim_id'|'lead_id')` **übersehen bezug-native Termine**. `gutachter_termine` trägt den Termin-Auftrag („WOFÜR") auf zwei Achsen: Legacy (`fall_id`/`lead_id`/`claim_id`) + kanonisch (`bezug_typ`+`bezug_id`). Die Termin-Engine schreibt NEUE Termine **bezug-nativ** (nur `bezug_typ`+`bezug_id`, Legacy-Spalte NULL — ein Validate-Trigger lehnt doppelten Legacy-Bezug ab). Ein `.eq('fall_id', X)` findet solche Termine nie → verwaiste Auftrags-/Reminder-/Kalender-Logik (dieselbe Bug-Klasse wie der lead_id-Reader #2580).

**Fix:** `.or(bezugOrExpr(achse, id))` aus `@/lib/termine/bezug-filter` — der PostgREST-`or`-Ausdruck matcht beide Achsen (Superset: findet nie weniger, dank `bezug_id.eq` nie einen fremden Termin). Weitere Top-level-Filter (`.eq('status', …)`) bleiben daneben (AND-verknüpft). Gegenstück zu `effektiveBezugIds()` (das die Achsen beim **READ** auflöst; `bezugOrExpr` ist für **FILTER**).

CI fährt `npm run check:termin-bezug -- --ratchet`. Es blockt **NEUE** Verletzer-Files gegen `scripts/termin-bezug-baseline.json` (Baseline **51** grandfathered, per Boy-Scout auf 0 abgebaut mit `-- --update-baseline` → dann sind die Legacy-Spalten droppbar = der eigentliche Retire-Abschluss). Lokal (ohne Flag) `--warn` (exit 0). Pure-Logik: `scripts/lib/termin-bezug-scan.mjs` (unit-getestet, 14 Fälle); block-aware über das `.from('gutachter_termine')`-Segment → 0 False-Positives. **WRITES** (`.insert/.update({ fall_id: … })`) sind erlaubt (Legacy-Spalte schreiben ist legitim, solange sie existiert) — nur FILTER übersehen Zeilen. Bewusst Legacy-only? → `// termin-bezug-skip: <grund>`-Header.

**Abgrenzung zu `check:termin-engine-contract`:** Der Contract-Ratchet gatet `.eq('lead_id')`/`.eq('sv_id')` = **Engine-API-Disziplin** (nutze `findeTerminFuerLead`/`assignee_id`), hard-0. Dieses Gate gatet die **Bezug-Filter-Korrektheit** (`fall_id`/`claim_id` voll + `lead_id` jenseits `.eq`). Komplementär, keine funktionale Überlappung (die einzigen `.eq('lead_id')` liegen im ausgenommenen `finde-termin-fuer-lead.ts`). Ausnahmen identisch: `engine/*` + `finde-termin-fuer-lead.ts` dürfen die Achsen direkt anfassen. Marker: `coordination-p33-gutachter-termine-legacy-retire`.

# Stille-Write-Gate (Ratchet)

**Ein Supabase-Write auf eine schadensträchtige Tabelle, dessen Ergebnis niemand liest, ist verboten.** `supabase-js` **wirft nicht** — ein fehlgeschlagener Write gibt `{ error }` zurück. Wer den Rückgabewert verwirft, kann Erfolg und Fehlschlag nicht unterscheiden:

```ts
await db.from('claims').update({ … }).eq('id', id)          // ❌ Fehler unsichtbar
const { error } = await db.from('claims').update({ … })     // ✅
if (error) { … }
```

**Läuft der Write über den RLS-Client** (`createClient()`, nicht `createAdminClient()`), zusätzlich `.select()` anhängen und die **Row-Zahl** prüfen: Ein RLS-gefiltertes UPDATE trifft 0 Rows **ohne Fehler** — `error === null` bedeutet dort nicht „hat gewirkt".

**Drei belegte Vorfälle:**
* **DSGVO-Storno (19.07.):** 0-Row-UPDATE unter RLS → die Action meldete Erfolg, die Karte verschwand, der Löschauftrag lief weiter Richtung Anonymisierung.
* **J2-Seed (16.08.):** FK-Verletzung beim Lead-DELETE. Der Seed meldete **13 Tage lang** Erfolg und löschte nichts; 88 Leads liefen auf und verzerrten Messungen.
* **Skizzen-Korrektur (16.08.):** Task-Insert in einem `try/catch` (fängt nichts, da kein `throw`) + Update ohne Prüfung — im selben File, am selben Tag wie der J2-Fix. ⚠ **Ein `try/catch` um einen Supabase-Call ist reine Dekoration.**

CI fährt `npm run check:silent-writes -- --ratchet`. **Die Baseline ist 0** — der Bestand von ursprünglich **214 Stellen in 106 Files** wurde in neun Boy-Scout-Blöcken vollständig abgebaut (#5320 → #5372, 18.08.). Das ist damit keine Drift-Bremse mehr, sondern eine **harte Regel: jeder neue ungeprüfte Write auf eine kritische Tabelle blockt sofort.** Lokal (ohne Flag) `--warn` (exit 0).

⚠ **Die Baseline nicht wieder aufblähen.** `--update-baseline` war für den Abbau da, nicht zum Eintragen neuer Verstöße. Echter fire-and-forget-Fall → `// silent-write-skip: <grund>` (s.u.); alles andere bekommt die Fehlerprüfung.

**Nur `KRITISCHE_TABELLEN`** (`claims`, `leads`, `tasks`, `faelle`, `fall_dokumente`, `pflichtdokumente`, `gutachter_termine`) — bewusst nicht alle ~684 Write-Stellen des Repos: Dort ist ein stiller Fehlschlag ein Datenverlust, der erst Wochen später auffällt. Die Liste darf wachsen, jede Erweiterung hebt aber die Baseline.

**0 False-Positives by design:** Gescannt wird **nur die Statement-Form** — eine Zeile, die (nach Whitespace) mit `await` beginnt. `const { error } = await …`, `return await …`, Reads und Ketten mit mehreren `.from()` (Zuordnung uneindeutig) werden per Konstruktion nie geflaggt. Pure Logik: `scripts/lib/silent-write-scan.mjs` (unit-getestet, 13 Fälle, davon 7 Negativ-Fälle). Bewusst fire-and-forget → `// silent-write-skip: <grund>` am File-Anfang.

# Zugriffs-Doktrin (Server-first) — Dach über die Zugriffs-Gates

**Kanonische Referenz: `docs/fundament/zugriffs-doktrin.md`** (Fundament C5, #4860). Kern in einem Satz: **Client liest über Views/RPCs je Rolle, schreibt über Server-Actions mit Guard + `.select()`-Row-Check; RLS ist Sicherheitsnetz, nicht Feinsteuerung** (Verfassung §7). Ist-Stand: Client-Direkt-Selects auf Basistabellen = **0** (verifiziert) — server-first ist gelebt.

Die vier folgenden Ratchets (**RLS-Policy-**, **Anon-Grant-**, **Reachability-**, **Write-Reachability-Gate**) sind die maschinelle Durchsetzung dieser Doktrin. **Bei jeder NEUEN Tabelle/View/RPC** die 6-Punkt-Checkliste aus `zugriffs-doktrin.md` §3 durchgehen — sie liegt auch als Block im PR-Template (`.github/pull_request_template.md`). Offene Optimierungs-Tranche (kein Sicherheits-Thema): server-seitige `from('claims')`-Reads auf die `v_claim_*`-Schicht konsolidieren (Doktrin §5).

<!-- BEGIN:branding-rules -->
# RLS-Policy-Gate (Ratchet)

**Eine PERMISSIVE `CREATE POLICY` braucht eine explizite `TO <rolle>`-Klausel — nie `TO public`, nie weglassen.**

Lässt man `TO` weg, ist der **Postgres-Default `TO public`** — die Policy gilt dann auch für `authenticator` / `cli_login_postgres` / `dashboard_user` / `supabase_privileged_role`. Diese 4 Rollen haben **null App-Traffic und null Grants** auf den betroffenen Tabellen, aber der Supabase-Advisor zählt `multiple_permissive_policies` je **(Tabelle × ROLLE × Action)** — jeder Overlap wird dadurch **4× doppelt gezählt**. Genau das war das **49-%-Rauschen** (313 Findings), das B2a (Migration `20260714171501`) rausgeräumt hat: `TO public → TO anon, authenticated` auf 138 Policies, Policy-Fingerprint byte-identisch (reiner No-op).

Ohne Gate kommt es zurück — man fängt sich `TO public` schlicht ein, wenn man die Klausel **vergisst**. Binnen Stunden nach B2a war es 4× passiert (`cold_mail_*`).

CI fährt `npm run check:rls-policies -- --ratchet`. Es blockt **NEUE** Verletzer-Files gegen `scripts/rls-policy-baseline.json`. Lokal (ohne Flag) `--warn` (exit 0). Pure-Logik: `scripts/lib/rls-policy-scan.mjs` (unit-getestet, 13 Fälle).

**Richtig:**
```sql
CREATE POLICY x ON public.t FOR SELECT TO anon, authenticated USING (…);
```

**Zwei Ausnahmen (werden NIE geflaggt — die einzigen False-Positive-Quellen):**

1. **`AS RESTRICTIVE`** — dort ist `TO public` **korrekt**: die Restriktion gilt dann für alle Rollen = maximale Abdeckung. Ein Verengen auf `TO authenticated` würde die Restriktion für `anon` **aufheben**, also **lockern**. (Real: `nachrichten_thread_insert_member_only` ist die einzige RESTRICTIVE-Policy im Schema.)
2. **Dynamisches SQL** mit `%I`/`%s`-Platzhaltern (`EXECUTE format('CREATE POLICY %I … TO %s …')`) — die Rollen kommen zur Laufzeit, die Klausel **ist** explizit. (Real: die B1-Konsolidierungs-Migrationen erzeugen so 320 Policies.) Ein dynamisches `EXECUTE 'CREATE POLICY x ON t USING (true)'` **ohne** Platzhalter wird weiterhin geflaggt.

**Kein DB-/Netz-Zugriff** — reiner Scan von `supabase/migrations/*.sql` (CI hat keine DB-Creds; deshalb läuft `check:rls-grants` auch nicht in CI).

**Baseline = eingefrorene Historie, KEIN Schuldenabbau.** Anders als bei component-set/knip dürfen die Baseline-Files **nicht** nachträglich editiert werden — applizierte Migrationen sind unveränderlich (Regel 2). Der DB-Zustand dieser alten Policies wurde bereits von B2a korrigiert. Die Baseline sagt nur: „diese historischen Files sind bekannt". `--update-baseline` ist der begründete Ausnahmefall, nicht der Normalpfad.

Kontext: `COORDINATION-rls-perf-b1-fullpass` (Memory) — der Pass brachte den Advisor von **313 → 0**.

# Anon-Grant-Gate (Ratchet)

**`anon` darf keinen SELECT-Grant auf Spalten mit sensiblem Namensmuster haben** — `iban`/`steuernummer`/`geburtsdatum`/`fuehrerschein`/`kontonummer`/`access|refresh|session_token`/`secret`/`password_encrypted`/`passwort`/`_encrypted`/`provision`/`honorar`/`notiz` — ausser der dokumentierten Allowlist.

RLS schuetzt nur **ZEILEN**. Ein table-weiter `anon`-SELECT-Grant ist latent, solange keine anon-Policy Zeilen durchlaesst — aber ein spaeterer anon-Policy-Zweig (oder `DISABLE ROW LEVEL SECURITY`) legt die Spalte sofort offen. Genau diese Klasse fanden claims (#4352), auftraege (#4379), die anon-7 (#4383) und leads (#4389) — jeweils **nach Go-Live scharf**. Dieser Ratchet haelt die ganze Klasse dauerhaft zu und verallgemeinert das claims-spezifische `check:claims-column-grants` auf alle anon-Grants. Er **ergaenzt** den Anon-Exposure-Guard (`check-anon-exposure.mjs`), der die andere Achse faengt: anon-lesbare **Views** (Row-Exposure), nicht Spalten-Grants auf Basistabellen.

CI faehrt `npm run check:anon-sensitive-grants -- --ratchet`. Es blockt **NEUE** anon-lesbare sensible Spalten gegen `scripts/anon-sensitive-grants-baseline.json`. Lokal (ohne Flag) `--warn` (exit 0); `--update-baseline` senkt nach Boy-Scout-Fixes. Backing-RPC `audit_anon_sensitive_grants()` (service_role-only, read-only, `pg_catalog` + `has_column_privilege`, Mig `20260715144704`). Pure Diff-/Allowlist-Logik: `scripts/lib/anon-grant-scan.mjs` (unit-getestet). Nur bei SQL-Diff aktiv (Prod-Pool-Schonung, Muster wie `check:claims-column-grants`).

**Fix bei rotem Ratchet:** in der Migration den table-weiten `anon`-Grant entziehen + nur benigne Spalten neu granten (`revoke select on <t> from anon; grant select (<benigne>) on <t> to anon;` — Muster Mig `20260715120651`). ⚠ **Falle:** ein blosses `REVOKE SELECT (<col>)` greift NICHT, solange ein TABLE-Grant existiert (`has_column_privilege` bleibt true) — der Table-Grant muss weg. Echter Nicht-Geheimnis-Fall (Timestamp/Zaehler) → `SEMANTIC_ALLOWLIST` in `scripts/lib/anon-grant-scan.mjs` mit Begruendung, **nicht** die Baseline aufblaehen.

**Baseline = 0** (Stand 16.07.: alle 24 Gaps des Grant-Audits gekappt — R1+R2 #4410, R3a–d #4423/#4426/#4429/#4432). Jeder NEUE anon-Grant auf eine sensible Spalte wird geblockt. Echter Nicht-Geheimnis-Fall (Timestamp/Zaehler) → `SEMANTIC_ALLOWLIST`, **nicht** Baseline aufblaehen.

# Reachability-Gate (Ratchet)

**Eine `anon`-SELECT-Policy darf keinen OR-Zweig haben, der OHNE `auth.uid()` (true-anon, uid NULL) Zeilen durchlaesst — auf einer Tabelle mit Kontakt-PII.**

Der Anon-Grant-Gate (oben) faengt die **Spalten-NAMEN**-Achse (anon-Grant auf `iban`/`token`/…). Diese Achse ist orthogonal: die **Policy-REACHABILITY**. RLS gibt Zeilen frei ueber die Policy-`qual`. Ein OR-Zweig, der `auth.uid()` nicht braucht (z.B. `(source IS NULL) AND (erstellt_am > now() - '5 min')`), laesst **jeden** anon-Client (public anon-Key, PostgREST) echte Zeilen lesen — auf einer PII-Tabelle ein **AKTIVES** Leck (kein latenter Grant). Genau das war `gutachter_finder_anfragen` (Name/Email/Telefon/Kennzeichen jeder nativen Finder-Anfrage der letzten 5 Min, **nach Go-Live scharf**, Mig `20260716200848`). Der Grant-Ratchet fing es **nicht** — `telefon`/`email`/`vorname` stehen nicht im sensiblen Namensmuster.

CI faehrt `npm run check:anon-reachability -- --ratchet`. Es blockt **NEUE** anon-reachable PII-Policies gegen `scripts/anon-reachability-baseline.json`. Lokal (ohne Flag) `--warn`; `--update-baseline` senkt nach Boy-Scout. Backing-RPC `audit_anon_reachable_pii()` (service_role-only, read-only, `pg_catalog` + `information_schema`, Mig `20260716202037`) liefert die Rohdaten (anon-SELECT-Policies auf anon-lesbaren Tabellen mit ≥1 Kontakt-PII-Spalte + `qual`). Die **Heuristik** lebt unit-getestet in `scripts/lib/anon-reachability-scan.mjs`: top-level-OR-Split (nach `stripOuterParens` — `pg_get_expr` wickelt in `(… OR …)`, sonst Leck-Miss) + `UID_GATE_TOKENS` (`auth.uid`/`auth.role`/`is_staff`/`is_admin`/`is_sv_for_claim`/… — SECURITY-DEFINER-Helper, die intern `auth.uid()` nutzen, zaehlen als Gate). Bewusst **konservativ** (over-flagging): ein neuer, unbekannter Helper → geflaggt, bis er in `UID_GATE_TOKENS` steht. Nur bei SQL-Diff aktiv.

**Fix bei rotem Ratchet:** den offenen Zweig an `auth.uid()`/einen `is_*()`-Helper binden ODER — wenn kein anon-Consumer existiert (Consumer-Grep: alle Zugriffe `createAdminClient`/service_role?) — den anon-SELECT-Grant der Tabelle entziehen **und** die leaky Policy droppen (Defense-in-Depth, Muster Mig `20260716200848`). Neuer legitimer uid-Helper fehlt in der Token-Liste → `UID_GATE_TOKENS` ergaenzen (mit Begruendung), nicht die Baseline aufblaehen.

**Baseline = 0** (nach dem gfa-Fix ist keine anon-Policy mehr reachable-ohne-uid auf einer PII-Tabelle; die 5 verbleibenden PII-Tabellen mit anon-Grant — aircall_calls/cold_mail_*/twilio_status_events/vehicles — sind alle `auth.uid()`/`is_staff()`-gated). Vollstaendige Enumeration + Fund: `COORDINATION-anon-pii-leak-gutachter-finder-anfragen` (Memory).

# Write-Reachability-Gate (Ratchet)

**Eine PERMISSIVE `authenticated`-WRITE-Policy (INSERT/UPDATE/DELETE) darf keinen top-level-OR-Zweig haben, der OHNE `auth.uid()`/Scoping-Helper erfuellbar ist — sonst kann JEDER eingeloggte User fremde/beliebige Zeilen schreiben (cross-user/cross-tenant Write).**

Das WRITE-Gegenstueck zum `check:anon-reachability` (SELECT/true-anon-Achse). Zwei orthogonale Write-Achsen: die WURZEL (#4555) macht authenticated-Write per **Default-Privileg** default-closed (GRANT-Achse — neue Tabellen granten authenticated kein Write). Diese Achse ist die **POLICY-Reachability**: eine EXPLIZIT gegrantete Tabelle mit einer ungescopten Write-Policy laesst jeden authenticated-User schreiben. Read-seitig ist die Klasse durch `kanzlei_faelle` belegt (jeder `kanzlei`-User liest alle Faelle — [[audit-kanzlei-cross-tenant-scoping-2026-07-19]]); write-seitig aktuell **0 echte Lecks** (alle 245 authenticated-Write-Policies sind uid-/rollen-/firma-gescopt oder bewusst broad).

CI faehrt `npm run check:auth-write-reachability -- --ratchet`. Es blockt **NEUE** reachable authenticated-Write-Policies gegen `scripts/authenticated-write-reachability-baseline.json`. Lokal (ohne Flag) `--warn`; `--update-baseline` senkt nach Boy-Scout. Backing-RPC `audit_authenticated_write_reachable()` (service_role-only, read-only, Mig `20260719132920`) liefert alle PERMISSIVE authenticated-Write-Policies + den reachability-relevanten Ausdruck (INSERT→with_check der die neue Zeile gatet; UPDATE/DELETE→qual der gatet WELCHE Zeilen). Pure Heuristik: `scripts/lib/authenticated-write-scan.mjs` (unit-getestet), reuse `topLevelOrBranches` + `UID_GATE_TOKENS` aus `anon-reachability-scan.mjs`. Nur bei SQL-Diff aktiv (Prod-Pool-Schonung).

**⚠ Wichtiger Unterschied zum anon-Scanner:** KEIN anon-Anti-Pattern `auth.uid() IS NULL`. Das ist ein ANON-Konzept (Zweig oeffnet fuer true-anon) und wuerde beim authenticated-Fall greedy fehlmatchen, sobald ein Zweig `auth.uid()` … `<spalte> IS NULL` enthaelt (`kundenbetreuer_id IS NULL`, `fall_id IS NULL`) → massenhaft FP auf real gescopten claims/tasks-Policies. Fuer authenticated zaehlt nur: enthaelt der Zweig einen Gate-Token? `WRITE_GATE_TOKENS` = anon-`UID_GATE_TOKENS` + `is_kundenbetreuer`/`is_sv`/`auth_flottenmanager_firma_id`/`auth_user_firma_id`.

**Baseline = 2** (bewusste oeffentliche Broad-Writes, KEIN Leck): `gutachter_finder_anfragen__b1ins` (`source IS NULL` = nativer anonymer Finder-Submit) + `__b1upd_au` (`source IS NULL AND status='entwurf'` = anonymer Entwurf-Edit). Beide sind public-Submit-Flows ohne eingeloggten Owner.

**Fix bei rotem Ratchet:** den offenen Zweig an `auth.uid()`/einen Scoping-Helper binden (Muster: `makler.user_id = auth.uid()` bzw. `firma_id = auth_user_firma_id()`) ODER den authenticated-Write-Grant der Tabelle entziehen. Bewusster oeffentlicher Broad-Write → Baseline via `--update-baseline`. Neuer legitimer Scoping-Helper fehlt → `WRITE_GATE_TOKENS` in `scripts/lib/authenticated-write-scan.mjs` ergaenzen (mit Begruendung), nicht die Baseline aufblaehen.

# Whitelabel-Branding — `var(--brand-*)` statt hardcoded `claimondo-*`

Die App ist whitelabel-fähig: ein verifizierter SV mit `use_custom_branding=true` brandet sein eigenes Portal **und** die Sicht seiner Kunden (Kunde-Portal, Magic-Links `/flow/[token]`, `/upload/zb1/[token]`, `/upload/dokumente/[token]`, Kunden-gerichtete Emails). Das funktioniert über CSS-Custom-Properties, die auf einem Wrapper-Element gesetzt werden (`generateCssVars(theme, 'full')` aus `src/lib/branding/css-vars.ts`).

**Regeln für neue Komponenten:**

* **Tailwind-Klassen `bg-claimondo-*` / `text-claimondo-*` / `border-claimondo-*` greifen automatisch auf das Brand-Theme** — `globals.css` biegt `--color-claimondo-navy` etc. auf `var(--brand-primary, …)` um. Du musst also **nichts** ändern, wenn du diese Klassen nutzt. Tu das auch weiterhin — es ist der Default-Weg.
* **Inline-Hex-Strings (`#0D1B3E`, `#4573A2`) sind verboten** für Marken-Farben. Wenn du wirklich inline brauchst (3rd-Party-Component-Props, react-email): `var(--brand-primary, #0D1B3E)` mit Claimondo-Fallback.
* **Brand-Resolver:**
  * SV-Portal → `resolveBrandTheme(supabase, userId)` (Org-Vorrang für Sub-SVs)
  * Kunde-Portal → `resolveKundenTheme(userId)` (Gate: `verifiziert && use_custom_branding`)
  * Magic-Link-Routen → `resolveBrandingFromUploadToken` / `…Zb1Token` / `…FlowToken` aus `src/lib/branding/token-theme.ts`
  * Emails → `resolveEmailBranding({ svId | fallId | leadId })` aus `token-theme.ts` → liefert `null` wenn kein Brand → Caller rendert Claimondo
* **Semantische Farben haben jetzt Tokens (Token-Foundation 2026-06-10):** Status nutzt `bg-success` / `bg-success-soft` / `text-success-strong` (analog `warning`/`danger`/`info`), gebunden an `src/lib/design-tokens.ts` und via Brand-Resolver `var(--brand-success, …)` an `theme.ts:generateStatus()` harmonisiert (gewollt). **Neuer Code nutzt diese Tokens, nicht roh `bg-green-50`/`text-emerald-600`** — ein Status-Ratchet (s.u.) blockt neue raw Status-Scales. Ein „echtes" Material-Grün **ohne** Status-Bedeutung (Trust-Marker, Kanal-Identität wie WhatsApp-Grün im MultiChannelChat, Data-Viz/Charts) bleibt erlaubt, braucht aber den `// Token-Audit-Skip`-Header.
* **Nie** Layout-kritische Properties (`position`, `inset`) per Tailwind-Utility-Klasse auf einem Element, dem eine 3rd-Party-Lib (mapbox-gl etc.) eine eigene Klasse mit `position`-Regel verpasst — inline-`style` nutzen (siehe `GutachterFinderMapClient`-Incident 12.05.).

**Was NICHT gebrandet wird:** Marketing-Pages (`/`, `/faq`, `/gutachter-finden` — kein User-Context), Admin-/Dispatch-/Kanzlei-Portale (interne Tools), Auth-Mails (`TwoFactorCode`), PDF-Generation, Native-App. Siehe `docs/12.05.2026/branding-rollout-spec.md`.

## Token-Audit-Drift-Bremse (PR #1025)

CI fährt automatisch `npm run check:token-audit`. Das Script blockt:

* **bracket-hex in className** (z.B. `bg-[#0D1B3E]`) — ersetzen mit `bg-claimondo-navy`
* **raw inline-hex** in `style={{ color: '#0D1B3E' }}` ohne `var(--brand-*)` Fallback — ersetzen mit `style={{ color: 'var(--brand-primary, #0D1B3E)' }}`

**Whitelist** (dokumentierte Ausnahmen in `src/lib/external-brand-colors.ts`):
WhatsApp `#25D366`, LinkedIn `#0A66C2`, LexDrive `#0e5be9`, 4 SV-Typ-Map-Marker-Farben (AAR-198), Landing-Cream `#F5F1E8`, Navigation-Gold `#C9A84C`.

**Skip-Header**: Files die zwingend raw inline-hex brauchen (Email-Templates, PDF-Generation, Error-Boundaries vor Tailwind, Mapbox-GL-Markers, SVG-Replikate physischer Objekte) bekommen am Anfang:
```
// Token-Audit-Skip: <konkreter Grund>
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
```
Das Script erkennt den Header und skippt die Datei komplett.

**Wenn der Audit fehlschlägt:** Fix per Fall:
1. Hex zu Claimondo-Token mappen (`bg-[#0D1B3E]` → `bg-claimondo-navy`)
2. Oder zu `var(--brand-*, #fallback)` Pattern umschreiben (für inline-style)
3. Oder Header setzen + in dieser Liste dokumentieren (für legit Sonderfälle)
4. Oder neue Brand-Farbe in `external-brand-colors.ts` + Whitelist im Script aufnehmen

## Drift-Ratchets im selben Script (Baseline + Boy-Scout, wie component-set/knip)

`check:token-audit` fährt zusätzlich vier Ratchets — sie blocken **neue** Verstöße gegen eine Baseline, Bestand wird per Boy-Scout abgebaut. **Alle vier scannen nur `src/**` (die App) — Marketing (`claimondo-marketing/`) und Cluster-LPs (`kfz-gutachter-*/`, `autounfall-io/`) sind eigene Top-Level-Builds und werden NIE erfasst.**

* **Status-Ratchet** (Token-Foundation 2026-06-10): blockt **neue** raw Tailwind-Status-Scales (`green/emerald/red/rose/amber/yellow/orange/lime`-`50…950`). Status hat jetzt Tokens — `bg-success`/`-soft`/`text-success-strong` (+ `warning`/`danger`/`info`). Baseline = Bestand (grandfathered), Boy-Scout senkt. Echter Nicht-Status-Fall (Wetter/Kanal-Farbe/Trust-Marker/Data-Viz) → `// Token-Audit-Skip`-Header. Löst die frühere „Status bleibt raw erlaubt"-Ausnahme ab.
* **Accent-Ratchet**: raw Tailwind-Akzente (`blue/indigo/sky/cyan/violet/purple/teal/fuchsia/pink`) verboten (Baseline 0) → `claimondo-*`-Tokens.
* **Radii-Ratchet**: Tailwind-Default-Radien (`rounded-sm/md/lg/xl/2xl/3xl`) → `rounded-ios-*`.
* **Brand-rgba-Gradient-Ratchet** (FlowLink-Audit 2026-06-10): blockt **neue** raw `rgba()` mit Marken-Tönen (`13,27,62` / `69,115,162` / `123,163,204`) **innerhalb einer CSS-`*-gradient()`-Funktion** — die branden nicht mit. Nutze stattdessen `color-mix(in srgb, var(--brand-accent/-secondary/-primary, #fb) N%, transparent)` (das etablierte Tinting-Pattern, ~40 Consumer). Schließt die Lücke des Hex-Audits (der nur Hex prüft, nicht rgba). **Bewusst nur Gradient-Kontext** = ~0 False-Positives: Schatten (`boxShadow`), Avatar-/Badge-Fills, Mapbox-Paint und Native-rgba (RN hat kein `color-mix`; `.native.tsx` ausgeschlossen) nutzen rgba legitim. Baseline 10 grandfathered (auth/admin-Ambient = Claimondo-only/nicht gebrandet; makler = Follow-up).

**Weitere Token-Foundation-Konventionen:** **Typo** = `text-caption`/`text-body-xs`/`-sm`/`text-body`/`text-heading-{sm,md,lg}` statt `text-[10px]`-Magic-Numbers. **Radius** = nur noch `rounded-ios-{sm,md,lg,xl}` (12/18/24/32); `rounded-claimondo-*` (8/14/20/36) ist retired.
<!-- END:branding-rules -->
