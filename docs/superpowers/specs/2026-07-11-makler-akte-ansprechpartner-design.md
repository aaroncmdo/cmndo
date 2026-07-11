# Makler-Akte: Ansprechpartner im Chat-Fenster + Detail-View-Feld-Audit

**Datum:** 2026-07-11
**Branch:** `kitta/makler-akte-ansprechpartner` (off `staging`)
**Aaron-Auftrag:** „der makler muss in der akte die ansprechpartner sehen, am besten im chat fenster" + „danach prüfe die detail view auf die felder, dass alles richtig zugewiesen ist"

Zwei zusammenhängende Arbeitspakete:

1. **Feature** — Ansprechpartner-Übersicht (Kundenbetreuer + Sachverständiger + Kanzlei) oben im Chat-Tab der Makler-Akte.
2. **Audit** — die Feld-Zuordnungen der Detail-View (Overview-Panel + Kunden-Auflösung) gegen das echte DB-Schema prüfen und Fehlzuordnungen fixen.

---

## 1 · Feature: Ansprechpartner im Chat-Tab

### Ziel
Der Makler sieht in der Akte oben im **Chat-Tab** wer seine Ansprechpartner zum Fall sind — **Kundenbetreuer, Sachverständiger, Kanzlei** — jeweils mit Telefon/E-Mail, auch bevor die erste Nachricht im Gruppenchat kommt.

### Reuse (kein neues UI)
`@/components/shared/fall-kontakte/FallKontakteCard` existiert bereits (AAR-754), unterstützt `rolle="makler"` explizit und rendert KB + SV + optional Kanzlei mit Phone/Mail (leere Slots werden ausgeblendet, `return null` wenn alle leer). Admin-, SV- und Kunde-Akte nutzen sie schon. Der Makler-Chat rendert sie einfach mit. **Keine neue Komponente.**

### Datenmodell (per Supabase-MCP am 2026-07-11 verifiziert)
Die View `v_faelle_mit_aktuellem_termin` (die `getMaklerFallDetail` bereits liest) exponiert **alle nötigen Schlüssel**:
- `sv_id` (uuid) — via `v_claim_base` aus `claims.sv_id`
- `kundenbetreuer_id` (uuid) — aus `claims.kundenbetreuer_id`
- `kanzlei_ansprechpartner_name` / `_email` / `_telefon` (text) — aus `claims.*`

Auflösung der Person-Datensätze (Makler-RLS deckt `profiles`/`sachverstaendige` nicht ab → Service-Role, wie schon beim Kunden in derselben Funktion):
- **KB** ← `admin.profiles` per `kundenbetreuer_id` → `{ vorname, nachname, email, telefon }`
- **SV** ← `admin.sachverstaendige` per `sv_id` → `{ profile_id, verifiziert }`, dann `admin.profiles` per `profile_id` → `{ vorname, nachname, email, telefon }` (+ `verifiziert` als SvKontakt-Badge)
- **Kanzlei** ← direkt aus den View-Feldern `kanzlei_ansprechpartner_{name,email,telefon}` → `{ vorname: name, nachname: null, email, telefon }`

`profiles` hat: `vorname, nachname, email, telefon, adresse, plz, ort, avatar_url, anzeigename` (Adresse ist ein Einzelfeld).

### Architektur / Datenfluss
```
page.tsx (unverändert)
  └─ getMaklerFallDetail(maklerId, fallId)          [erweitert]
        ├─ (Gate) makler_fall_consent aktiv? sonst null
        ├─ View-Read: + sv_id, kundenbetreuer_id, kanzlei_ansprechpartner_*
        ├─ admin: Kunde (bestehend) + NEU KB-Profil + SV(→Profil)  [Promise.all]
        └─ return { ..., kontakte: { kundenbetreuer, sv, kanzlei } }
  └─ <MaklerAkteDetail detail=… />                  [nimmt detail.kontakte]
        └─ tab==='chat':  <div space-y-4>
                            <FallKontakteCard rolle="makler" …/>  ODER Platzhalter
                            <MaklerChatTab … />                    (unverändert)
                          </div>
```

- **`getMaklerFallDetail`** (`src/lib/makler/queries.ts`): View-Select um `sv_id, kundenbetreuer_id, kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_telefon` erweitern. Nach dem bestehenden Kunden-Block (Admin-Client ist dort schon instanziiert) KB + SV parallel auflösen; Kanzlei aus den View-Feldern bauen. `FallDetail` bekommt ein Feld `kontakte: { kundenbetreuer, sv, kanzlei }` (Shapes = FallKontakteCard-Props).
- **`MaklerAkteDetail.tsx`**: `kontakte` aus `detail` destrukturieren; im `tab === 'chat'`-Block `FallKontakteCard` über `MaklerChatTab` rendern. Wenn alle drei Kontakte leer → dezenter Platzhalter statt Lücke. **`MaklerChatTab` bleibt unangetastet** (kein Kollisionsrisiko mit den laufenden Chat-Sessions).
- **`page.tsx`**: keine Änderung (Detail trägt `kontakte`).

### Empty-State
Kein Kontakt zugewiesen (in der Praxis häufig: KB/SV erst später, Kanzlei erst nach Übergabe) → statt `FallKontakteCard`'s `null` ein dezenter Hinweis:
> „Ansprechpartner werden zugewiesen, sobald Betreuer oder Gutachter feststehen."

