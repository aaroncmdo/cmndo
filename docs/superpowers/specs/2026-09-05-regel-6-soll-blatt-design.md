# Regelwerk-Review 05.09.2026 — Regel 6 „Soll-Blatt vor dem Bau" + Skill `operatives-soll`

> **Status:** Entwurf zur Entscheidung (Aaron). Nichts hiervon ist umgesetzt — keine Änderung an
> `AGENTS.md`, an den Skills oder an der Abnahme-Vorlage. Die drei offenen PRs #5863 (Regel 5),
> #5867 (Skills + Abnahme-Spec) und #5864 (Kasko-Fix) gehören anderen Sessions und bleiben unberührt.
> **Session:** f566a4ef · Haupt-Checkout `main` (nur gelesen) · gegengeprüft gegen `origin/staging`.

## 0 · Kurzfassung

Das Regelwerk deckt heute **Bau-Hygiene** (7-Punkte-Audit, 41 `check:*`-Ratchets), **Sicherheit**
(RLS-, Grant-, Reachability-Gates) und den **Abschluss** (Regel 4 Prod-Smoke, Regel 5 Abnahme mit
Matrix Eingänge × Rollen) stark ab. Was fehlt, liegt **am Anfang** und **in der Mitte**:

1. **Kein Start-Ritual.** Keine Regel verlangt, dass eine Session VOR dem Bau aufschreibt, *warum*
   gebaut wird, *wie es operativ ablaufen soll*, *an welchen Eingängen der Zustand entsteht*, *welche
   Rolle was sehen muss und was nicht* und *was dafür in der Datenbank wahr sein muss*. Das Soll
   entsteht heute beim Smoke (Regel 4 Schritt 1) oder in der Abnahme (Regel 5) — also nach dem Code.
   Belegt an der Kasko-Lane: 6 von 10 Matrix-Zeilen standen bei der Übergabe auf „gebaut; UI-Klick
   offen", und ein Eingang (Kunde kommt bereits als Kasko in den FlowLink) fehlte, bis Aaron fragte.
2. **Sicht wird nur negativ geprüft.** Alle Zugriffs-Gates beweisen „niemand sieht zu viel". Kein Gate
   und keine Regel beweist „die gemeinte Rolle sieht genug". Genau diese Klasse hat wiederholt
   geblutet (Kundenbetreuer: 28 von 81 Fällen leer · 4 `claims`-Spalten ohne Grant · Antwort landet im
   Lead, gelesen wird der Claim).
3. **Betriebsfähigkeit der DB jenseits des Schemas ist unversioniert und ungeprüft** (Realtime-
   Publication, Buckets, Edge Functions, pg_cron, Build-Env, `publicPaths`) — vier stille Brüche am
   03.09. gemessen.
4. **Skills:** 25 der 29 Projekt-Skills sind in jedem frischen Worktree unsichtbar (Symlinks, gitignored);
   ein Skill-Plan wird erst am Ende dokumentiert; prozedurales Wissen liegt in 1.860 Memory-Dateien
   statt in Skills; der Skill-Radar kennt die Wörter „Abnahme", „Soll", „Sicht" nicht.

**Vorschlag:** eine **Regel 6 „Soll-Blatt vor dem Bau"** (Auftragsklärung als Pflicht-Startschritt,
abgelegt in derselben Abnahme-Datei, die Regel 5 am Ende auswertet), ein Skill **`operatives-soll`**,
der das Soll-Blatt erzeugt (Warum · Soll-Ablauf · Matrix aus dem Register · Sicht-Matrix · DB-
Voraussetzungen · Skill-Plan · Abnahmekriterien), plus vier Skill-Disziplin-Maßnahmen. Details §5.

## 1 · Auftrag (Aaron, 05.09.2026, Spracheingabe)

