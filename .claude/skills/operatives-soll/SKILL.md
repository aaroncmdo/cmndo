---
name: operatives-soll
description: Use at the start of EVERY task Aaron assigns — before the first code edit, seed, spec or migration — and whenever the WHY, the operational Soll, the entrances, the per-role visibility or the DB prerequisites of a change are unclear. Triggers on "Soll", "operatives Soll", "Soll-Blatt", "Auftragsklärung", "warum bauen wir das", "was soll passieren", "wer darf was sehen", "Sicht-Matrix", "Eingänge × Rollen", "Regel 6", "neues Feature", "bau mir", "ändere", "fix", "Leads müssen rein", and on any Abnahme file whose sections 1b, 1c, 6a or 6b are empty. Mandatory (Aaron, 05.09.2026): "Pflicht für jede Session und jede Aufgabe, die ich stelle."
---

# Operatives Soll — das Soll-Blatt vor dem Bau (Regel 6)

## Überblick

Bevor eine Zeile Code, ein Seed oder eine Spec entsteht, steht auf einem Blatt, **warum** gebaut wird,
**wie es für jede Rolle ablaufen soll**, **an welchen Eingängen** der Zustand entsteht, **wer ihn sehen
muss und wer nicht**, und **was dafür in prod wahr sein muss**. Das Blatt ist die Abnahme-Datei
`memory/abnahmen/<YYYY-MM-DD>-<slug>.md` (nach `_VORLAGE.md`) in ihrer Soll-Fassung. Regel 4 misst
später **gegen** dieses Blatt, Regel 5 wertet es aus. Der Code ist der Prüfling, das Blatt der Maßstab.

> „Vielleicht macht es Sinn, dass wir immer am Anfang die operative Richtigkeit kurz klarstellen und
> das wirklich ganz durchdenken, warum diese Sache entwickelt wird." *(Aaron, 05.09.2026)*

## Wann

**Immer** — jede Aufgabe, die Aaron stellt. Die Tiefe skaliert mit dem Impact:

| Aufgabe | Blatt |
|---|---|
| UI, Route, Server-Action, DB-Write-Pfad, Cron, Migration, Comms, Lead-Eingang | **volles Blatt** (Schritte 1–9) |
| Audit / Analyse / Messung | Schritte 1–3 + 8 (das Soll ist die Messlatte) |
| reine Docs / Scripts / Config ohne Runtime-Flow | **Dreizeiler**: Warum · Done-Kriterium · „n/a Matrix" — im PR vermerkt |

Nicht das Blatt nachreichen, wenn der Code schon steht: dann ist es ein Ist-Protokoll und misst nichts.

## Die neun Schritte

### 1 · Aarons Worte wörtlich (Abschnitt 1)
Zitat, kein Paraphrasieren. Paraphrasieren ist der erste Ort, an dem das Ziel durch den Plan ersetzt
wird. Entscheidungen, die Aaron unterwegs trifft, kommen datiert dazu.

### 2 · Warum — drei Fragen (Abschnitt 1b)
1. Welcher Geschäftsvorfall, welche Rolle, welches Problem?
2. Was passiert heute ohne das Feature — für den Nutzer, für das Team, fürs Geld?
3. Woran erkennt Aaron **im Betrieb**, dass es erreicht ist? (DB-Zeile, Zustellung, Klick — messbar.)

Drei Sätze reichen. Aus dem Warum folgen die Eingänge: „Kein gebundener Kasko-Kunde darf zur
Werkstatt" gilt an **jedem** Eingang, auch wenn der Zustand vorbelegt ankommt — genau der Eingang, der
in der ersten Kasko-Matrix fehlte (9 → 11 Zellen erst nach Aarons Frage).

