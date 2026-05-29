# Migration-File UTF-8-Encoding-Fix — Design / Spec

**Datum:** 2026-05-29
**Autor:** Syncer-Session (Release-Pipeline)
**Status:** Proposal — wartet auf Aaron-Review
**Ticket:** (anlegen, z.B. AAR-/CMM-Infra)

---

## 1. Problem (Symptom)

Der GitHub-Check **„Supabase Preview"** schlägt bei **jeder** Pull-Request fehl, die eine
Datei unter `supabase/migrations/` enthält. Bei PRs ohne Migration ist der Check `skipping`,
darum fiel es lange nicht auf — er failt **nur** bei Migrations-PRs.

Zuletzt gesehen an **PR #2020** (CMM-44 MP-8b). Dessen eigene Migrations waren sauber, der
Check war trotzdem rot. Der Check ist **nicht required** (PRs sind weiter `MERGEABLE`), aber
er ist das einzige automatisierte Sicherheitsnetz, das prüft, ob die Migrations-History auf
einer frischen DB **sauber durchläuft** — und genau das ist aktuell blind.

## 2. Evidenz (die Belege)

**Check-Run-Summary von #2020 (Ground Truth):**
```
ERROR: invalid byte sequence for encoding "UTF8": 0xfc (SQLSTATE 22021)
At statement: 0
-- Placeholder: Migration 20260411231056 wurde vor Einf<0xfc>hrung des lokalen Migration-Trackings
-- direkt auf die DB angewendet. Inhalt ist in der DB <0x97> diese Datei dient nur
-- als lokaler Marker damit supabase CLI nicht abbricht.
```

Die Supabase-Preview baut für die PR eine **frische Branch-DB** und spielt die Migrations-
History **von vorne** ein. Sie stirbt am **ersten** File mit ungültigem UTF-8:
`20260411231056_placeholder.sql`. Byte `0xfc` = „ü" in Windows-1252/Latin-1 (in UTF-8 wäre
„ü" = `0xc3 0xbc`); `0x97` = Em-Dash „—" in Windows-1252.

**Autoritative Analyse (Python `str.decode('utf-8')`, der echte Postgres-Maßstab):**

| Kennzahl | Wert |
|---|---|
| Migrations-Files gesamt | 499 |
| davon ungültiges UTF-8 | **139** |
| davon `_placeholder.sql`-Stubs | **139 (= alle)** |
| davon echte DDL-Files | **0** |
| Non-ASCII **nur** in `--`-Kommentaren | **139 (= alle)** |
| sauber als Windows-1252 dekodierbar | **139 (= alle)** |
| Datums-Range der betroffenen Files | `20260411` .. `20260419` |

> Hinweis: Ein erster Scan mit `iconv` meldete fälschlich 499/499 — **`iconv` ist in der
> Windows-Git-Bash gar nicht installiert** (exit 127), jeder Check „schlug fehl". Python ist
> die Wahrheit: **139**.

## 3. Root Cause

