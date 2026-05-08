# RLS-Sichtbarkeits-Matrix

**Generiert:** 08.05.2026, 19:14  
**Skript:** `scripts/e2e-rls-check.mjs`  
**Grundlage:** `docs/portals-review/SMOKE-PLAN-FULL-E2E.md` §4.2

> Non-destructive — nur SELECT-Abfragen. Seed-Voraussetzung:
> `e2e-reset.mjs` + `e2e-seed-fixtures.mjs` müssen vorher gelaufen sein.

## Zusammenfassung

| Klassifizierung | Anzahl |
|---|---|
| ❌ Fehler (RLS-Leak oder blockiert) | 15 |
| ⚠️ Warnung (manuelle Kontrolle nötig) | 27 |
| ✅ OK | 48 |
| – Tabelle nicht vorhanden | 0 |

## ❌ Gefundene Fehler

- **Rolle `sv`, Tabelle `leads`** — Erwartet: `null`, Count: 1 — RLS-Leak! Count=1 statt 0
- **Rolle `dispatch`, Tabelle `claims`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `dispatch`, Tabelle `dokumente`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `dispatch`, Tabelle `pflicht_kategorien`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `dispatch`, Tabelle `lexdrive_events`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `abrechnungen`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `dokumente`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `partner_provisionen`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `provisionen_maik`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `makler_provisionen`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `pflicht_kategorien`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `admin`, Tabelle `lexdrive_events`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `kb`, Tabelle `dokumente`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `kb`, Tabelle `pflicht_kategorien`** — Erwartet: `alle`, Count: 0 — Count=0 obwohl Seed-Daten erwartet — RLS blockiert?
- **Rolle `kb`, Tabelle `sv_tages_session`** — Erwartet: `null`, Count: 10 — RLS-Leak! Count=10 statt 0

## ⚠️ Warnungen (manuelle Kontrolle erforderlich)

- **Rolle `kunde`, Tabelle `faelle`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `claims`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `auftraege`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `gutachter_termine`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `mitteilungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `nachrichten`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `dokumente`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kunde`, Tabelle `profiles`** — Count: 1 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `kunde`, Tabelle `timeline`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `faelle`** — Count: 1 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `sv`, Tabelle `claims`** — Count: 1 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `sv`, Tabelle `auftraege`** — Count: 1 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `sv`, Tabelle `gutachter_termine`** — Count: 3 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `sv`, Tabelle `mitteilungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `nachrichten`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `abrechnungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `dokumente`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `profiles`** — Count: 1 — Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen
- **Rolle `sv`, Tabelle `sachverstaendige`** — Count: 1 — Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen
- **Rolle `sv`, Tabelle `timeline`** — Count: 105 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `sv`, Tabelle `pflicht_kategorien`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `sv`, Tabelle `sv_tages_session`** — Count: 2 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `dispatch`, Tabelle `mitteilungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `dispatch`, Tabelle `sachverstaendige`** — Count: 8 — Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen
- **Rolle `admin`, Tabelle `mitteilungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)
- **Rolle `kb`, Tabelle `leads`** — Count: 2 — Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar
- **Rolle `kb`, Tabelle `mitteilungen`** — Count: 0 — Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen)

---

## Detail-Tabellen pro Rolle

### Rolle: `kunde` (test-kunde@claimondo.de)

| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |
|---|---|---|---|---|
| `faelle` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `claims` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `auftraege` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `leads` | `null` | 0 | ✅ | – |
| `gutachter_termine` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `mitteilungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `nachrichten` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `abrechnungen` | `null` | 0 | ✅ | – |
| `dokumente` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `profiles` | `nur_eigene` | 1 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `sachverstaendige` | `null` | 0 | ✅ | – |
| `partner_provisionen` | `null` | 0 | ✅ | – |
| `provisionen_maik` | `null` | 0 | ✅ | – |
| `makler_provisionen` | `null` | 0 | ✅ | – |
| `timeline` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `pflicht_kategorien` | `null` | 0 | ✅ | – |
| `lexdrive_events` | `null` | 0 | ✅ | – |
| `sv_tages_session` | `null` | 0 | ✅ | – |

### Rolle: `sv` (test-sv@claimondo.de)

| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |
|---|---|---|---|---|
| `faelle` | `nur_eigene` | 1 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `claims` | `nur_eigene` | 1 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `auftraege` | `nur_eigene` | 1 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `leads` | `null` | 1 | ❌ | RLS-Leak! Count=1 statt 0 |
| `gutachter_termine` | `nur_eigene` | 3 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `mitteilungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `nachrichten` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `abrechnungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `dokumente` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `profiles` | `grob` | 1 | ⚠️ | Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen |
| `sachverstaendige` | `grob` | 1 | ⚠️ | Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen |
| `partner_provisionen` | `null` | 0 | ✅ | – |
| `provisionen_maik` | `null` | 0 | ✅ | – |
| `makler_provisionen` | `null` | 0 | ✅ | – |
| `timeline` | `nur_eigene` | 105 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `pflicht_kategorien` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `lexdrive_events` | `null` | 0 | ✅ | – |
| `sv_tages_session` | `nur_eigene` | 2 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |

### Rolle: `dispatch` (test-dispatch@claimondo.de)

| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |
|---|---|---|---|---|
| `faelle` | `alle` | 6 | ✅ | – |
| `claims` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `auftraege` | `alle` | 2 | ✅ | – |
| `leads` | `alle` | 12 | ✅ | – |
| `gutachter_termine` | `alle` | 9 | ✅ | – |
| `mitteilungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `nachrichten` | `alle` | 2 | ✅ | – |
| `abrechnungen` | `null` | 0 | ✅ | – |
| `dokumente` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `profiles` | `alle` | 33 | ✅ | – |
| `sachverstaendige` | `grob` | 8 | ⚠️ | Grobe Liste sichtbar — Inhalt (keine PII?) manuell prüfen |
| `partner_provisionen` | `null` | 0 | ✅ | – |
| `provisionen_maik` | `null` | 0 | ✅ | – |
| `makler_provisionen` | `null` | 0 | ✅ | – |
| `timeline` | `alle` | 127 | ✅ | – |
| `pflicht_kategorien` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `lexdrive_events` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `sv_tages_session` | `alle` | 10 | ✅ | – |

