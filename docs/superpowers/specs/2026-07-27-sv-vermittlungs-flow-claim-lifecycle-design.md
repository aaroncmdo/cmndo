# Spec 3: SV-Vermittlungs-Flow („Partner-Werkstatt vermitteln") + Claim-Lifecycle

**Datum:** 2026-07-27
**Status:** Spec (brainstormed) — Teil des Netzwerk-Ökosystem-Epics
**Branch:** `kitta/netzwerk-verbindungen-freundschaft` (Basis `origin/staging`)
**Verwandt:** Epic-Overview `2026-07-27`, Spec 1 (Netzwerk-Verbindungen), Spec 2 (Freemium)
**Leitprinzip:** bestehende Infra integrieren; nur echt Neues neu bauen.

---

## 1 · Ziel

Der Gutachter startet in seinem Portal (View **„Aufträge"**) einen **eigenen Vorgang**: er lädt ein **fertiges Gutachten** hoch → daraus entsteht **sofort ein Claim** (in datengetriebener Phase) → er sendet ihn seinem Kunden zum Onboarden → der Kunde wählt **selbst** im **netzwerk-gescopten Werkstatt-Finder** (Sektion „Dein Netzwerk", Spec 1) → die Werkstatt terminiert die Reparatur. Der SV bindet den Kunden an sein Netzwerk (Sticky First-Touch); **keine** Vorauswahl/Empfehlung mehr.

Dies ist der konkrete End-to-End-Fall, der Netzwerk (Spec 1) + Freemium (Spec 2) operativ greifbar macht.

---

## 2 · Claim-Lebenszyklus (Ground Truth, verifiziert)

`claims.operative_status` = **Text + CHECK, 33 Werte**, eine Achse (`work_state`/`claims.phase` eliminiert; `sub_phase` derive-at-read via `v_claim_phase`). Tracks:

- **Erfassung:** `ersterfassung → onboarding`
- **SV/Begutachtung:** `sv-gesucht → sv-zugewiesen → sv-termin → besichtigung → begutachtung-laeuft → gutachten-eingegangen`
- **QC/Regulierung:** `filmcheck → qc-pruefung → kanzlei-uebergeben → anschlussschreiben → regulierung → regulierung-laeuft → … → zahlung-eingegangen → reguliert_vollstaendig`
- **Reparatur (Sub-Track, eigener Cursor `src/lib/faelle/reparatur-cursor.ts`):** `reparatur-werkstatt-suche → reparatur-angefragt → reparatur-laeuft → reparatur-erledigt`
- **Terminal:** `abgeschlossen / storniert / abgelehnt(_final) / vs-abgelehnt / klage(_rechtsstreit) / verjaehrt / …`

**Neben-Achsen:** `reparatur_vermittlung_status` (offen/eigene/vermittelt/abgelehnt), `reparatur_auftrag_modus` (kva_erst/direkt), `reparatur_werkstatt_quelle` (dispatcher/kunde/embed/**gutachter**/kb/qr_referral), `reparaturwunsch` (reparatur/fiktiv/unentschieden), `freie_werkstattwahl`. **Phasen-Vollständigkeit:** `dokumente_vollstaendig_fuer_phase`. **Override:** `phase_override`.
**Abrechnungsweg:** `haftpflicht | kasko | selbstzahler` (Haftpflicht = voll mit SV/Regulierung; kasko/selbstzahler = Reduced-Repair).

**Initial-State heute** (`convert-lead-to-claim.ts:441`): `svIdFromTermin ? 'sv-termin' : 'ersterfassung'`.

---

## 3 · Flow-Schritte (Reuse → Net-new)

| # | Schritt | Reuse | Net-new |
|---|---|---|---|
| 1 | „Partner-Werkstatt vermitteln"-CTA in `/gutachter/auftraege` | View + `SvTopBar`/`GutachterShell` | **CTA + Vermittlungs-Entry** |
| 2 | Gutachten-Upload → **Sofort-Claim** | `createLead`→`convertLeadToClaim`, `uploadGutachten`, `createPflichtdokumenteFromKatalog` | **SV-Selbstanlage** + **datengetriebener Initial-State** (`gutachten-eingegangen`) |
| 3 | An Kunde senden → Onboarden+SA | `issueCanonicalFlowLinkForAnfrage` → `/flow/[token]` → `signSAandCreateFall` | **FlowLink auf bestehenden Claim** (SA *updated* statt konvertiert) |
| 4 | Kunde wählt Werkstatt (Netzwerk-Finder) | „Dein Netzwerk"-Sektion (Spec 1) + `assignReparaturWerkstatt({quelle:'gutachter'})` | — (Empfehl-Batch entfällt) |
| 5 | Werkstatt terminiert | `reparatur_termine` + `schlageWerkstattTerminVor` | — |
| 6 | Kunde→SV-Netzwerk-Bindung | Spec 1 `netzwerk_owner_id` | **Seeding = hier** (SV=Owner) |

---

## 4 · Der Sofort-Claim — Lifecycle-Einstieg (Kern-Entscheidung)

**Entscheidung (Aaron):** beim Gutachten-Upload entsteht **sofort ein echter Claim**, datengetrieben.

