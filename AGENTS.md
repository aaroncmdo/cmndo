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
