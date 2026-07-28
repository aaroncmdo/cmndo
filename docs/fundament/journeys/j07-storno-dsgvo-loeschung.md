# J7 — Storno / DSGVO-Löschung

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Zwei getrennte Ausstiege: **Storno** (Fall beenden, Daten bleiben) vs. **DSGVO-Löschung** (Daten entfernen).
> Kern verifiziert: `stornoFall`/`adminStornoFall` (`lib/actions/storno-actions.ts`), `markClaimAsStorniert`
> (`endzustand-actions.ts`), `stelleLoeschAntrag`→`bestaetigeLoeschAntrag`→`fuehreLoeschungAus` (`dsgvo-loeschung.ts`).

**Rollen:** Kunde (storniert / beantragt Löschung) · KB/Admin (Admin-Storno, Löschung ausführen) · SV/Werkstatt/Kanzlei (werden über Storno informiert) · System.
**Vorbedingungen:** ein Fall/Account existiert.
**Startpunkt(e):** Kunde-Portal „Fall stornieren" · Kunde-Portal „Daten löschen" (DSGVO) · Admin-Storno.

## Ablauf (Soll)

**Storno** und **Löschung** sind bewusst verschieden: Storno beendet die Bearbeitung (der Fall bleibt als
`storniert` erhalten — Nachweis, Buchhaltung); die DSGVO-Löschung entfernt personenbezogene Daten (Recht auf Vergessen).

### A · Storno
1. **Storno auslösen** — Kunde (`stornoFall`) oder Admin (`adminStornoFall`), mit **Grund**. **Status:** → `storniert` (`markClaimAsStorniert`, terminal). **Notif:** beteiligte Partner (SV/Kanzlei) „Auftrag storniert" (`emailSvAuftragStorniert`/`emailKanzleiAuftragStorniert`).
2. **Nachwirkungen** — offene Termine/Tasks werden geschlossen; laufende Provisionen storniert (`storniereProvision`, `erstelleStornoGutschrift`); Embed-Billing ggf. rückabgewickelt (`stornoEmbedBilling`). **Screen:** Fall zeigt „storniert" + Grund.

### B · DSGVO-Löschung (2-Schritt-Prinzip)
3. **Antrag** — Kunde stellt Löschantrag (`stelleLoeschAntrag`, optional Grund) → Auftrag im Status „beantragt". **Screen:** „Löschung beantragt, in Prüfung".
4. **Bestätigung** — Prüfung (`bestaetigeLoeschAntrag`) — Fristen/gesetzliche Aufbewahrung geprüft (kein Löschen laufender Regulierung/Buchhaltung).
5. **Ausführung** — `fuehreLoeschungAus`: personenbezogene Daten entfernt/anonymisiert; der Kunde erhält Bestätigung. **Rücknahme** vor Ausführung möglich (`storniereLoeschAntrag`).

## Varianten / Abzweige

- **Flotten-Storno** — `storniereFahrzeugSchaden`/`storniereSchadenEntwurf`/`storniereFlottenSchadenLead` (Firmen-Kontext, → J-Flotte).
- **Entwurf-Storno** — ein noch nicht konvertierter Lead/Entwurf wird verworfen (kein Partner-Notify nötig).
- **Löschung mit gesetzlicher Sperre** — Aufbewahrungspflicht → Sperrung statt Löschung (Daten unzugänglich, nicht entfernt).

## Fehlerfälle und ihr Soll-Verhalten

- **Storno-Write scheitert still** (RLS-UPDATE fehlt) → **darf nicht vorkommen**: der Write muss `.select()`+Row-Check machen und bei 0 Rows einen echten Fehler liefern (Lehre #4625 — vier Portale meldeten „storniert", die DB war unverändert).
- **Doppel-Storno** → idempotent (schon `storniert` → ok, kein zweites Partner-Notify).
- **Löschung trotz laufender Regulierung** → geblockt in Schritt 4; der Kunde bekommt eine Begründung, keinen stillen Nicht-Effekt.

## ⚠ IST weicht ab (mit Fundort)

1. **Silent-Storno-Klasse (#4625, gefixt):** vier Portale werteten ein RLS-verworfenes `UPDATE` als Erfolg (fehlende RLS-UPDATE-Policy, kein Row-Check). Fix + Lehre: RLS-Writes brauchen `.select()`+Row-Verifikation.
2. **`success`- statt `ok`-Shape:** `stornoFall` liefert `{ success, typ, error? }` (Alt-Shape) — neue Server-Actions nutzen `{ ok, error? }` (AGENTS §Server-Actions). Boy-Scout-Kandidat.
3. **Storno-Achse vs. Endzustand:** `markClaimAsStorniert` ist in der `endzustand-actions.ts`-Allowlist (Direkt-Writer) — bewusste Cursor-Ausnahme, aber die Trennung Storno/DSGVO/Endzustand ist über mehrere Files verteilt.

## Offene Fragen an Aaron (max. 5)

1. **Storno-Frist:** Bis zu welchem Status ist ein Kunden-Storno erlaubt (vor SV-Termin? vor Regulierung? nie nach Kanzlei-Übergabe)?
2. **Löschung vs. Aufbewahrung:** Welche Daten unterliegen einer gesetzlichen Aufbewahrungsfrist (→ Sperrung statt Löschung) und wie lange?
3. **Partner-Storno-Rechte:** Darf ein SV/Werkstatt selbst stornieren, oder nur Kunde/Admin?
