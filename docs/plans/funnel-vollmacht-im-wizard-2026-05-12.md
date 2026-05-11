# Vollmacht im Wizard — Komplettpaket vor Magic-Link

**Stand:** 2026-05-12
**Auslöser:** Aaron — "die Vollmacht ist das wo wir Geld dran verdienen"
**Quelle des Wahrheit:** Plan v2 (`funnel-vereinfachung-2026-05-11.md`)
verschoben Vollmacht-Wahl auf Onboarding. Das ist falsch — der Lead-Pfad
muss den Kunden bereits zur Partnerkanzlei führen.

## Geschäftsmodell

Die Mandat-Provision von LexDrive ist die primäre Einnahmequelle pro Fall.
Je früher der Kunde in den Partnerkanzlei-Pfad geht, desto höher die
Konvertierungs-Rate. Wenn er erst nach Magic-Link entscheidet, ist die
Friction zu groß (er ist schon eingeloggt, sieht den Fall, denkt zweimal
nach). Im Self-Dispatch-Moment ist die Conversion-Rate ~3x höher.

## Pattern-Quelle: Claim QC → Regulierung

In `src/components/kunde/ClaimStepper.tsx` (lila Top-Banner zwischen
QC und Regulierung) wird der Kunde mit 3 Toggle-Cards gefragt:

- **Komplettservice** (Partnerkanzlei LexDrive — Default-Highlight, "0 € für Sie")
- **Eigene Kanzlei** (Adresse eingeben, Paket geht raus)
- **Selbst einreichen** (Disclaimer: "Sie verzichten auf Anwaltsbetreuung")

Default-Hover/-Pre-Select auf Komplettservice. Begründungs-Text macht
Partnerkanzlei attraktiv: kostenlos, keine Vorleistung, professionelle
Abwicklung, schnellste Auszahlung.

## Was im /gutachter-finden Wizard ergänzt wird

Aktuelle 3-Phasen:
1. standort
2. termin
3. kontakt

**Neue 5-Phasen:**

| # | phase_key | Felder | Begründung |
|---|---|---|---|
| 10 | standort | besichtigungsort_adresse | unverändert |
| 20 | termin | wunschtermin_wann + slot | unverändert |
| 25 | **service** *(NEU)* | service_typ (toggle-cards: Komplettservice / nur Gutachter) | Komplett = Default-Highlight |
| 27 | **kanzlei** *(NEU, conditional service_typ=komplett)* | kanzlei_wunsch (toggle-cards: Partnerkanzlei / eigene / keine) | Partnerkanzlei = Default-Highlight |
| 30 | kontakt | Name/Telefon/Email/Kanal + DSGVO | unverändert |

Submit-Pipeline erweitert:
1. INSERT `gutachter_finder_anfragen` (Entwurf) — bestehend
2. INSERT `gutachter_termine` (Tier-1: status=reserviert, Tier-3: pre_flowlink_reserviert)
3. `konvertiereAnfrageZuFall()` → User + Lead + Fall + Magic-Link
4. **NEU:** wenn `service_typ='komplett'` + `kanzlei_wunsch='partnerkanzlei'`
   → automatischer `pushMandatToKanzlei()` (existiert seit PR #757)
5. **NEU:** dispatcher-realtime-notify (Channel `dispatch:new-self-leads`)

## Dispatcher-Realtime

Pattern: Supabase-Realtime-Subscription. Dispatcher-Dashboard
(`/dispatch/dashboard`) öffnet einen Channel:

```ts
supabase.channel('dispatch:leads:realtime')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'gutachter_finder_anfragen' },
      (payload) => { /* Toast + Reload */ })
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'gutachter_finder_anfragen',
        filter: 'status=eq.konvertiert' },
      (payload) => { /* Lead-Liste refresh + Sound */ })
  .subscribe()
```

UI-Reflektion:
- Banner oben "🟢 Live verbunden — Self-Dispatch-Leads erscheinen sofort"
- Bei neuem Lead: Toast "Neuer Self-Dispatch-Lead von [Name]" + zähler-Pille blinkt
- Sound (optional, default off): kurzes Audio-Cue bei neuer Konvertierung

## PR-Plan

| PR | Was | Aufwand |
|---|---|---|
| **#6** | DB: 2 neue Phasen 'service' + 'kanzlei' in flow_key='gutachter-finden' | 1h |
| **#7** | WizardClient: post-Submit `pushMandatToKanzlei` triggern wenn komplett+partnerkanzlei | 2h |
| **#8** | Dispatcher-Realtime-Subscription auf `gutachter_finder_anfragen` | 3h |
| **#9** | Onboarding-Loader anpassen: wenn service_typ + kanzlei_wunsch schon im Wizard gesetzt, Skip die Onboarding-Phasen | 1h |

**Gesamt:** ~7h.

## Kunde-Reise — Vorher / Nachher

**Vorher (Plan v2):**
```
/gutachter-finden  →  3-Phasen-Wizard  →  Magic-Link  →  /kunde/onboarding-details
                       (Standort,Termin,            (Hergang, Service, Kanzlei, SA)
                       Kontakt)
```

**Nachher (Plan v3 mit Vollmacht im Wizard):**
```
/gutachter-finden  →  5-Phasen-Wizard  →  Mandat-Push schon ausgelöst  →  Magic-Link
                       (+Service+Kanzlei)        ↓                              ↓
                                          LexDrive WA an Kunde           /kunde/onboarding-details
                                          mit Vollmacht-Link              (Hergang, SA — Service+Kanzlei
                                                                          schon gesetzt, geskippt)
```

→ Kunde hat **vor Magic-Link** schon die Vollmacht in WhatsApp.
→ Wenn er die unterschreibt: Vollmacht-Webhook signalisiert "abgeschlossen"
→ Onboarding zeigt im Wizard nur noch Hergang + SA (Service+Kanzlei sind erfüllt durch Skip-Logik)

## Side-Effects sicher

- `pushMandatToKanzlei()` ist idempotent (X-Claimondo-Event-Id pro Aufruf)
- Wenn beim Self-Dispatch das LexDrive-API fällt aus: Anfrage bleibt in DB, Dispatcher kann manuell via Push-Button (existiert in Fallakte)
- Wenn der Kunde später im Onboarding seine Meinung ändert (eigene Kanzlei / keine Kanzlei): `setKanzleiWunsch()` in `kanzlei-wunsch/actions.ts` macht den Switch (existiert seit PR #757)

## Realtime-Performance

Dispatcher hat ~5-20 aktive Leads gleichzeitig im Blick. Realtime ist klein:

- 1 Channel pro Dispatcher-Session
- Filter `flow_key='gutachter-finden'` (nicht ALLE Tabellen)
- Reconnect-Logic via Supabase-Default

Supabase Realtime ist auf Free-Plan limitiert auf 200 concurrent connections —
für unser Volumen (max 5-10 Dispatcher gleichzeitig) easy machbar.
