# Design: Foto-Check nachträglich mit dem Lead verknüpfen

**Datum:** 2026-09-09 · **Auftrag:** Aaron 09.09. („zu zwei: mach bitte die Verknüpfung nachträglich") · **Soll-Blatt (Regel 6):** `memory/abnahmen/2026-09-09-foto-check-nachtraegliche-verknuepfung.md` · **Vorgeschichte:** Abnahme Foto-Check-Verknüpfung (PR #5784, Spec #5954): 72 Schätzungen / 0 verknüpft, weil der Foto-CTA auf `/check` **vor** dem Rückruf-Formular steht.

## Problem

Ein Interessent beantwortet auf `claimondo.de/check` drei Fragen und sieht das Ergebnis. Dort steht prominent „Schaden per Foto prüfen" — **vor** dem Kontaktformular. Wer klickt, wechselt zu `app.claimondo.de/embed/anspruch-pruefen`, lädt Fotos hoch und bekommt eine Schätzung. Diese Session (`anspruch_schaetzungen`) hat keinen Lead. Kommt der Interessent später zurück und hinterlässt Kontakt, entsteht ein Lead — die Schätzung bleibt verwaist und wird nach 30 Tagen vom Cron gelöscht. Der Sachverständige sieht sie nie. Prod 09.09.: 72 / 0.

Der verknüpfte Weg existiert nur auf der Erfolgsseite **nach** dem Kontakt (`?lead=`). Er ist technisch bewiesen (15/15 Zellen grün), wird aber vom Nutzerweg nicht erreicht.

## Ziel

Eine Schätzung, die **vor** dem Kontakt entsteht, hängt nach dem Kontakt am Lead — ohne dass der Interessent etwas doppelt tut, und auch dann, wenn er `/check` neu lädt und die Fragen erneut beantwortet.

## Optionen

### A — First-Party-Cookie `claimondo_check_ref` (Empfehlung)

`/check` legt beim ersten Rendern des Foto-CTA eine zufällige `ref` (UUID v4) an und speichert sie als First-Party-Cookie auf `claimondo.de` (30 Tage, `SameSite=Lax`, `Secure`, nicht `HttpOnly`, weil der Client sie setzt). Der Foto-CTA hängt `?ref=<uuid>` an die Tool-URL. Das Tool speichert `ref` an der Session (`anspruch_schaetzungen.check_ref`). Beim Kontakt liest die Server-Action `submitCheckLead` das Cookie serverseitig (`cookies()`, dasselbe Muster wie `getConsentedOppref` — nur ohne Consent-Gate, weil das Cookie funktional ist) und hängt nach der Lead-Anlage **alle unverknüpften** Sessions mit dieser `ref` an den Lead.

* **Für:** überlebt Reload, Browser-Back und Tage; folgt dem Repo-Muster (`__oppref`); erweiterbar auf andere Kontaktwege auf `claimondo.de` (`public-rueckruf`, Mini-Wizard) mit je einer Zeile — nicht Teil dieses PR.
* **Gegen:** ein weiteres Cookie; muss in der Datenschutzerklärung stehen. Es ist technisch erforderlich für den vom Nutzer gewünschten Dienst (§ 25 Abs. 2 Nr. 2 TDDDG), also ohne Einwilligung zulässig — Nennung trotzdem Pflicht.

### B — `localStorage` + verstecktes Formularfeld

Gleiche `ref`, aber im `localStorage` von `claimondo.de` und als `<input type="hidden" name="check_ref">` im Kontaktformular.

* **Für:** kein Cookie.
* **Gegen:** rechtlich gleichgestellt (§ 25 TDDDG erfasst jeden Speicherzugriff); nur `/check` profitiert, jedes weitere Formular braucht eigene Verdrahtung; kein serverseitiger Zugriff ohne Client-Code.

### C — Rückweg aus dem Tool (`?schaetzung=` zurück nach `/check`)

Das Tool bietet „zurück zur Prüfung" mit dem Session-Token; `/check` merkt sich ihn.

* **Gegen:** deckt Browser-Back und späteren Re-Visit nicht; verlangt eine zusätzliche Nutzerhandlung. Verworfen.

**Entscheidung:** A. (Annahme A1: Aaron hat der Sache zugestimmt, nicht der Mechanik — die Mechanik ist Umsetzung, ein anderes Cookie-Urteil von ihm dreht sie auf B mit geringem Aufwand.)

## Architektur

```
claimondo.de/check                                app.claimondo.de/embed/anspruch-pruefen
┌───────────────────────────┐                     ┌───────────────────────────────┐
│ CheckFunnelClient         │  ?schuld=&ref=<uuid>│ AnspruchWizard                │
│  ├ AnspruchFotoCheckCta ──┼────────────────────▶│  └ starteAnspruchSession(     │
│  │   getOrCreateCheckRef()│                     │        lead?, ref?)            │
│  │   (Cookie claimondo_   │                     │      └ erstelleSession →      │
│  │    check_ref, 30 d)    │                     │        INSERT anspruch_        │
│  └ Kontaktformular        │                     │        schaetzungen(check_ref) │
│      └ submitCheckLead ───┼──┐                  └───────────────────────────────┘
└───────────────────────────┘  │  cookies().get('claimondo_check_ref')
                               ▼
        anfragen → convert_anfrage_zu_lead → leadId
        → UPDATE anspruch_schaetzungen SET lead_id = leadId
             WHERE check_ref = ref AND lead_id IS NULL   (Service-Client, non-fatal, Anzahl geloggt)
```

## Komponenten

| Einheit | Ort | Aufgabe | Abhängigkeit |
|---|---|---|---|
| `getOrCreateCheckRef()` | `claimondo-marketing/lib/check/check-ref.ts` (Client) | Cookie lesen; fehlt es, UUID v4 erzeugen und setzen (30 Tage) | `crypto.randomUUID` |
| `leseCheckRef()` | `claimondo-marketing/lib/check/check-ref-server.ts` (Server) | `cookies().get(...)`, UUID-validiert, sonst `null` | `next/headers` |
| `AnspruchFotoCheckCta` | bestehend | `extra.ref = getOrCreateCheckRef()` (nur im Browser) | `buildFotoCheckUrl` (unverändert, `extra` reicht durch) |
| `submitCheckLead` | bestehend | nach `leadId`: `verknuepfeSessionsMitLead(sb, ref, leadId)` | Service-Client |
| `verknuepfeSessionsMitLead` | `claimondo-marketing/lib/check/verknuepfe-sessions.ts` | UPDATE mit `.select('id')`, Fehler loggen, Anzahl zurückgeben | supabase-js |
| `starteAnspruchSession(lead?, ref?)` / `erstelleSession(lead?, ref?)` | `src/app/embed/anspruch-pruefen/actions.ts`, `src/lib/anspruch/session.ts` | `check_ref` validieren (UUID) und mit einfügen | — |
| `AnspruchWizard` | bestehend | liest `?ref=` wie `?lead=` | — |
| Migration | `supabase/migrations/<V>_anspruch_schaetzungen_check_ref.sql` | `add column check_ref uuid` + partieller Index | MCP `apply_migration`, Types regenerieren |
| Datenschutz | `claimondo-marketing/app/[locale]/datenschutz/page.tsx` | Cookie `claimondo_check_ref` als technisch notwendig nennen | — |

## Datenfluss und Grenzfälle

* **Reload des Tools:** mehrere Sessions mit derselben `ref` → alle werden verknüpft; der SV-Leser nimmt die mit Positionen (bestehend).
* **Kontakt ohne vorherigen Foto-Check:** `ref` existiert evtl., 0 Sessions → 0 Updates, kein Fehler.
* **Foto-Check nach dem Kontakt** (Erfolgs-CTA mit `?lead=`): Session ist bereits verknüpft; `lead_id IS NULL` schützt vor Überschreiben.
* **Zweiter Kontakt mit derselben `ref`** (Tage später, anderer Lead): nur noch unverknüpfte Sessions wandern zum neuen Lead — die alten bleiben beim alten. Bewusst.
* **`ref` ungültig/fremd:** UUID-Regex verwirft; unbekannte `ref` trifft keine Zeile. Vertrauensmodell wie `?lead=`: nicht erratbare UUID, nur der eigene Browser kennt sie.
* **Cron:** löscht weiterhin nur `lead_id IS NULL` älter als 30 Tage; das Cookie lebt 30 Tage — danach ist die Session ohnehin weg.
* **Consent-Opt-out:** funktionales Cookie, unabhängig von Marketing-/Statistik-Consent. Kein Tracking, keine PII.
* **Deploy-Reihenfolge:** Migration zuerst (additiv, nullable — alter Code läuft weiter). Marketing und App deployen unabhängig: fehlt eine Seite, passiert nichts, es bricht nichts.

## Fehlerbehandlung

* Verknüpfung ist **non-fatal** (wie FlowLink-Versand in derselben Action): ein DB-Fehler wird geloggt (`console.error('[check] Verknuepfung: …')`), der Lead ist bereits da.
* `.select('id')` am UPDATE, damit „0 Zeilen" von „Fehler" unterscheidbar ist (Stille-Write-Lehre); `anspruch_schaetzungen` steht nicht in `KRITISCHE_TABELLEN`, die Prüfung passiert trotzdem.

## Tests

* Unit: `check-ref.test.ts` (UUID-Validierung, Cookie-Parsing, Idempotenz), `verknuepfe-sessions.test.ts` (Mock-Client: Filter `check_ref` + `lead_id is null`, Rückgabe Anzahl, Fehlerpfad).
* Unit App: `session.test.ts` — `normalisiereCheckRef` (gültig/ungültig/leer).
* Playwright (Regel 4, prod nach Deploy) — neue Zelle **K2b** in `tests/e2e/flows/anspruch-lead-verknuepfung-prod.spec.ts`: `/check` → Ergebnis-CTA **vor** dem Kontakt → Tool → Foto → zurück zu `/check` (neuer Aufruf) → Fragen erneut → Kontakt absenden (Test-Lead auf Aarons Nummer, Go vom 09.09.) → DB: Session `lead_id = neuer Lead`. Dazu: Cookie im Browser vorhanden, `?ref=` im CTA-href.

## Nicht in diesem PR (bewusst)

Anschluss von `public-rueckruf` und Mini-Wizard an dieselbe `ref` (je eine Zeile, eigener PR nach Aarons Blick auf das Cookie); Anzeige „Ihre Foto-Schätzung liegt vor" auf `/check` beim Re-Visit; Kunde-Portal-Sicht der Vorschätzung (offene Soll-Frage 3 der Abnahme).
