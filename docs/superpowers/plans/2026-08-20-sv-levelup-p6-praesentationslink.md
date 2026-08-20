# SV-LevelUp P6 — der Präsentationslink

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans`.

**Ziel:** Ein Versprechen einlösen, das der Gesprächsleitfaden zweimal gibt — „Am Ende bekommen Sie den Plan, egal wie Sie sich entscheiden." Heute gibt es nichts, was Aaron dem Sachverständigen schicken könnte.

**Aufbau:** Eine öffentliche Route `/plan/[token]` in `sv-levelup`, gespeist aus `levelup_praesentationen` (liegt seit P1 auf prod). Aaron erzeugt den Link aus der Auswertung heraus und kann ihn widerrufen.

## Was der Plan zeigt — und was nicht

Spec §5.3 zieht die Grenze scharf: „Der Präsentationslink zeigt dem **Sachverständigen** den Maßnahmenplan — ohne Gesprächsleitfaden, ohne Einwandbehandlung, ohne Konvertierung."

| zeigt | zeigt NICHT |
|---|---|
| Befund je Modul mit Quelle und Datum | Gesprächsleitfaden, Minutenplan |
| Maßnahmenplan in drei Phasen | Einwände und ihre Antworten |
| Aufwand, Punkte, Wirkung je Maßnahme | Konvertierung zum Partner |
| Gültigkeit des Links | Kontaktdaten, Herkunft der Anreicherung |

⚠ Die Einwandbehandlung ist der Grund für zwei getrennte Tabellen und zwei getrennte Tokens. Ein Sachverständiger, der liest, wie seine eigenen Einwände vorweggenommen werden, führt kein Gespräch mehr — er beendet eines.

⚠ **Verhältnis zu R-E:** unberührt. R-E verbietet, dass Maßnahmen **automatisch** in einer öffentlichen Antwort erscheinen. Dieser Link ist bewusst erzeugt, an eine Person gerichtet, befristet und widerrufbar. Der Test T-07 bleibt unverändert scharf: auf `/check/[token]` im Zustand `fertig` darf das Wort `massnahmen` im Antwortkörper nicht vorkommen.

## Die Tabelle liegt schon

`levelup_praesentationen` (P1, Migration `20260818160345_levelup_basis.sql`):

```
id · check_id · token · erstellt_von NOT NULL
gueltig_bis   timestamptz NOT NULL default now() + 30 days
widerrufen_am timestamptz
aufrufe int NOT NULL default 0 · letzter_aufruf · erstellt_am
```

Policy `levelup_praes_staff_sel` (Staff-SELECT), `anon` liest nicht. Gelesen wird — wie bei `/check/[token]` — serverseitig mit dem Dienst-Client; der Token ist der Schutz. **Keine Migration nötig.**

---

### Aufgabe 1: Bibliothek `praesentation.ts`

**Dateien:** `sv-levelup/lib/levelup/praesentation.ts` + Test

**Schnittstellen:**
- `erzeugePlanlink(db, checkId, userId): Promise<{ ok: true; token: string; gueltigBis: string } | { ok: false; error: string }>`
- `pruefePlanlink(db, token, jetzt): Promise<{ ok: true; checkId: string; gueltigBis: string } | { ok: false; grund: 'unbekannt' | 'abgelaufen' | 'widerrufen' }>`
- `widerrufePlanlink(db, token): Promise<{ ok: boolean; error?: string }>`

**Vier Fälle, die der Test festhält:**

1. **Idempotenz** — existiert ein **gültiger, nicht widerrufener** Link, wird er zurückgegeben. ⚠ Anders als beim Auswertungslink darf ein **abgelaufener oder widerrufener** Link *nicht* wiederbelebt werden: ein Widerruf, den ein erneuter Klick aufhebt, ist keiner. Dann entsteht ein neuer Token.
2. **Abgelaufen** ist nicht dasselbe wie **widerrufen** — der Grund erscheint im Text, den der Sachverständige liest. „Der Link ist abgelaufen" lädt zum Nachfragen ein, „zurückgezogen" nicht.
3. **Unbekannter Token** → dieselbe Antwort wie ein ungültiger, ohne Unterscheidung (kein Orakel zum Erraten).
4. **Widerruf setzt nur `widerrufen_am`** und löscht nichts — die Aufrufzählung bleibt als Spur erhalten.

- [ ] **Schritt 1–5:** Test → rot → bauen → grün → festschreiben

---

### Aufgabe 2: Route `/plan/[token]`

**Dateien:** `sv-levelup/app/plan/[token]/{page.tsx,PlanClient.tsx}`

**Aufbau der Seite:**
- Kopf: Firmenname, Ort, Erhebungsdatum, Gültigkeit („Dieser Plan ist bis zum … abrufbar")
- Ergebnis: Score bzw. Teilbefund-Begründung
- Je Modul: Befunde mit Wert, Einordnung, **Quelle und Datum**; Fehlstellen ausdrücklich
- Maßnahmenplan in drei Phasen
- Fuß: ein Satz, wie er Kontakt aufnimmt

**Druckansicht.** Der Plan wird ausgedruckt oder dem Webbetreuer gezeigt. Eine `@media print`-Regel entfernt Hintergrundfarben und Navigations-Elemente. Ohne sie druckt eine dunkle Seite als schwarzer Block.

⚠ **`dynamic = 'force-dynamic'`** — der Aufrufzähler und der Widerruf müssen sofort greifen. Ein zwischengespeicherter Plan bliebe nach dem Widerruf abrufbar.

- [ ] **Schritt 1: Ungültige Fälle zuerst bauen** (unbekannt/abgelaufen/widerrufen) und ansehen, bevor der Erfolgsfall steht — sie sind der Teil, den man sonst nie sieht
- [ ] **Schritt 2–6:** Erfolgsfall, Druckansicht, prüfen, festschreiben

---

### Aufgabe 3: Freigabe aus der Auswertung

**Dateien:** `sv-levelup/app/auswertung/[token]/{actions.ts,AuswertungClient.tsx}`

Im Maßnahmenplan-Reiter ein Abschnitt „Plan freigeben":
- noch kein Link → Knopf „Plan freigeben"; danach erscheint die vollständige Adresse zum Kopieren
- Link vorhanden → Adresse, Gültigkeit, Zahl der Aufrufe, Knopf „Zurückziehen"
- widerrufen/abgelaufen → Hinweis samt Knopf „Neu freigeben"

⚠ Beide Server-Actions prüfen **selbst** auf Staff — eine Action ist ein öffentlicher Endpunkt.

⚠ Die Aufrufzahl ist die einzige Rückmeldung, ob der Plan überhaupt angesehen wurde. Sie gehört sichtbar dorthin, nicht in ein Protokoll.

- [ ] **Schritt 1–6** wie gehabt.

---

### Aufgabe 4: Durchlauf

- [ ] **Schritt 1:** Bauen, Standalone starten (Port vorher räumen)
- [ ] **Schritt 2:** `/plan/erfundener-token` → sauberer Hinweis, kein Absturz, **keine Maßnahmen im Text**
- [ ] **Schritt 3:** In der Auswertung freigeben, Adresse kopieren, in einem **frischen Kontext ohne Anmeldung** öffnen — der Plan muss dort erscheinen
- [ ] **Schritt 4:** Prüfen, dass **kein** Leitfaden-Inhalt durchscheint: „Einwand", „Minutenplan", „Wahrscheinlicher", „beanspruchen" dürfen im Antwortkörper nicht vorkommen
- [ ] **Schritt 5:** Zurückziehen, Link erneut öffnen → muss ablehnen
- [ ] **Schritt 6:** Aufrufzähler in der Auswertung prüfen
- [ ] **Schritt 7:** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

---

## Selbstprüfung des Plans

**Deckung:** Die Abgrenzung aus Spec §5.3 vollständig, inklusive Gültigkeit und Widerruf, die die Tabelle schon vorsieht.

**Platzhalter:** keine; die Schritte folgen dem Muster aus P3–P5.

**Typen:** `pruefePlanlink` liefert ein Ergebnis-Objekt wie die übrigen Bibliotheksfunktionen; die Ansicht nutzt `Befund` und `Massnahme` unverändert.

**Was dieser Plan bewusst NICHT tut:** ein PDF erzeugen. Der Leitfaden sagt „als PDF" — eine Webseite mit sauberer Druckansicht erfüllt denselben Zweck, ist sofort aktuell und kostet keine zusätzliche Abhängigkeit. Der Satz im Leitfaden wird entsprechend auf „den Plan" geändert, damit kein Versprechen offenbleibt, das die Seite nicht hält.