> „Schau dir bitte unser Regelwerk an. Das soll darauf abzielen, dass wir den normalen Workflow haben.
> Das bedeutet, dass alle Abnahmen immer vollständig von allen Seiten geprüft werden, dass immer
> Skills verwendet werden, dass immer geprüft wird: gibt es einen besseren Skill dafür? Könnte ich
> eventuell einen Skill dafür schreiben, um diese Abläufe zu optimieren? Und lass uns schauen, welche
> Regeln noch fehlen, damit wir immer eine End-to-End-Prüfung haben und korrekt immer vollständig
> prüfen, ob die Datenbank richtig eingestellt ist für die operative Richtigkeit und den Benutzerfall
> — weil gegebenenfalls Leads rein müssen in die App, oder dass wir eben End-to-End richtig
> funktionieren. Richtig funktionieren bedeutet, dass jeder das sehen kann, was er sehen darf, dass
> jeder, der diese Sache gerade benötigt, sie auch wirklich vollständig so nutzen kann, wie sie gedacht
> ist. Vielleicht macht es Sinn, dass wir immer am Anfang die operative Richtigkeit kurz klarstellen und
> das wirklich ganz durchdenken, warum diese Sache entwickelt wird."

Fünf Ziele stecken darin: (Z1) Abnahmen vollständig von allen Seiten · (Z2) Skills immer nutzen, den
besseren suchen, fehlende schreiben · (Z3) E2E-Prüfung immer · (Z4) DB richtig eingestellt für den
Benutzerfall, positiv wie negativ („sehen darf" + „nutzen kann") · (Z5) Warum + operatives Soll am Anfang.

## 2 · Ist: Was das Regelwerk je Phase abdeckt

