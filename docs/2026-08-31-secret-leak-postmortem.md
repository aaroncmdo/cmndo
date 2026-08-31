# Postmortem: prod-Zugangsdaten im oeffentlichen Repo (31.08.2026)

> Dieses Dokument liegt in einem **oeffentlichen** Repo und enthaelt daher keine Werte —
> weder alte noch neue. Die rotierten Passwoerter liegen ausschliesslich in den
> GitHub-Secrets und lokal beim Team.

## Was passiert ist

GitGuardian meldete am 31.08.2026 ein „Company Email Password" im Repo `aaroncmdo/cmndo`
(Push-Zeitpunkt 30.08. 10:21 UTC). Die Meldung war korrekt.

Das Repo ist **public**. In **181 Dateien** standen die Passwoerter der prod-Testkonten im
Klartext — verteilt auf 96 Smoke-Scripts (`.mjs`), 44 Dokumente, 31 Code-Dateien, und als
Fallback in `.github/workflows/ci.yml` (`?? '<passwort>'`).

## Der Beweis, der die Dringlichkeit bestimmte

Entscheidend war nicht „ein Passwort steht im Repo", sondern die Messung **vor** jeder
Aenderung, gegen die produktive Auth-API:

| Konto | Passwort aus dem Repo | Ergebnis |
|---|---|---|
| `test-dispatch@claimondo.de` | ja | **HTTP 200 — Login erfolgreich** |
| `test-admin@claimondo.de` (Rolle **admin**) | ja | **HTTP 200 — Login erfolgreich** |
| `test-admin@claimondo.de` | falsches Passwort | HTTP 400 — abgewiesen |

Die dritte Zeile ist die wichtigste: sie belegt, dass der Test zwischen richtig und falsch
unterscheidet. Ohne sie waere „HTTP 200" kein Beleg gewesen, sondern nur eine Beobachtung.

**Jeder mit Internetzugang konnte sich als Admin auf der Produktivumgebung anmelden.**

## Was sofort getan wurde

1. **9 Testkonten rotiert** ueber die Supabase-Admin-API (nicht per direktem
   `auth.users`-SQL — so ist das bcrypt-Format garantiert korrekt).
   Nachweis: alte Passwoerter **14 von 14 Versuchen abgewiesen**, alle 9 Konten mit den
   neuen Werten weiter nutzbar.
2. **GitHub-Secrets nachgezogen.** Die Infrastruktur existierte bereits
   (`TEST_*_PASSWORD`, `SV_PASS`); die Klartext-Werte im Code waren nur Fallbacks.
   Deshalb lief CI ohne Unterbrechung weiter.
3. **Sessions invalidiert** — 9 Refresh-Tokens widerrufen, 9 Sessions geloescht.
   ⚠ Wichtig: **eine Passwort-Aenderung invalidiert bei Supabase NICHT automatisch
   bestehende Sessions.** Ohne diesen Schritt haette ein bereits eingeloggter Zugriff
   weiterbestanden.
4. **Alle Klartext-Passwoerter aus dem Repo entfernt** (181 Dateien, 294 Ersetzungen).
   Code liest jetzt aus `process.env` ohne Klartext-Fallback; Dokumente verweisen auf das
   zustaendige GitHub-Secret.
5. **Secret-Gate in CI** (`npm run check:secrets`, Baseline 0) gegen Wiederholung.

## Was NICHT betroffen war

Geprueft wurden Arbeitsbaum **und die gesamte Git-History**: keine API-Keys, keine
Stripe-Live-Keys, keine AWS-Keys, keine Private Keys. Die `.env.example`-Dateien tragen
leere Werte. Der einzige Treffer auf ein Service-Role-Muster war eine Doku-Zeile mit
abgekuerztem Beispiel.

## 🔴 Offen

* **Zwei echte Mitarbeiter-Konten** standen ebenfalls mit Passwort im Repo. Sie wurden
  bewusst **nicht** automatisch rotiert (das haette die Personen ausgesperrt) — sie sind
  manuell zu aendern, die Betroffenen zu informieren.
* **Das Repo ist weiterhin public.** Eine Umstellung auf privat wurde geprueft und
  **verworfen**: im Free-Plan sind Actions fuer private Repos auf 2.000 Minuten/Monat
  begrenzt, gemessen wurden ~3.700 Workflow-Runs im August (grob 18.000 Minuten). Alle 23
  Workflows laufen auf `ubuntu-latest`; die 6 registrierten self-hosted Runner werden nicht
  genutzt. Erst deren Umstellung macht „privat" ohne Pipeline-Ausfall moeglich.
* **Ob der Zugang ausgenutzt wurde, ist nicht feststellbar:** `auth.audit_log_entries` ist
  leer. Es gibt keine Login-Historie mit IP-Adressen.
* Wegen des offengestandenen Admin-Zugangs zu Produktivdaten ist eine Meldepflicht nach
  Art. 33 DSGVO zu pruefen (Frist ab Kenntnis, 31.08.2026).

## Lehren

**Vor dem Fix messen, ob der Angriff funktioniert.** „Ein Passwort steht im Repo" und
„dieses Passwort oeffnet die Produktivumgebung" sind zwei verschiedene Aussagen. Nur die
zweite rechtfertigt einen sofortigen Eingriff — und nur die erste war ohne Messung belegt.

**Ein leeres Abfrageergebnis ist kein Freispruch.** Die Frage „gab es verdaechtige Logins?"
lieferte zunaechst „keine" — weil die Audit-Tabelle komplett leer ist, nicht weil nichts
passiert ist. Ein Instrument muss erst zeigen, dass es ueberhaupt anschlaegt.

**Rotation ohne Session-Invalidierung ist halb.** Siehe Schritt 3.

**Ein Gate muss sich selbst finden koennen.** Beim Bau des Secret-Gates war kurzzeitig ein
literales Null-Byte im Quelltext — dadurch stufte das Gate seine eigene Datei als binaer ein
und uebersprang sie. Aufgefallen ist das nur, weil die Positivkontrolle zeigte, dass ein
absichtlich gesetzter Treffer im Skript selbst nicht gemeldet wurde.