Die 139 Files sind die **Pre-Tracking-Placeholder-Stubs** aus PR #1279
(siehe `supabase/_archive/migrations-pre-tracking/` + Memory „Pre-Tracking-Migrations-Archiv").
Als die echten Pre-Tracking-DDLs (2026-04-11..05-10) ins `_archive/` verschoben wurden, blieben
in `supabase/migrations/` reine **Kommentar-Stubs** als lokale Marker stehen (Inhalt ist
längst in der DB; Datei existiert nur, damit die supabase-CLI die Version nicht als „fehlend"
sieht). Diese Stubs wurden in **Windows-1252** statt UTF-8 gespeichert — die deutsche
Template-Zeile „… vor Einf**ü**hrung des … Trackings … Inhalt ist in der DB **—** …" trägt die
Latin-1-Bytes `0xfc`/`0x97`.

Postgres erwartet `client_encoding = UTF8` beim Einspielen → der erste Stub kippt den ganzen
Preview-Replay.

## 4. Scope / Non-Goals

**In Scope:**
- Re-Encoding der **139** `supabase/migrations/*_placeholder.sql`-Stubs von Windows-1252 → UTF-8.
- Optionales Guard gegen Wiederauftreten (siehe §7).

**Out of Scope (NICHT anfassen):**
- Echte DDL-Migrations-Files (0 betroffen — alle sauber UTF-8 oder reines ASCII).
- `supabase/_archive/migrations-pre-tracking/**` (außerhalb des CLI-/Preview-Scans, keine Wirkung).
- Jegliche **DDL-Semantik**: Die Stubs enthalten **keine** DDL-Zeile (verifiziert), nur Kommentare.
  Es wird **keine** Migration neu angewendet, neu getrackt oder inhaltlich verändert.

## 5. Impact

- **Vor Fix:** Supabase-Preview ist für **alle** Migrations-PRs blind-rot. Jede DB-PR muss über
  einen roten (aber non-required) Check gemergt werden — das Sicherheitsnetz „läuft die History
  auf einer frischen DB sauber durch?" fehlt. Risiko: ein **echter** Migrations-Fehler bliebe
  unentdeckt, weil „Supabase Preview rot" als Normalzustand abstumpft.
- **Nach Fix:** Preview läuft die History sauber durch und testet wieder echte Migrations.
- **Build-Gate** (`build`, der einzige *required* Check) ist von all dem **unberührt**.

## 6. Lösungsansatz

**Re-Encode Windows-1252 → UTF-8 via Python** (NICHT iconv — fehlt in der Shell):

```python
raw = open(path, 'rb').read()
open(path, 'wb').write(raw.decode('cp1252').encode('utf-8'))
```

Eigenschaften (alle an `20260411231056_placeholder.sql` verifiziert):
- Ergebnis ist **valides UTF-8**.
- Dekodierter **Text identisch** (nur die Byte-Repräsentation der Umlaute ändert sich:
  `0xfc` → `0xc3 0xbc`).
- **Zeilenenden (CRLF) bleiben erhalten** (reiner Byte-Transform; `\r\n` sind ASCII).
- **DDL byte-identisch** — die Stubs haben gar keine DDL-Zeile.

Alternative (verworfen): ASCII-ify (`ü`→`ue`, `—`→`-`). Robuster gegen erneutes Mis-Encoding,
aber ändert den Text. Da AGENTS.md ASCII in SQL-Kommentaren erlaubt, ist es ein valider Fallback
**falls** je ein Stub nicht sauber cp1252-dekodierbar wäre (aktuell: alle 139 sind es).

## 7. Recurrence-Guard (optional, empfohlen)

Damit das nicht wiederkommt, ein Check in der bestehenden CI-Script-Familie
(`scripts/check-*.mjs`, vgl. `check:token-audit` / `check:component-set`):

`scripts/check-migration-utf8.mjs` — failt, wenn ein `supabase/migrations/*.sql` kein valides
UTF-8 ist. Als CI-Step + optional PostToolUse-Hook auf Write/Edit von `supabase/migrations/**`.

## 8. Risiken & Mitigationen

| Risiko | Bewertung | Mitigation |
|---|---|---|
| Immutable-Migration-Prinzip verletzt (History-Files ändern) | **niedrig** | Nur **Kommentar-Bytes** ändern sich, 0 DDL. Version (Timestamp) unverändert. |
| Supabase Migration-Tracking erkennt „geänderte" Migration (Checksum-Drift) | **zu prüfen** | Tracking ist **versions-basiert** (`schema_migrations.version`), nicht inhalts-gehasht; bereits applizierte Versionen werden nicht neu eingespielt. **Pre-Flight (§Plan Task 0):** bestätigen, dass weder CI noch ein Hook Migrations-**Inhalte** hasht. |
| Re-Encode mangelt einen Stub (mixed encoding) | **sehr niedrig** | Alle 139 sind verifiziert sauber cp1252; Script re-encodet **nur** Files, die aktuell ungültiges UTF-8 sind, und **verifiziert** danach UTF-8-Gültigkeit + Text-Identität. |
| Andere Session committet parallel in `supabase/migrations/` | **niedrig** | Fix läuft im eigenen Worktree/Branch; reine Stub-Files, die niemand sonst editiert. |

## 9. Akzeptanzkriterien

1. `python`-Scan: **alle 499** `supabase/migrations/*.sql` sind valides UTF-8 (0 bad).
2. `git diff` der Fix-Commits zeigt **ausschließlich** geänderte Bytes in `--`-Kommentarzeilen
   der `_placeholder.sql`-Files; **keine** DDL-Zeile, **kein** echtes DDL-File geändert.
3. Der **Supabase-Preview-Check der Fix-PR selbst** wird **grün** (beweist: History läuft
   jetzt sauber durch — die Fix-PR berührt `supabase/migrations/` und triggert die Preview).
4. Eine darauffolgende echte Migrations-PR bekommt wieder eine grüne (oder echt-aussagekräftige)
   Preview.

## 10. Rollback

Reiner File-Change → `git revert <commit>`. Keine DB-Wirkung, kein State, nichts zu de-migrieren.