- **Initial-State:** `operative_status = 'gutachten-eingegangen'` (Gutachten liegt vor → überspringt sv-termin/besichtigung/begutachtung), `onboarding_complete=false`, `sa_unterschrieben=false`.
- **Umsetzung (kanonisch, kein Parallel-Creator):** intern `createLead` (Träger der Gutachten-/Kundendaten) → sofort `convertLeadToClaim` mit **erweitertem** Initial-State-Zweig. Der Datengetrieben-Zweig ergänzt `convert-lead-to-claim.ts:441`: *liegt ein Gutachten vor → `gutachten-eingegangen`*. SV wird `sv_id`.
- **Onboarden-in-Claim (net-new):** der FlowLink zeigt auf den **bestehenden** Claim; die SA-Signatur **updated** ihn (`sa_unterschrieben=true`, `abtretung_pdf`, `onboarding_complete=true`) statt zu konvertieren (heute konvertiert `signSAandCreateFall`). Neuer Pfad „sign-into-existing-claim".

### Invariante (wichtig!)
Ein Claim in `gutachten-eingegangen` **ohne** SA/Onboarding ist eine ungewöhnliche Kombination. Deshalb:

> **Der Regulierungs-/Kanzlei-Track UND die Reparatur-Vermittlung gaten auf `sa_unterschrieben` + `onboarding_complete`.** Der *Status* spiegelt das Gutachten, die *Gates* spiegeln den Kunden. Kein Versicherer-Anschreiben, keine Werkstatt-Zuweisung vor Kunden-Bestätigung.

---

## 5 · Werkstatt-Wahl = der immer-an-Netzwerk-Finder (kein „SV wählt")

**Entscheidung (Aaron):** niemand wählt vor. Nach dem Onboarden bedient sich der **Kunde selbst** im Werkstatt-Finder seines Portals — dort steht oben immer **„Dein Netzwerk"** (die Partner-Werkstätten des bindenden SV, innerhalb normal gerankt; Spec 1 §7.4 im *einheitlichen* Modell des Epic-Overviews). Die Zuweisung feuert `assignReparaturWerkstatt({quelle:'gutachter', ...})` → `reparatur_werkstatt_id` + `reparatur_vermittlung_status='vermittelt'`.

- **Gate:** die Sektion erscheint nur, wenn der SV **zahlender Netzwerkpartner** ist (Spec 2); sonst normales Distanz-Ranking.
- **Provisions-neutral:** `reparatur_werkstatt_id` ist OUTBOUND → **keine** Provision (kanonisch; `create_werkstatt_provision` feuert nur inbound-Haftpflicht).
- **Empfehl-Batch** (`empfehleWerkstaettenAlsGutachter`, live) wird abgelöst; der Assignment-Kern bleibt.

---

## 6 · Reparatur-Phase vor Abschluss (Aarons zweiter Punkt)

Existiert bereits als Sub-Track: nach `reparatur_werkstatt_id`-Zuweisung fährt der `reparatur-cursor` `reparatur-werkstatt-suche → reparatur-angefragt` (Werkstatt schlägt Termin via `schlageWerkstattTerminVor`) `→ reparatur-laeuft → reparatur-erledigt`, **bevor** `abgeschlossen`. **Kein Neubau** — nur sicherstellen, dass der SV-Flow denselben Cursor nutzt.

---

## 7 · Owner-Auflösung & Provision

- SV ist **Netzwerk-Owner** des Kunden (Bindung `netzwerk_owner_id`, First-Touch = hier gesetzt).
- SV ist **KEIN Vermittler-Typ** (`vermittler_typ ∈ makler/werkstatt/firmen_flotte`) → **keine Provision** (korrekt; der SV zahlt fürs Netzwerk, verdient nicht am Claim).
- Beim Ranking im Kunde-Finder: Owner = der bindende SV → `resolveNetzwerkFreundKandidatIds(sv, 'werkstatt')`.

---

## 8 · Net-new (Zusammenfassung) & Phasen

**Net-new:** (1) SV-Selbstanlage-Entry, (2) datengetriebener Initial-State-Zweig, (3) „sign-into-existing-claim", (4) der „Dein Netzwerk"-Finder + Gate (Spec 1/2), (5) Vermittlungs-CTA in `/gutachter/auftraege`.
**Reuse (unverändert):** Claim-Erzeugung, FlowLink, Gutachten-Upload, Pflichtdok-Slots, Werkstatt-Zuweisungs-Kern, Reparatur-Cursor, `reparatur_termine`/Werkstatt-Termin.

**Phasen:** P1 Sofort-Claim + datengetriebener State + sign-into-claim · P2 Vermittlungs-CTA + SV-Selbstanlage · P3 Netzwerk-Finder-Sektion (hängt an Spec 1/2). Abhängigkeit: Schritt 4 braucht Spec 1 (Graph+Sektion) + Spec 2 (Gate).

---

## 9 · Offene Verifikationen (für den Plan)

- Genaue `signSAandCreateFall`-Kette + wie „sign-into-existing-claim" sauber abzweigt, ohne den bestehenden Konvertier-Pfad zu brechen.
- `createPflichtdokumenteFromKatalog`-Szenario für den SV-Upload-Fall (Gutachten liegt vor → welche Slots?).
- `dokumente_vollstaendig_fuer_phase`-Mechanik: setzt der Sofort-Claim sie datengetrieben?
- Abrechnungsweg des SV-Upload-Flows (Default `haftpflicht`? SV-Gutachten ist klassisch Haftpflicht) — bestätigen.
- `reparatur-cursor.ts` + Gate-Interaktion (startet der Cursor erst nach `onboarding_complete`?).