### 3 · Soll-Ablauf je Rolle (Abschnitt 1c)
Nutzer-Schrittfolge aus der **Fachlogik**, nicht aus dem Code (Vorbild:
`docs/2026-08-31-operatives-soll-kompletter-kundenfluss.md`). Maßstab je Bildschirm: *Weiß die Rolle
danach, wo sie steht, was gerade passiert ist und was als Nächstes von ihr erwartet wird?*
Je Schritt den **Folgezustand** benennen: Was sieht die Nachbar-Rolle danach? Wer wird benachrichtigt
(Zeile in `docs/fundament/notification-matrix.md`)? Was steht in der DB?
Berührt die Änderung J1–J10 → das ist der Journey-Delta (AGENTS.md D1) in `docs/fundament/journeys/`.

**Bestand nachschlagen, nicht raten — und die Grenze kennen:** Gibt es das Feld oder den Zustand schon unter
anderem Namen (`polizei_vor_ort` ist nicht „gemeldet")? Code und Schema liest man hier für **Bezeichner,
Views, Grants** — nie für das Soll. Was der Nutzer erleben soll, kommt aus der Fachlogik; wie es heißt und
wo es liegt, aus dem Repo.

### 4 · Eingänge × Rollen aus dem Register (Abschnitt 6)
**Nicht aus dem Gedächtnis.** Liste in `eingaenge-rollen.md` (neben diesem Skill) durchgehen — dort stehen
die drei Fragen je Eingang; Quelle sind `docs/fundament/entry-points.md` + `entry-points-flowlink.md`.
Jede Ja-Antwort ist eine Zeile in Abschnitt 6 der Vorlage. Dazu je Rolle, die den Zustand liest oder
ändert, eine Zeile — inklusive Override durch eine interne Rolle (wirkt auf Lead **und** Claim **und**
Kundensicht). Die Versuchung, nur die vier „interessanten" Eingänge zu listen, ist der Normalfall; genau
beim Durchgehen der langweiligen fällt die Vorbelegungs-Falle auf (Embed-Platzhalter `false`).

### 5 · Sicht-Matrix (Abschnitt 6a)
Je Rolle: **MUSS sehen** · **DARF ändern** · **DARF NICHT sehen**. Pflichtzellen: `anonym` und
`Nicht-Berechtigter` (`test-rls-nobody@`). Alle Zugriffs-Gates des Repos beweisen nur „niemand sieht
zu viel" — dass die gemeinte Rolle **genug** sieht, beweist nur diese Matrix (KB sah 28/81 Fälle leer;
4 `claims`-Spalten ohne Grant wären für User-Clients unsichtbar gewesen). Welche Spalte kundensichtbar
wird, ist eine **Entscheidung** und steht hier — bevor eine Grant-Migration sie festschreibt
(`BROADCAST-fehlender-grant-kann-eine-entscheidung-sein`).

### 6 · DB-Voraussetzungen (Abschnitt 6b)
Je Matrix-Zelle: Was muss in prod wahr sein, damit sie funktioniert? Achsen und Lese-Kommandos in
`db-voraussetzungen.md`: Spalten-Grant · Policy · View-Spalte · RPC-Grant · enum-CHECK · Realtime-
Publication · Bucket · Edge Function · pg_cron · Build-Env · `publicPaths` · Outbox · Intake-
Nachwirkungen. **Vor dem Bau lesen** (MCP `execute_sql`, nur READ), nicht annehmen. Was fehlt, wird
Teil des Auftrags (Migration über `apply_migration`, Regel 2) — nicht Annahme, nicht Follow-up.
**Reihenfolge ins Blatt:** eine Config- oder DDL-Zeile wirkt sofort, Code erst nach dem Deploy — die
Spalte „Folge" in 6b sagt, was zuerst passieren muss.

