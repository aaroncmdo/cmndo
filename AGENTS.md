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
# Sprache & Zeichensatz — VERBINDLICH

Dieses Projekt ist ein deutsches Produkt für deutsche Nutzer. Alle nutzerorientierten Texte, Commit-Messages, Code-Comments und Dokumentation werden auf **Deutsch mit korrekten Umlauten** geschrieben.

## Pflicht: Umlaute verwenden

| Falsch (ASCII-Ersatz) | Richtig (Umlaut) |
|---|---|
| `Fuer` | `Für` |
| `loescht` | `löscht` |
| `naechsten` | `nächsten` |
| `Aenderung` | `Änderung` |
| `Ueberweisung` | `Überweisung` |
| `groesse` | `größe` |
| `Strasse` | `Straße` |

**Niemals** `ae`/`oe`/`ue`/`ss` als Umlaut-Ersatz verwenden. Immer die echten UTF-8 Zeichen `ä`, `ö`, `ü`, `ß`, `Ä`, `Ö`, `Ü`.

## Gilt für

- ✅ Git Commit-Messages (`git commit -m "AAR-XX: Fügt neuen Tab hinzu"` — nicht `"Fuegt neuen"`)
- ✅ Code-Comments in TS/TSX/JS Dateien
- ✅ String-Literale in der UI (Buttons, Labels, Toasts, Alerts, Headings)
- ✅ Markdown-Dokumentation
- ✅ SQL-Migration Comments
- ✅ Notion-Updates und Linear-Issue-Texte

## Ausnahmen

- Englische Fachbegriffe bleiben Englisch (`async`, `await`, `function`, `component`, `props`, `state`)
- Variablen-Namen und Funktions-Namen bleiben Englisch (`createUser`, `fallId`, `handleSubmit`)
- Datenbank-Spalten-Namen bleiben wie sie sind (`schadens_datum`, `kunden_betreuer`)
- ENV-Vars und API-Konstanten bleiben ASCII

## Begründung

ASCII-Ersatz wirkt unprofessionell und macht UI-Texte schwer lesbar. Eine Commit-Message mit `"Fuegt Loeschen-Funktion fuer Mandanten hinzu"` sieht aus wie aus den 90ern — `"Fügt Löschen-Funktion für Mandanten hinzu"` ist Standard.

Bei jedem Commit, jedem UI-Text, jedem Comment: kurz prüfen ob Umlaute drin sind wo sie hingehören.

Ein Pre-Commit-Hook (`.claude/hooks/check-umlauts.mjs`) blockiert Commits mit ASCII-Ersatz automatisch.
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
<!-- END:post-task-audit -->
