<!-- BEGIN:claimondo-hard-rules -->
# Harte Regeln (Niemals brechen)

Diese drei Regeln sind nicht verhandelbar. Jede Session, jeder Commit, jede Migration muss sie einhalten. Sie entstanden aus konkreten Incidents — siehe Session-Referenzen.

## Regel 1 — Nie direkt auf `main` pushen

Jede Arbeit läuft auf einem Feature-Branch mit Linear-Ticket-Namensschema (`kitta/aar-<nr>-<slug>`), PR gegen `staging`, Merge erst nach Review. **Direct-Push auf `main` ist verboten**, auch wenn der Commit „sauber" wirkt.

Begründung: Session vom 19.04.2026 — Commits `572cbea` (AAR-582) und `65a876b` (AAR-580) wurden direkt auf `main` gepusht. Inhaltlich sauber, aber der Flow-Bruch zerstört Preview-Deploys + Review-Spur + Rollback-Sicherheit.

Bei Unfall: `git revert` + neuer Branch + PR.

## Regel 2 — DDL nur über supabase-CLI, nie über Management-API

Schema-Änderungen (ADD/DROP/ALTER COLUMN, CREATE/DROP TABLE, CREATE TRIGGER, CREATE FUNCTION, RLS-Policies usw.) ausschließlich via:

```
npx supabase migration new <name>
# SQL in die generierte Datei schreiben
npx supabase db push
```

Alternativ für einmalige Recovery-Operationen (z. B. Migration die nachträglich gefahren werden muss):

```
npx supabase db query --linked --file <sql-file>
npx supabase migration repair --status applied <version>
```

**Verboten:** `POST /v1/projects/{ref}/database/query` mit DDL-Payload (Supabase Management API), auch wenn es „schneller" geht. **Verboten:** direkte DDL im Supabase Studio ohne korrespondierende Migration-Datei.

Begründung: Direktes Management-API-DDL bypasst `supabase_migrations.schema_migrations` → Drift (AAR-600). Nächstes `supabase db push` fährt Migrations doppelt oder überhaupt nicht, Repo ist nicht mehr reproducible (`db reset` würde das Schema brechen). AAR-600 hat die daraus entstandene Drift nachträglich bereinigt — Mehrarbeit, die durch konsequente CLI-Nutzung vermieden worden wäre.

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
<!-- END:claimondo-component-set -->

<!-- BEGIN:branding-rules -->
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
* **Semantische Farben bleiben semantisch:** Status-Grün/Warning-Gelb/Danger-Rot werden in `theme.ts:generateStatus()` an die Brand-Saturation harmonisiert (gewollt). Ein „echtes" Material-Grün (Trust-Marker, Verifizierungs-Badge) darf hardcoded `text-emerald-600` o.ä. bleiben.
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
<!-- END:branding-rules -->