### 7 · Skills je Bereich (Abschnitt 2)
Tabelle **jetzt**: Bereich · Skill · warum · geprüfte Alternative. „Gibt es einen besseren?" heißt
nachsehen, nicht erinnern: die Skill-Liste im Systemprompt, `ls ~/.claude/skills`, `ls .claude/skills`,
plus der Skill-Radar-Hinweis. Typische Zuordnung: Design/UX-Endzustände → `impeccable` · Sicherheit/
Rollen → `owasp-security` · Smoke → `regel4-smoke` + `journey-verifikation` · Supabase/RLS →
`supabase` · Prompt-Entwurf → `bibliothekar` · Design vor Code → `superpowers:brainstorming`.
**Zweimal-Regel:** Ein Ablauf, der zum zweiten Mal ausgeführt wird oder als prozedurale Lehre in den
Speicher soll, wird ein getrackter Skill (`superpowers:writing-skills`, `.gitignore`-Whitelist) — der
Speicher behält nur die Vorfallsgeschichte und verlinkt ihn.

### 8 · Abnahmekriterien (Abschnitt 10)
Checkliste, die Aaron klicken kann. Jede Zeile hat die Form *„Wenn <Rolle> <tut>, dann <messbarer
Folgezustand>, gemessen an <DB-Wert / UI-Verhalten>"*. Keine Zeile „Feature gebaut".

### 9 · Ablegen, abstimmen, dann erst Code
Datei anlegen, Register-Zeile in `memory/abnahmen/INDEX.md` mit Status `🔵 Soll steht`, Skills-Plan und
Matrix drin. **Kurzfassung an Aaron** (≤ 10 Zeilen: Warum · Soll in drei Sätzen · Matrix-Zeilen ·
Annahmen · höchstens drei Fragen). Antwortet er nicht: Annahmen im Blatt markieren und weiterarbeiten
(FUNDAMENT §0.2 — nie raten und schweigen, nie blockieren). **Blockierend warten** nur, wenn das Feature
Geld bewegt, echte Kunden-Comms auslöst oder löscht.

## Danach

* `regel4-smoke` Schritt 1 schreibt kein neues Soll — er **liest** Abschnitt 1c und misst Abschnitt 6.
* Regel 5 füllt Abschnitte 3–5, 7–9 und 11; die Abnahme-Session prüft Abschnitt 12, inklusive
  „Soll-Blatt vor dem Bau vorhanden? Abweichung Soll ↔ Gebaut?" und der Skill-Bilanz.
* Weicht das Gebaute vom Blatt ab, wird das Blatt **nicht** angepasst — die Abweichung ist ein Befund.

## Common Mistakes

| Fehler | Warum er kostet |
|---|---|
| Soll aus dem Code gelesen | Tautologie: „Code tut, was Code tut" (Regel 4, Begründung „Soll zuerst") |
| Matrix aus dem Kopf | Eingänge fehlen, bis jemand fragt (Kasko: erst nach Nachfrage vollständig) |
| „sieht" ohne „sieht nicht" | Lecks und leere Sichten bleiben beide unentdeckt |
| DB-Voraussetzung angenommen | Listener ohne Publication feuert nie, Bucket fehlt, 307 ohne `publicPaths` |
| Werkzeug statt Produkt gemessen | ein interner Test-Lead bekommt nie Kunden-WhatsApp — das ist kein Befund |
| Leer = „gibt es nicht" | PostgREST liefert 1.000 Zeilen, MCP sieht `v_claim_*` leer |
| Bezeichner geraten | geratene Spaltennamen sind tote Queries — nachschlagen (`information_schema.columns`) |

Belege mit Zahlen stehen einmal in AGENTS.md Regel 6 (Begründung) und im Design-Doc — hier bewusst nicht wiederholt.

## Verwandt

- `regel4-smoke` — der Nachweis gegen das Blatt, nach dem Deploy
- `journey-verifikation` — welchen ganzen Lauf die Änderung berührt
- `bibliothekar` — wenn Aaron einen Prompt zur Prüfung gibt, bevor eine Session ihn bekommt
- `superpowers:brainstorming` — Design **nach** dem Soll, vor dem Code
- Abnahme-Ort: `memory/abnahmen/INDEX.md` · Vorlage `memory/abnahmen/_VORLAGE.md`
- Regeln: AGENTS.md Regel 4 (Nachweis), Regel 5 (Abnahme), Regel 6 (dieses Blatt)
