# C4 · Ist-Erhebung + Tranchenplan — Eine Akte (rollen-parametrisierter Kern)

> Fundament Phase C, Paket **C4** (FUNDAMENT §5, Verfassung §4 „Eine Akte, viele Sichten"). **Ist-Erhebung +
> Kern-Design + Tranchenplan — noch NICHT der bite-sized `writing-plans`-Plan.** Der volle Plan + die Ausführung
> folgen, sobald das Oracle steht (**B1** J1+J4-Smokes). Erhebung gegen `origin/staging` (file:line), Stand 29.07.
>
> **Gating:** C4-**Code** (Portal-Migration) ist per §2-Deps auf **B1** gegated (DoD verlangt grüne Rollen-Journey-
> Smokes). Diese Erhebung + der Tranchen-Entwurf sind **ungate-t** (Ist-Bestand ist empirisch). Sie readyen C4a.

## 1 · Ist-Befund — DREI Paradigmen für dieselbe Akte

Fünf Rollen sehen denselben Claim über **fünf getrennte Detail-Implementierungen** in **drei** unterschiedlichen
Bau-Paradigmen — genau die Fragmentierung, die Verfassung §4 auflöst:

| Rolle | Route | Paradigma / Kern-Komponente |
|---|---|---|
| **Kunde** | `/kunde/faelle/[id]` | **Zonen** — `KundeClaimView` + `deriveKundeZonen`: `StatusZone` · `AufgabenZone` · `TeamZone` · `GeldZone` · `DoksTermineZone` (+ `BelegePaketCard`/`RegulierungsVerlaufCard`) |
| **Admin / Dispatch** | `/faelle/[id]` (shared, rollen-adaptiv) | **Tabs** — `_tabs/` (`Uebersicht`/`Prozess`/`Dokumente`/`Kommunikation`/`Timeline`) + `_sidebar/` (`FallSidebar`/`QuickActions`/`EskalationCard`/`FallRueckrufSection`) + `_stammdaten/` |
| **Kanzlei** | `/faelle/[id]` (**dieselbe** shared Route, kanzlei-scoped) | Tabs (wie Admin, gate: `service_typ='komplett'`) |
| **SV** | `/gutachter/fall/[id]` (fall_id==claim_id) | **Custom** — `FallDetailClient` (+ `stellungnahme/`-Sub-Route) |
| **Werkstatt** | `/werkstatt/auftraege/[id]` | **Custom** — `WerkstattAuftragDetail` |
| **Makler** | `/makler/akten` (Detail via `?consent=…&fall=…`) | **Custom** — Akten-Liste + Consent-gated Detail |

**Sichtbarkeits-Gate (gemeinsam, bleibt):** `claim_sichtbar_fuer_aktuellen_user(uuid)` (SECURITY DEFINER) —
`service_role OR admin/dispatch OR geschaedigter_user_id=uid OR is_claim_user_party OR sv_id∈… OR makler_id∈… OR
werkstatt_id∈… OR (kundenbetreuer_id=uid) OR (rolle=kanzlei ∧ service_typ='komplett') OR makler_fall_consent`.
Plus je-Rolle-Unlocks (Kunde: `onboarding_complete`; SV: `sa_unterschrieben=true`, sonst `notFound()`).
Referenz: [[reference-claim-detail-view-per-role-routes-and-gates]].

**Kern-Erkenntnis:** **Der Kunde-`claim-view` ist der einzige schon zonierte Kern** — und seine Zonen decken sich
bereits mit dem FUNDAMENT-C4-Ziel (Kopf/Status · Beteiligte · Dokumente · Kommunikation · rollen-spezifisch). Er ist
damit der **de-facto Prototyp** des Akte-Kerns; die anderen Sichten werden auf dieses Zonen-Modell gehoben, nicht neu erfunden.

## 2 · Der Kern (Zonen, rollen-parametrisiert)

Ein `<FallAkte config={rolleConfig} claim={…}>`-Kern mit **fünf Zonen** + Rollen-Konfiguration:
1. **Kopf / Status + nächster Schritt** — `operative_status`-Badge (A2) + „was ist als Nächstes zu tun" je Rolle
   (Kunde: `jetzt-zu-tun`; Staff: QC/Freigabe-Aktion; SV: Termin/Gutachten; Werkstatt: KVA/Schlussrechnung).
2. **Beteiligte** — Kunde/SV/KB/Kanzlei/Werkstatt/Makler (rollen-gefiltert sichtbar).
3. **Dokumente** — `fall_dokumente` (sichtbar_fuer-gescopt; heute je Sicht separat: `DoksTermineZone` vs `DokumenteTab`).
4. **Kommunikation** — Chat/Timeline (heute `TeamZone`/`KommunikationTab`/`TimelineTab` getrennt).
5. **Rollen-spezifische Zone** — der einzige echt-divergente Teil (Kunde: `GeldZone`; Staff: `_prozess/Sections`+`QuickActions`;
   SV: Gutachten-Upload/Stellungnahme; Werkstatt: KVA/Schlussrechnung; Makler: Consent/Provision).

Die **Rollen-Konfiguration** entscheidet je Zone: sichtbar? · welche Aktionen? · read-only vs editierbar. Der Gate
(`claim_sichtbar_fuer_aktuellen_user`) + die Server-Reads bleiben (idealerweise über die `v_claim_full`-Schicht, C5-R5).

## 3 · Shared vs. rollen-spezifisch (Migrations-Hebel)

- **~80 % geteilt:** Kopf/Status, Beteiligte, Dokumente, Kommunikation/Timeline sind je Rolle *dasselbe Datum,
  andere Darstellung* — heute 3× gebaut (Zone vs Tab vs Custom). Das ist der Redundanz-Kern (die K1–K7/S1–S7-Audits
  fanden **dieselben** Fehlerklassen je Portal einzeln gefixt).
- **~20 % rollen-spezifisch:** die „rollen-spezifische Zone" (Geld/Prozess/Gutachten/KVA/Consent) — bleibt als
  konfigurierbarer Slot.

## 4 · Tranchen (Vorgabe FUNDAMENT §5: kleinste Sonderfälle zuerst)

- **C4a — Kern-Komponente + Kunde-Migration:** `<FallAkte>` aus dem bestehenden `KundeClaimView`-Zonen-Modell
  extrahieren (der Prototyp) + Kunde-Sicht darüber rendern. Alt = keine (Kunde ist schon zoniert → geringste Migration).
- **C4b — SV** (`FallDetailClient` → Kern + SV-Zone), **C4c — Werkstatt**, **C4d — Kanzlei**, **C4e — Admin/Dispatch**
  (die Tab-Sicht → Kern; größter Sonderfall zuletzt).
- **Je Tranche:** Portal rendert über den Kern; Rollen-Journey-Smoke grün (B1); **Alt-Komponenten gelöscht**
  (`git status` + knip-Baseline sinkt mit); Rollen-Gates unverändert (Regression-Check §7 AGENTS.md).

## 5 · DoD (gesamt) + Nicht-Ziele

**DoD:** Alle 5 Rollen-Sichten rendern über den `<FallAkte>`-Kern; Alt-Implementierungen (`_tabs`/`FallDetailClient`/
`WerkstattAuftragDetail`/Makler-Custom) gelöscht; Journey-Smokes je Rolle grün (B1); Rollen-Gates + Routen unverändert
(alte Bookmarks leben). **Nicht-Ziele:** kein visuelles Redesign (Token/Primitives-Regeln + Look bleiben); keine neuen
Zonen-Features; keine Gate-/RLS-Änderung (das ist C5).

## 6 · Offene Entscheidungen (→ DECISIONS.md, Aaron-Review vor C4a-Code)

1. **Zone vs. Tab als Kern-Chrome:** der Kunde-Prototyp ist Zonen-scrollend, die Staff-Sicht Tab-basiert. Wird der Kern
   **zonen-scrollend** (mobile-first, Kunde-Muster) mit optionalem Tab-Chrome für Desktop-Staff, oder bleiben Tabs für Staff?
   *(Empfehlung: ein Zonen-Kern + rollen-konfigurierbares Chrome — Zonen mobil, Tab-Gruppierung als Desktop-Layout-Option.)*
2. **Reihenfolge SV vs Werkstatt** (C4b/c) — welcher ist der „kleinere Sonderfall"? (Erhebung der Zonen-Divergenz je Tranche.)