### Rolle: `admin` (test-admin@claimondo.de)

| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |
|---|---|---|---|---|
| `faelle` | `alle` | 6 | ✅ | – |
| `claims` | `alle` | 8 | ✅ | – |
| `auftraege` | `alle` | 2 | ✅ | – |
| `leads` | `alle` | 12 | ✅ | – |
| `gutachter_termine` | `alle` | 9 | ✅ | – |
| `mitteilungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `nachrichten` | `alle` | 2 | ✅ | – |
| `abrechnungen` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `dokumente` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `profiles` | `alle` | 33 | ✅ | – |
| `sachverstaendige` | `alle` | 8 | ✅ | – |
| `partner_provisionen` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `provisionen_maik` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `makler_provisionen` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `timeline` | `alle` | 127 | ✅ | – |
| `pflicht_kategorien` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `lexdrive_events` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `sv_tages_session` | `alle` | 10 | ✅ | – |

### Rolle: `kb` (test-kb@claimondo.de)

| Tabelle | Erwartet | Ist (Count) | Status | Kommentar |
|---|---|---|---|---|
| `faelle` | `alle` | 2 | ✅ | – |
| `claims` | `alle` | 8 | ✅ | – |
| `auftraege` | `alle` | 2 | ✅ | – |
| `leads` | `zugewiesen` | 2 | ⚠️ | Manuelle Kontrolle nötig — kann nicht ohne Cross-Compare verifizieren ob nur eigene sichtbar |
| `gutachter_termine` | `alle` | 4 | ✅ | – |
| `mitteilungen` | `nur_eigene` | 0 | ⚠️ | Count=0 — entweder keine eigenen Daten vorhanden oder RLS blockiert (Seed prüfen) |
| `nachrichten` | `alle` | 2 | ✅ | – |
| `abrechnungen` | `null` | 0 | ✅ | – |
| `dokumente` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `profiles` | `alle` | 33 | ✅ | – |
| `sachverstaendige` | `null` | 0 | ✅ | – |
| `partner_provisionen` | `null` | 0 | ✅ | – |
| `provisionen_maik` | `null` | 0 | ✅ | – |
| `makler_provisionen` | `null` | 0 | ✅ | – |
| `timeline` | `alle` | 112 | ✅ | – |
| `pflicht_kategorien` | `alle` | 0 | ❌ | Count=0 obwohl Seed-Daten erwartet — RLS blockiert? |
| `lexdrive_events` | `null` | 0 | ✅ | – |
| `sv_tages_session` | `null` | 10 | ❌ | RLS-Leak! Count=10 statt 0 |

---

## Legende

| Status | Bedeutung |
|---|---|
| ✅ | Ergebnis entspricht Erwartung |
| ⚠️ | Warnung — Count vorhanden, aber nur manuelle Prüfung kann bestätigen ob wirklich nur "eigene" Daten |
| ❌ | Fehler — RLS-Leak (Count > 0 obwohl 0 erwartet) oder RLS blockiert zu viel (Count = 0 obwohl Daten vorhanden sein müssen) |
| – | Tabelle existiert nicht in der DB — übersprungen |

### Erwartungs-Werte

| Wert | Bedeutung |
|---|---|
| `alle` | Rolle darf alle Rows sehen — Count > 0 nach Seed erwartet |
| `nur_eigene` | Nur eigene Rows sichtbar — Cross-Compare nötig zur Vollprüfung |
| `zugewiesen` | Nur zugewiesene Rows sichtbar — wie `nur_eigene` |
| `null` | Kein Zugriff — Count muss exakt 0 sein |
| `grob` | Grobe Liste ohne PII — Count > 0 OK, Inhalt manuell prüfen |
