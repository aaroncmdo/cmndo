# Abnahme-Inbox: Kunden-Mails im Prod-Smoke nachweisen

**Entscheidung Aaron, 05.09.2026.** Ein Postfach `abnahme@claimondo.de` im Google Workspace empfängt die Mails, die Smokes und Abnahmen auslösen. Damit wird die letzte Lücke im Regel-4-Nachweis geschlossen: Bis dahin war keine einzige Kunden-Mail belegbar.

## Warum es das braucht

Die Send-Isolation (`src/lib/testdaten/interne-identitaet.ts`) unterdrückt jede Mail an interne oder Test-Adressen (`@claimondo.de`, `@claimondo.test`, `example.*`, Marker `test`/`smoke`/`e2e`) **vor** dem Eintrag in `email_log`. Für Test-Leads gab es deshalb keine beobachtbare Spur: kein Posteingang, kein Log. Die Abnahme der Kasko-Werkstattbindung (05.09.) musste die Bindungs-Mail (E6) als „verdrahtet, nicht gelaufen" ausweisen, und ob eine Mail **nicht** doppelt geht, ließ sich gar nicht messen.

Der prozessweite Schalter `SIDE_EFFECT_MODE=test-recipient` hilft auf prod nicht: Er leitet **alle** Mails um, auch die echter Kunden.

## Was gilt

* **Zustellbar, aber intern.** `abnahme@claimondo.de` und jede Plus-Adresse `abnahme+<tag>@claimondo.de` werden zugestellt (`istAbnahmeInbox` in `nurZustellbareEmpfaenger`). Für die Lead-Identität bleibt die Adresse intern: Der Matching-Guard behandelt den Lead als Test, kein echter Sachverständiger wird gebucht oder benachrichtigt.
* **Ein Postfach, viele Läufe.** Google liefert `abnahme+e6-kasko-1725000000@` in dasselbe Postfach. Der Tag identifiziert den Lauf; Specs suchen nach genau dieser Adresse.
* **Nur dieses eine Postfach.** Keine weiteren `@claimondo.de`-Adressen freischalten. Wer eine zweite Test-Inbox braucht, erweitert `istAbnahmeInbox` bewusst und dokumentiert es hier.
* **Zugangsdaten nie ins Repo.** Das Repo ist öffentlich. `ABNAHME_INBOX_USER` und `ABNAHME_INBOX_PASS` stehen nur in `.env.local` und in den GitHub-Secrets.

## Einrichtung (einmalig, Aaron)

1. Im Google Workspace das Postfach `abnahme@claimondo.de` anlegen (eigener Nutzer, nicht nur Alias: IMAP braucht ein Login).
2. Für diesen Nutzer die Bestätigung in zwei Schritten aktivieren, dann unter „Sicherheit → App-Passwörter" ein App-Passwort für „Mail" erzeugen (16 Zeichen).
3. In Gmail-Einstellungen des Postfachs IMAP aktivieren (Workspace-Standard ist an).
4. Lokal in `.env.local` eintragen (nicht committen):

   ```
   ABNAHME_INBOX_USER=abnahme@claimondo.de
   ABNAHME_INBOX_PASS=<App-Passwort>
   ```

5. Für den nächtlichen e2e-Job als Secrets setzen:

   ```
   gh secret set ABNAHME_INBOX_USER --body "abnahme@claimondo.de"
   gh secret set ABNAHME_INBOX_PASS --body "<App-Passwort>"
   ```

6. Gegenprobe: `PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/kasko-e6-mail-abnahme-inbox.spec.ts` muss `1 passed` melden, nicht `skipped`.

## Verwendung in Specs

```ts
import { abnahmeAdresse, abnahmeInboxKonfiguriert, warteAufMail, zaehleMails } from '../lib/abnahme-inbox'

test.skip(!abnahmeInboxKonfiguriert(), 'ABNAHME_INBOX_* nicht gesetzt')

const email = abnahmeAdresse(`mein-lauf-${Date.now()}`)     // abnahme+mein-lauf-…@claimondo.de
const seit = new Date(Date.now() - 2 * 60_000)
// … Lead mit dieser Email seeden, UI fahren …
const mail = await warteAufMail({ an: email, betreffEnthaelt: 'Werkstattbindung', seit, timeoutMs: 180_000 })
expect(mail.html).toContain('So geht es weiter')
expect(await zaehleMails({ an: email, betreffEnthaelt: 'Werkstattbindung', seit })).toBe(1)
```

* `warteAufMail` pollt (Standard alle 10 s bis 120 s) und **wirft** ohne Treffer: Eine fehlende Mail ist ein Befund, kein Skip.
* `zaehleMails` ist für Nicht-Ereignisse („keine zweite Mail"). Die Positivkontrolle ist der vorherige Treffer mit demselben Werkzeug; ohne sie ist eine Null kein Befund (Regel 4, Messfalle 5).
* Ausgangszustand seeden über `tests/e2e/lib/seed-lead-flowlink.ts`, aufräumen in `test.afterEach` mit `loescheLeadMitAnhang(db, leadId, email)`. Das löscht auch die `email_log`-Zeilen des Laufs.
* Referenz-Spec: `tests/e2e/flows/kasko-e6-mail-abnahme-inbox.spec.ts`.

## Grenzen

* IMAP `SINCE` ist tagesgenau; der Feinfilter läuft über das Datum der Mail. Für Läufe über Mitternacht `seit` großzügig wählen.
* Die Inbox beweist Zustellung und Inhalt bei Google. Ob ein Kunde mit anderem Provider die Mail bekommt, beweist sie nicht.
* Bewusst kein automatisches Löschen im Postfach: Gmail hält 15 GB, der Verlauf ist als Beleg nützlich. Ab etwa 5.000 Mails sollte ein Filter alte Läufe archivieren.