### Sicherheit / RLS
Kontakte werden nur **nach** dem bestehenden Consent-Gate aufgelöst (`getMaklerFallDetail` → `null` ohne aktiven Consent; die Route redirected zusätzlich bei `consent_scope !== 'vollzugriff'`), scoped auf genau diesen Fall. KB/SV/Kanzlei sind Claimondo-/Kanzlei-seitige Kontakte (kein Kunden-PII) → keine Scope-Staffelung nötig; sie folgen dem etablierten Admin-Client-Muster der Kunden-Auflösung in derselben Funktion.

---

## 2 · Audit: Detail-View-Feld-Zuordnungen

Aaron-Auftrag: prüfen, dass die Felder der Makler-Detail-View „richtig zugewiesen" sind. Per Supabase-MCP `pg_get_viewdef` + Stichproben verifiziert.

### Strukturell korrekt (View-Quellen bestätigt)
Alle Overview-Felder mappen auf reale, befüllte Quellen von `v_faelle_mit_aktuellem_termin` (← `v_claim_base`):
`unfalldatum ← schadentag`, `unfallort ← schadenort_adresse`, `unfallhergang ← hergang_kunde_text`, `fahrzeug_hersteller ← fahrzeug_hersteller_raw`, sowie `schadens_art, service_typ, kennzeichen, fahrzeug_modell/_baujahr, erstzulassung, kilometerstand, fin_vin, gegner_name/_kennzeichen/_versicherung/_schadennummer, reparaturkosten, wertminderung, nutzungsausfall_gesamt, gutachter_honorar, schadens_hoehe_netto` — 1:1, keine toten Legacy-Passthroughs. **Kein Fix nötig.**

### Befund (echter Fehler): Kunden-Identität nur aus `geschaedigter_user_id`
`getMaklerFallDetail` löst den Kunden ausschließlich über `claims.geschaedigter_user_id → profiles` auf. Empirie (alle 3 Makler-Consent-Fälle): **2 von 3 haben `geschaedigter_user_id = NULL`**, obwohl der **Lead** Name (+ Telefon) trägt. Folge:
- Makler-**Liste** (`getMaklerFaelleList`) zeigt den Namen (liest `leads!lead_id`).
- Makler-**Detail** zeigt im Header `fullName(kunde)` und in der Kunde-Card überall „–", weil `kunde` `null` ist.

→ **Inkonsistenz + Datenverlust** zwischen Liste und Detail. Die View-Felder `kunde_*` sind in der Praxis unbefüllt (keine Alternative).

**Fix:** In `getMaklerFallDetail` den Kunden robuster auflösen — bevorzugt `geschaedigter_user_id → profiles`, **Fallback auf den Lead** (`claims.lead_id → leads`) für Name (+ Telefon/E-Mail). Die bestehende Scope-Staffelung bleibt: Name immer, Kontaktfelder nur bei `vollzugriff` (Route redirected non-vollzugriff ohnehin — belt & suspenders). Das gleicht Detail an Liste an und stellt die Identität wieder her.

### Nachrangig (kein Fix in dieser PR)
- „Ort" zeigt `schadenort_adresse` (volle Straßen-Adresse), nicht die Stadt `schadenort_ort`. Bewusst belassen — die Adresse ist informativer; nur dokumentiert.

---

## Out of Scope (YAGNI)
- Keine Änderung an `MaklerChatTab` (Gruppenchat-Logik), am Chat-Kanal-Modell oder an der Realtime-Subscription.
- Kein Kunde-Kontakt in `FallKontakteCard` (die Karte kennt nur KB/SV/Kanzlei; der Kunde ist im Header + Kunde-Card präsent).
- Keine DDL (nur Reads; alle Spalten existieren).
- Keine Branding-Änderung (Makler-Portal ist internes B2B-Tool, ungebrandet).

## Tests
- Unit (vitest) für die Kontakt-Auflösung in `getMaklerFallDetail`: Array-vs-Objekt-Normalisierung der Nested-Reads, leere Slots (alle null → `kontakte` mit null-Feldern), Kanzlei-Name-only-Mapping, Kunde-Lead-Fallback (geschädigter null → Lead-Name).

## Definition of Done (AGENTS.md 7-Punkte)
- **Build:** `npm run build` grün (Route/Server-Query geändert → voller Build).
- **UI-Erreichbarkeit:** Chat-Tab existiert bereits & ist erreichbar; Karte oben darin.
- **Redundanz:** shared `FallKontakteCard` wiederverwendet — keine Duplikation.
- **Dead-Code:** keiner.
- **Spec-Treue:** Platzierung Chat-Tab + KB/SV/Kanzlei = Aaron-Wahl; Audit-Fix = Aaron-Auftrag.
- **Inkonsistenz:** Tokens/Umlaute/Naming (DB-Spalten via MCP verifiziert) ok; Nested-FK mit `Array.isArray()` normalisiert.
- **Regression:** `MaklerChatTab` unberührt; `getMaklerFallDetail`-Signatur bleibt (additive `kontakte`); Consumer der Kunde-Auflösung geprüft.