Gelesen: `AGENTS.md` (Regeln 1–4, 7-Punkte-Audit, D1, alle Ratchet-Abschnitte), PR #5863 (Regel 5),
`memory/abnahmen/{_VORLAGE,INDEX}.md` + die Kasko-Abnahme, `FEEDBACK-abnahme-instanz-mandat-aaron`,
`docs/fundament/FUNDAMENT.md` §0/§1/§9, `zugriffs-doktrin.md` §3, `entry-points.md` (A4),
`notification-matrix.md` (A3), `journey-smokes.md` + `scripts/journey-map.json`, die Skills
`regel4-smoke` / `journey-verifikation` / `release-drain` / `bibliothekar` (+ Erweiterungen aus #5867),
Hooks (`skill-radar.mjs` global, `session-end-check.mjs`), PR-Template, `package.json` `check:*`.

| Phase | Was heute gilt | Lücke |
|---|---|---|
| **Start: Warum + Soll** | Regel 4 Schritt 1 (Soll vor dem *Smoke*) · D1 (Journey-Delta vor dem Bau, nur bei J1–J10-Berührung) · FUNDAMENT §0 (nur Fundament-Pakete) · `bibliothekar` (nur wenn Aaron einen Prompt einreicht) | **Kein universelles Start-Ritual.** Das „Warum" steht nirgends als Pflichtfeld; das Soll kommt vor dem Smoke, nicht vor dem Bau. |
| **Bau** | 7-Punkte-Audit · Komponenten-Set · 41 Ratchets · Zugriffs-Doktrin §3 (neue Tabelle, default-closed) | Alles Hygiene und Sicherheit — **kein positives Sicht-Kriterium** („Rolle X muss Y sehen"). |
| **Nachweis** | Regel 4 (Prod-Smoke, alles per UI, 5 Messfallen) · `regel4-smoke` + `journey-verifikation` (mit #5867: Schritt 0, Matrix, Seed-Zustand, Sackgassen) · Journey-Gate am Release-Tor · nightly | **Matrix wird aus dem Kopf aufgestellt**, nicht aus dem A4-Register; `check:journey-bezug` kennt Journeys und Specs, aber keine Eingänge und Rollen. |
| **Abschluss** | Regel 5 (#5863, offen): drei Fragen, Bericht, Matrix, Ablage `memory/abnahmen/` · Abnahme-Session als Zweitprüfung | Gut — aber **rückwärts gerichtet**: „Auftrag — Aarons Worte" wird am Ende rekonstruiert statt am Anfang festgeschrieben. Bis zum Merge gilt Regel 5 nur über den Memory-Digest. |
| **Skills** | `using-superpowers` (Skill vor jeder Antwort) · Skill-Radar (global, stichwortbasiert, 1,9 % Trefferquote by design) · Vorlage §2 „Skills je Bereich" (am Ende) · Abnahme wiederholt mit Skill / holt nach | **Skill-Plan fehlt am Anfang** · 25/29 Projekt-Skills in Worktrees unsichtbar · keine Regel „wiederholter Ablauf → Skill" · Radar ohne Trigger für Abnahme/Soll/Sicht · Radar-Quelle im Repo (04.09.) ≠ laufende globale Kopie (25.08., Code gleich, nur Kommentar) — der Kopiermechanismus hat keinen Wächter. |
| **DB-Betrieb** | Regel 2 (DDL via MCP) · `check:migration-files` · `check:flag-drift` · `check:silent-writes` · RLS-/Grant-/Reachability-Gates · `check:claims-column-grants` | Nur **Schema + Sicherheit**. Publication, Buckets, Edge Functions, pg_cron, Build-Env, `publicPaths`, Outbox-Zeile: **weder versioniert noch je Feature geprüft.** |

## 3 · Befunde (mit Beleg)

**G1 · Kein Start-Ritual für gewöhnliche Aufgaben.**
Beleg: Kasko-Abnahme §6 bei Übergabe — 10 Zeilen, davon 6 „gebaut; UI-Klick offen / Sicht offen"; Matrix
wuchs von 9 auf 11 Zellen erst nach Aarons Frage „wenn ein Kunde anders in den FlowLink kommt"
(`FEEDBACK-abnahme-instanz-mandat-aaron`, Punkt 6). Regel-5-Entwurf: Abschnitt 1 „Aarons Worte" wird
beim Bericht geschrieben, nicht beim Start. Der Soll-Doc-Präzedenzfall (`docs/2026-08-31-operatives-soll-
kompletter-kundenfluss.md`, „Wer da ist und was er will") zeigt, wie das Warum aussieht — er entstand für
einen Audit, nicht als Feature-Start.

**G2 · Sicht nur negativ abgesichert.**
Beleg: `AUDIT-can-access-claim-kennt-unzugewiesene-faelle-nicht` (KB: 28/81 Fälle in 19 Tabellen leer);
`COORDINATION-staging-ci-rot-claims-spalten-ohne-grant` (4 Spalten „wären für User-Clients unsichtbar");
`AUDIT-quali-antwort-erreicht-den-claim-nicht`; `AUDIT-uploadfalldokument-rls-pfad-null-zeilen`;
`BROADCAST-fehlender-grant-kann-eine-entscheidung-sein` (kundensichtbar vs. intern ist eine **Entscheidung
je Spalte** — die heute im Kopf einer Grant-Migration steht, nicht im Soll). 22 von 96 e2e-Specs enthalten
irgendeine Negativ-Assertion; ein Testkonto `test-rls-nobody@` existiert, ist aber keine Pflichtzelle.

**G3 · DB-Betriebsfähigkeit jenseits des Schemas.**
Beleg: `AUDIT-supabase-featurescan-vier-stille-brueche` (4 Realtime-Subscriptions ohne Publication —
Dispatch-Lead-Alert tot · 2 Buckets fehlen · `gutachten-ocr` nie deployed · 25/26 pg_cron-Jobs
unversioniert: „ein Replay ergäbe eine DB ohne Scheduler und ohne Realtime"); `BROADCAST-next-public-env-
fehlt-beim-build`; `BROADCAST-neue-token-route-braucht-publicpaths-eintrag` (307 trotz grüner Tests);
`AUDIT-anthropic-guthaben-prod-leer`. Aarons „Leads müssen rein in die App" hängt genau an dieser Schicht:
Lead sichtbar (Policy) · Alert (Publication) · FlowLink (A4-Nachwirkung 3) · Erstnotification (Outbox).

**G4 · Skills.**
(a) `ls .claude/skills` = 29 Einträge; 25 sind Symlinks nach `.agents/skills/` (gitignored); in
`.claude/worktrees/abnahme-werkstattbindung-skills/.claude/skills/` sind **4** sichtbar (bibliothekar,
journey-verifikation, regel4-smoke, release-drain). Unsichtbar in jedem frischen Worktree: `owasp-security`,
`webapp-testing`, `playwright-skill`, `playwright-cli`, `fullstack-guardian`, `web-design-guidelines`, … —
während jede Regel den frischen Worktree vorschreibt. (b) Vorlage §2 „Skills je Bereich" wird am Ende
gefüllt; die Kasko-Abnahme fand `impeccable` und `owasp-security` **nachträglich** als fehlend. (c) Memory:
1.860 Dateien, davon 140 BROADCAST, 118 AUDIT, 60 HANDOFF; `MEMORY.md` 19.972 Bytes bei ~24 KB Ladegrenze
(Digest-Hook). Prozedurales Wissen („so misst man X", „so fährt man Y") lebt dort als Erzählung — die vier
Projekt-Skills sind die Ausnahme. (d) Skill-Radar: DE-Brücke ohne „abnahme", „soll", „sicht", „rolle",
„eingang"; er hat auf Aarons Prompt zu genau diesem Thema nicht angeschlagen (Hook-Output ohne Radar-Block).
(e) Radar-Quelle `.claude/hooks/skill-radar.mjs` (04.09.) ≠ `~/.claude/hooks/skill-radar.mjs` (25.08.):
Code identisch, Kommentare nicht — der Kopierschritt hat keinen Wächter.

**G5 · Regel 5 und die Skill-Erweiterungen liegen in offenen PRs** (#5863 nur `AGENTS.md`; #5867 Skills +
Journey-Map + Spec). Bis zum Merge kennt eine Session die Regel nur, wenn der Memory-Digest sie in die
Top 25 hebt.

**G6 · Rollen ohne stehendes Testkonto.** Login-Referenz: admin, dispatch, kanzlei, kb, makler, sv, kunde
(smoke-kunde), flotte, enroll, rls-nobody — **keine Werkstatt**, obwohl sie in J4/J5/J8/J10 eine Rolle
hat (Smokes legen Wegwerf-Werkstätten an). Für eine Matrix-Zelle „Werkstatt sieht …" fehlt der kurze Weg.

**G7 · Das A4-Register ist Prosa.** `entry-points.md` (28.07.) + `entry-points-flowlink.md` sind vollständig,
aber nicht maschinenlesbar und nicht mit `check:journey-bezug` verbunden → jede Session zählt Eingänge neu
auf und vergisst welche.

## 4 · Drei Ansätze

| | A · Regel 5 erweitern („Teil A vor dem Bau") | **B · Regel 6 + Skill `operatives-soll`** (Empfehlung) | C · Nur Skill + Hook, keine Regel |
|---|---|---|---|
| Idee | Start-Ritual in #5863 einbauen | Eigene harte Regel für den Start, dieselbe Abnahme-Datei, ein ausführender Skill | Skill + Erinnerungs-Hook beim ersten Prompt |
| Pro | Eine Regel, ein Lebenszyklus | Klare Phasen: Regel 6 = Start, Regel 4 = Nachweis, Regel 5 = Abschluss; unabhängig von #5863 mergebar; Skill macht die Regel ausführbar | Kein Wachstum von `AGENTS.md` |
| Contra | #5863 gehört Session 363abccc und ist schon lang; Start und Ende verschwimmen | Eine Regel mehr | Skills sind per Natur optional (Kasko: `impeccable` ungenutzt); Hooks sind informativ — reicht für „nicht verhandelbar" nicht |

**Empfehlung: B**, mit dem Hook aus C als zweiter Stufe (§5.5). Die Regel nennt das Was, der Skill das Wie,
der Hook erinnert.

## 5 · Design

### 5.1 Regel 6 — Textentwurf für `AGENTS.md` (nach Regel 5)

```
## Regel 6 — Soll-Blatt vor dem Bau (Auftragsklärung)

Jede Aufgabe mit nutzersichtbarem oder verhaltensrelevantem Impact (UI, Route, Server-Action,
DB-Write-Pfad, Cron, Migration, Comms) beginnt mit einem **Soll-Blatt** — geschrieben BEVOR die erste
Code-Zeile, der erste Seed, die erste Spec entsteht. Das Soll-Blatt ist die Abnahme-Datei
`memory/abnahmen/<datum>-<slug>.md` in ihrer Soll-Fassung (Abschnitte 1, 1b, 1c, 2, 6, 6a, 6b, 10),
Status im Register `🔵 Soll steht`. Regel 4 misst später GEGEN dieses Blatt, Regel 5 wertet es aus.
Skill: `operatives-soll`.

Pflichtinhalt:
1.  **Auftrag** — Aarons Worte wörtlich, nicht paraphrasiert.
1b. **Warum** — welcher Geschäftsvorfall, welche Rolle hat welches Problem; was passiert heute
    ohne das Feature; woran erkennt Aaron im Betrieb, dass es erreicht ist. Drei Sätze reichen —
    aber sie müssen da sein, denn aus dem Warum folgen die Eingänge (Kasko: „kein gebundener Kunde
    darf zur Werkstatt" → gilt an JEDEM Eingang, auch wenn der Zustand vorbelegt ankommt).
1c. **Operatives Soll** als Nutzer-Schrittfolge je Rolle, aus der Fachlogik, nicht aus dem Code —
    inklusive Folgezustand: was sieht die Nachbar-Rolle danach, wer wird benachrichtigt, was steht
    in der DB. Bei J1–J10-Berührung ist das der Journey-Delta (D1), sonst Prosa im Blatt.
2.  **Skills je Bereich** — geplant JETZT (Bereich · Skill · warum · geprüfte Alternative). Am Ende
    wird die Tabelle zur Bilanz (benutzt / nicht benutzt, warum).
6.  **Matrix Eingänge × Rollen** — aus dem Register (`docs/fundament/entry-points.md`,
    `entry-points-flowlink.md`, Rollenliste), nicht aus dem Gedächtnis. Jede Zelle, in der der
    Zustand entstehen, gelesen oder geändert werden kann — auch vorbelegt (Dispatch legt an, Webhook,
    API, Cron), Re-Visit desselben Links, Override durch eine interne Rolle.
6a. **Sicht-Matrix** je Rolle: MUSS sehen · DARF ändern · DARF NICHT sehen — plus die Zellen
    „anonym" und „Nicht-Berechtigter" (`test-rls-nobody@`). Eine Spalte, die kundensichtbar wird,
    steht hier als Entscheidung, bevor eine Grant-Migration sie festschreibt.
6b. **DB-Voraussetzungen** je Zelle: was in prod wahr sein muss (Spalten-Grant, Policy, View-Spalte,
    RPC-Grant, enum-CHECK, Realtime-Publication, Bucket, Edge Function, pg_cron, `NEXT_PUBLIC_*` zur
    Build-Zeit, `publicPaths`, Outbox-/Notification-Zeile) — mit dem Lese-Kommando, das es beweist.
    Nicht angenommen, sondern vor dem Bau gelesen; was fehlt, wird Teil des Auftrags.
10. **Abnahmekriterien** — Checkliste, die Aaron klicken kann; jede Zeile misst am Verhalten.

**Abstimmung:** Die Kurzfassung des Soll-Blatts (Warum · Soll · Matrix-Zeilen · Annahmen) geht an Aaron,
bevor gebaut wird. Antwortet er nicht, gilt FUNDAMENT §0.2: Annahmen markieren, weiterarbeiten, nie
raten und schweigen. Blockierend nur, wenn das Feature Geld, Kunden-Comms oder Löschung auslöst.

**Abgrenzung:** Reine Docs/Scripts/Config ohne Runtime-Flow → dreizeiliges Soll-Blatt (Warum +
Done-Kriterium + „n/a Matrix"), im PR vermerkt.

**Verboten:**
* Code, Seed oder Spec vor dem Soll-Blatt; das Soll aus dem Code ableiten.
* Matrix aus dem Kopf statt aus dem Register; „darf sehen" ohne „darf nicht sehen".
* DB-Voraussetzungen annehmen statt lesen („der Grant wird schon da sein").
* Das Soll-Blatt nach dem Bau an das Gebaute anpassen — Abweichung ist ein Befund (Regel 4/5).

Begründung: Aaron 05.09.2026 („immer am Anfang die operative Richtigkeit kurz klarstellen und wirklich
ganz durchdenken, warum diese Sache entwickelt wird"). Kasko-Werkstattbindung Phase 1: die Matrix stand
bei Übergabe zu 6/10 auf „UI-Klick offen", ein Eingang fehlte bis zur Nachfrage; Kundenbetreuer sah 28/81
Fälle leer; vier Realtime-Listener feuerten nie — in allen Fällen hätte ein vorab gelesenes Soll-Blatt die
Lücke in den Auftrag gehoben statt in die Abnahme.
```

### 5.2 Skill `operatives-soll` — Entwurf

Ablage: `.claude/skills/operatives-soll/` mit `SKILL.md` + `eingaenge-rollen.md` + `db-voraussetzungen.md`
(echte Dateien, `.gitignore`-Whitelist wie die vier bestehenden). Name bewusst das vorhandene Vokabular
(„operatives Soll" in Regel 4, Memory `FEEDBACK-operatives-soll-vor-smoke`).

**Frontmatter (nur Auslöser, kein Ablauf — writing-skills-Regel):**

```
---
name: operatives-soll
description: Use at the start of any task that changes what a user can do or see — before the first
  code edit, seed or spec — and whenever the WHY, the operational Soll, the entrances, the per-role
  visibility or the DB prerequisites of a change are unclear. Triggers on "Soll", "operatives Soll",
  "Soll-Blatt", "Auftragsklärung", "warum bauen wir das", "was soll passieren", "wer darf was sehen",
  "Sicht-Matrix", "Eingänge × Rollen", "Regel 6", "neues Feature", "bau mir", "ändere", "Leads müssen
  rein", and on any Abnahme file whose sections 1b/6/6b are empty.
---
```

**Body-Struktur (Entwurf, ~700 Wörter + 2 Referenzdateien):**

1. **Aarons Worte wörtlich** in Abschnitt 1 — kein Paraphrasieren (das Paraphrasieren ist der erste Ort,
   an dem das Ziel durch den Plan ersetzt wird).
2. **Warum in drei Fragen:** Welcher Geschäftsvorfall, welche Rolle, welches Problem? Was passiert heute
   ohne? Woran erkennt Aaron im Betrieb, dass es erreicht ist (messbar: DB-Zeile, Zustellung, Klick)?
3. **Soll-Ablauf je Rolle** nach dem Vorbild `docs/2026-08-31-operatives-soll-kompletter-kundenfluss.md`
   — Maßstab je Bildschirm: *Weiß die Rolle danach, wo sie steht, was passiert ist, was als Nächstes
   erwartet wird?* Folgezustand, Nachbar-Sicht, Benachrichtigung (A3-Matrix-Zeile), DB-Zustand.
4. **Eingänge aus dem Register** (`eingaenge-rollen.md`): A-1 Kunde-Wizard · A-3 Gegner/NFC · B-1 Embed
   Gutachter-Finder · B-2 Embed Werkstatt-Finder · B-3 API `melde-schaden` · B-4 Rückruf · C-1 FlowLink
   (+ 14 FlowLink-Eingänge) · Makler · Flotte · Dispatch-Anlage · Aircall · matelso · spontan · Kanzlei ·
   Re-Visit · Webhook · Cron. Rollen: anonym, kunde, gegner, werkstatt, sachverstaendiger, dispatch,
   admin, kundenbetreuer, makler, flottenmanager, kanzlei, nicht-berechtigt. Je Eingang: entsteht der
   Zustand hier? kommt er vorbelegt an? — Matrix-Zeile.
5. **Sicht-Matrix:** je Rolle MUSS sehen / DARF ändern / DARF NICHT sehen; Pflichtzellen `anonym` und
   `test-rls-nobody@`. Kundensichtbare Spalten = Entscheidung hier (Gegenstück zum Grant-Migrations-Kopf).
6. **DB-Voraussetzungen** (`db-voraussetzungen.md`): je Zelle die Achse + das prod-Lese-Kommando:
   Spalten-Grant (`has_column_privilege`) · Policy (`pg_policies`) · View-Spalte (`information_schema.
   columns`) · RPC-Grant (`routine_privileges`) · enum-CHECK (`scripts/lib/status-check-constraints.json`)
   · Realtime (`pg_publication_tables`) · Bucket (`storage.buckets`) · Edge Function (`list_edge_functions`)
   · pg_cron (`cron.job`) · Build-Env (Deploy-Workflow, pm2 **per Name**) · `publicPaths`
   (`src/lib/supabase/middleware.ts`) · Outbox (`notifications_outbox`, `notification_deliveries`).
   Fehlt etwas → Teil des Auftrags (Migration via MCP, Regel 2), nicht Annahme.
7. **Skills je Bereich** — Tabelle jetzt; Alternative geprüft: `ls` der drei Skill-Quellen + Radar-Brücke.
   Wiederholt sich ein Ablauf zum zweiten Mal → `writing-skills` (§5.4).
8. **Abnahmekriterien** als klickbare Checkliste; jede Zeile am Verhalten messbar.
9. **Ablegen:** Datei nach `_VORLAGE.md` anlegen, Register-Zeile `🔵 Soll steht`, Kurzfassung an Aaron.
   Erst dann Code.

**Common Mistakes (aus der Memory belegt):** Soll aus dem Code gelesen (Tautologie) · Matrix aus dem
Kopf (9→11) · „sieht" ohne „sieht nicht" · Werkzeug statt Produkt gemessen (`audit-kundenfluss`, 4
Fehlbefunde) · Leer = „gibt es nicht" (PostgREST 1000, Secrets-Pagination) · Bezeichner geraten statt
nachgeschlagen.

### 5.3 Abnahme-Vorlage und Register — Erweiterung (Eigentum: Abnahme-Session d319cc31)

* `_VORLAGE.md`: neue Unterabschnitte **1b Warum** und **1c Soll-Ablauf**; Abschnitt 2 „Skills je
  Bereich" bekommt die Spalten **geplant (Start)** / **benutzt (Ende)**; Abschnitt 6 bekommt die Spalten
  **Sicht (muss / darf nicht)** und **DB-Voraussetzung (geprüft wie, wann)**; neuer Abschnitt **6b
  DB-Voraussetzungen** (Achse · Kommando · Ergebnis · Datum).
* `INDEX.md`: Status **`🔵 Soll steht`** (vor `🟡 zur Abnahme`); Register-Zeile entsteht beim Start.
* Abschnitt 12 (Abnahme-Session) bekommt zwei Fragen: „Soll-Blatt vor dem Bau vorhanden? Abweichung Soll
  ↔ Gebaut?" und „Hätte ein Ablauf dieser Session ein Skill sein müssen? → angelegt?".

### 5.4 Skill-Disziplin (vier Maßnahmen)

1. **Skill-Plan am Start, Bilanz am Ende** — Bestandteil des Soll-Blatts (§5.1 Punkt 2); die Abnahme
   prüft die Bilanz.
2. **Zweimal-Regel:** Ein Ablauf, der zum zweiten Mal in einer Session ausgeführt oder als Lehre in den
   Speicher geschrieben wird und **prozedural** ist (wie misst/fährt/baut man X), wird ein getrackter
   Skill (`.claude/skills/<name>` + Whitelist). Der Speicher behält die Vorfallsgeschichte und verlinkt
   den Skill. Auslöser in der Abnahme (§5.3) und im Skill `operatives-soll` (Schritt 7).
3. **Sichtbarkeit:** Entscheidung je Skill der 25 Symlinks — die workflow-kritischen (`owasp-security`,
   `webapp-testing`, `playwright-skill`, `playwright-cli`, `fullstack-guardian`, `web-design-guidelines`)
   als echte Dateien tracken (Whitelist), die Dokument-Werkzeuge (`docx`/`pdf`/`pptx`/`xlsx`) nach
   `~/.claude/skills` (user-global). Bis dahin weiß keine Worktree-Session, dass es sie gibt.
4. **Skill-Radar:** DE-Brücke ergänzen — `operatives-soll`: soll, soll-blatt, auftragsklärung, warum
   bauen, sicht-matrix, wer darf sehen, regel 6, eingänge; `regel4-smoke` + `journey-verifikation`:
   abnahme, nutzerstrom, eingänge, rollen (die Descriptions aus #5867 haben die Wörter, die Brücke
   nicht). Dazu ein SessionStart-Hinweis, wenn `md5(repo-Quelle) ≠ md5(globale Kopie)` — der
   Kopierschritt bekommt einen Wächter.

### 5.5 Mechanisierung, Stufe 2 (nach Bewährung, nicht jetzt)

* **Hook `PreToolUse Bash` auf `gh pr create`:** warnt, wenn keine `memory/abnahmen/*.md` den aktuellen
  Branch nennt (Soll-Blatt fehlt). Erst warnen, nach zwei Wochen blocken — Entscheidung Aaron.
* **`scripts/eingaenge-map.json`** (maschinenlesbares A4-Register: Eingang → Code-Pfade → Rollen) und
  `check:journey-bezug` erweitern: „dein Diff berührt Eingänge B-2, C-1 → Rollen Kunde, Dispatch". Damit
  wird die Matrix aus dem Diff **vorgeschlagen**, nicht erinnert (schließt G7).
* **`scripts/smoke/sicht-matrix.mjs`:** je Testkonto (Rolle) per supabase-js einloggen, die Rollen-View
  lesen und je Zelle „sieht / sieht nicht" ausgeben — DB-Wahrheit als Ergänzung zur Playwright-UI-Wahrheit;
  Pflichtzelle `test-rls-nobody@`. Schließt G2 dauerhaft.
* **Werkstatt-Testkonto** anlegen (Aaron-Go wie bei `smoke-kunde@`, 17.07.) — schließt G6.

## 6 · Umsetzungsreihenfolge und Abhängigkeiten

1. **#5863 mergen** (Regel 5 ist der Anker; Regel 6 verweist auf dieselbe Datei).
2. **#5867 mergen** (Skill-Erweiterungen; Regel 6 baut auf der Matrix-Sprache dort auf).
3. **Neuer PR `kitta/regel-6-soll-blatt`** (frischer Worktree aus `origin/staging`): `AGENTS.md` Regel 6 ·
   Skill `operatives-soll` (3 Dateien) · `.gitignore`-Whitelist · Radar-DE-Brücke (+ Kopie nach
   `~/.claude/hooks`) · PR-Template-Zeile „Soll-Blatt: Link (Regel 6)". Reine Docs/Skills → Regel 4 n/a,
   im PR vermerkt.
4. **Vorlage/Register** (Memory, außerhalb des Repos) — mit Session d319cc31 abstimmen, die beide Dateien
   gerade pflegt (Marker `COORDINATION-regelwerk-review-regel-6-soll-blatt`).
5. Stufe 2 (§5.5) als eigene Tranchen.

## 7 · Prüfung des Skills (writing-skills: RED → GREEN)

* **RED (Baseline ohne Skill):** Subagent bekommt „Bau eine Kasko-Tariffrage in den FlowLink" ohne den
  Skill. Erwartet: beginnt im Code, kein Warum, keine Matrix, keine Sicht-Entscheidung, keine
  DB-Voraussetzung — die Rationalisierungen mitschreiben.
* **GREEN (mit Skill):** derselbe Auftrag; erwartet: Abnahme-Datei mit 1/1b/1c/2/6/6a/6b/10 **vor** dem
  ersten Code-Edit, Matrix mit ≥ 9 Zellen inkl. Re-Visit + vorbelegt + `nicht-berechtigt`, ≥ 1
  DB-Voraussetzung mit Lese-Kommando.
* **REFACTOR:** Lücken (z. B. „Matrix aus dem Kopf") mit Gegenbeispiel ins Common-Mistakes.
* Positivkontrolle (Regel 4 Messfalle 5): ein Auftrag **ohne** Nutzerimpact (reines Script) muss zum
  dreizeiligen Blatt führen, nicht zur vollen Matrix — sonst ist der Skill ein Alarm ins tote Postfach.

## 8 · Entscheidungen für Aaron

| # | Frage | Empfehlung |
|---|---|---|
| E1 | Regel 6 als eigene Regel (B) oder als Teil A von Regel 5 (A)? | **B** — Phasen bleiben lesbar, #5863 bleibt unberührt |
| E2 | Soll-Blatt-Abstimmung blockierend oder mit markierten Annahmen weiterarbeiten? | **Nicht blockierend** (FUNDAMENT §0.2), blockierend nur bei Geld/Comms/Löschung |
| E3 | Unsichtbare Skills: im Repo tracken oder user-global? | **Workflow-kritische tracken**, Dokument-Werkzeuge global |
| E4 | Hook auf `gh pr create` ohne Soll-Blatt: warnen oder blocken? | **Erst warnen**, nach zwei Wochen Messung entscheiden |
| E5 | Werkstatt-Testkonto anlegen? | **Ja** (Aaron-Go nötig, wie `smoke-kunde@`) |
| E6 | Soll ich den PR aus §6 Schritt 3 jetzt bauen (nach #5863/#5867)? | Ja, sobald E1–E3 entschieden sind |

## 9 · Nicht-Ziele

Kein Umbau von Regel 4/5; keine neue Test-Infrastruktur in dieser Tranche; kein Eingriff in die drei
offenen PRs; keine Änderung an FUNDAMENT §0 (Fundament-Pakete behalten ihr eigenes Ritual, das Soll-Blatt
ist dort der Journey-Delta).
