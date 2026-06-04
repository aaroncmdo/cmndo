# Plan — Kanonischer FlowLink: Funnel + Quali-Gebiete (BESTÄTIGTE Basis)

**Stand:** 2026-06-04 · **Quelle:** Aaron-Live-Durchsprache 04.06. (Struktur + dynamic-display bestätigt) · **Status:** PLAN, kein Code.
**Owner-Grenze:** Funnel/FlowLink = diese Session (aar-956). Entity-Split (`convertLeadToClaim`) = Entity-Session (`d7227c2f`) — **WARTEN.** Funnel-Cutover kreuzt aar-939-Embed → koordiniert.

---

## 1. Gesamt-Pipeline (verbindlich)

```
Marketing-Seiten (= DIE Anfrage, alle Formulare dort)
   → gutachter_finder_anfragen  (direkt, KEIN /anfrage-Route)
   → [Absenden]  createLead + kanonischer FlowLink raus (WA→SMS→Email)
   → /flow/[token]  (flach; Lead bleibt flach; dynamisch — zeigt nur Lücken)
   → unsere SA unterschrieben
   → convertLeadToClaim  = HIER Split auf Entitäten → Claim + Entities   [ENTITY-SESSION]
   → Kunden-Login
   → EIN kanonisch-dynamischer Onboarding-Wizard   (der optionale Rest)
```

**Prinzipien:**
- FlowLink = **leicht qualifizierbare + high-value** Infos; der **optionale Rest → Onboarding** (nach Login).
- **Dynamic-display (bestätigt):** jedes Feld erscheint nur, wenn der Lead es noch nicht hat. Was Anfrage/Dispatcher schon mitgaben → **vorausgefüllt + bestätigbar** angezeigt (read-only/leicht editierbar) — der Kunde **sieht** es, tippt aber nichts neu. Nur echte **Lücken** sind aktive Eingaben. „Logisch + umfangreich, aber so schlank wie möglich."
- **Lead bleibt flach.** Entity-Auflösung **nur** in `convertLeadToClaim` (post-SA).
- `convertLeadToClaim`-Timing flexibel (verschiebbar). Claim-Minimum noch zu definieren (mit Entity-Session).

---

## 2. Die 5 FlowLink-Gebiete (bestätigte Sequenz, Aaron 04.06.)

| # | Gebiet | Inhalt | Status heute |
|---|--------|--------|--------------|
| 1 | **Stammdaten** | Name/Kontakt (vorausgefüllt, editierbar) · Toggle **„Ansprechpartner = Halter?"** · **ZB1-Foto** (optional → OCR füllt Fahrzeug/Halter) · sonst Fahrzeugfelder manuell — nur Lücken | ✅ zusammenfassung + ✅ Part-2-ZB1/manuell · 🔴 Halter-Toggle · 🟡 ZB1 in Stammdaten ziehen (heute in feststellung) |
| 2 | **Schuldfrage** | Quali-Gate (Eigenverschulden → Kasko-Ende, Stop) | ✅ quali |
| 3 | **Unfall + Polizei** | kurze Unfallbeschreibung · „Polizei vor Ort?" → wenn ja: **Polizeibericht-Upload** (überspringbar) | 🟡 Unfall-Kurz (aus feststellung) · 🔴 Polizeibericht-Upload im /flow |
| 4 | **Besichtigung + Termin** | **ein Schritt**: Ort prüfen + SV matchen + Slot buchen | ✅ Task 2/3 (Resolver + ort_abfragen) — ggf. zu einem Step mergen |
| 5 | **Beauftragung (SA)** | unsere SA unterschreiben · `service_typ` Komplett vorausgewählt + kleine „nur Gutachten"-Option unter dem Feld · Komplett ⇒ LexDrive-API | ✅ SA + Auto-Confirm-Termin · 🟡 service_typ in SA-Step klappen · 🟡 LexDrive-on-komplett verifizieren |
| — | ── SA unterschrieben → **Login → convertLeadToClaim → Onboarding** ── | | |

**Schadenfotos:** Aaron 04.06. nennt sie beim Schaden — Verortung offen: eigenes Mini-Gebiet bei (3) oder im Onboarding. (Challenge-Frage.)

---

## 3. SA / service_typ / Vollmacht — korrigiertes Modell (Aaron 04.06.)
- **EINE** Unterschrift = **unsere SA** (sie zeichnet die SA des gewählten Gutachters). **KEINE separate Vollmacht-Signatur.**
- `service_typ` = **Komplett** (Gutachten + Anwalt/LexDrive-Mandat, 0 €) vs. **nur Gutachten** (Kunde reguliert selbst). Default **Komplett**; kleine „nur Gutachten"-Option unter dem Unterschriftsfeld.
- Steht `service_typ` schon im Lead (Marketing-Anfrage hat z.B. „nur Gutachten" mitgegeben) → genutzt, keine Auswahl mehr; sonst Default Komplett.
- **Komplett ⇒ LexDrive-API** (Mandat bei LexDrive angelegt, business logic) → Webhook-Callback. Wir unterschreiben keine Vollmacht.
- Genaue Texte/Defaults = **Semantik, nach der Funktionalität.**

---

## 4. Sequenz vs. heutige STEPS-Maschine (Umbau, kein harter Konflikt)
Heute (`FlowWizardKfz`, incomplete): `zusammenfassung → [quali] → [feststellung(+ZB1)] → termin → gutachter → sa → account`.
Umbau auf die 5 Gebiete:
- ZB1 + Halter-Toggle **in Stammdaten** (heute in feststellung).
- `feststellung` (große Config-Form) **zerlegen** → Unfall+Polizei (3); der optionale Rest → Onboarding.
- `termin` + `gutachter` + `ort_abfragen` → **ein** Gebiet (4).
- `service_typ` → in **SA** (5).
- ⚠️ **STEPS-Index-Stabilität** (Booking-Skip-Mount-Cap) beim Umsortieren erhalten — sonst springt der Flow.
- **Offene Design-Entscheidung:** config-getrieben (onboarding_felder-Sektionen neu gruppiert) **vs.** explizite Gebiets-Steps. → gegen das Entity-Modell challengen.

---

## 5. Schon gebaut (PR #2374) vs. Gaps
**Gebaut:** Resolver (Termin/SV/Besichtigungsort, eine Quelle) · ZB1 Foto/OCR/manuell + gap-gating · service_typ-Config · Schuldfrage · SA-Auto-Confirm-Termin · 1 Lead = 1 Link + Send-Text · saubere react-email-Vorlagen.
**Funnel-Gaps (nach Plan-Freigabe, koordiniert):** Halter-Toggle · ZB1 in Stammdaten · Unfall-Kurz-Step · Polizeibericht-Upload im /flow · Schadenfotos-Verortung · Besichtigung+Termin mergen · service_typ in SA-Step · generalisiertes dynamic-display (prefilled+confirmable über ALLE Felder).
**WARTEN (Entity-Session):** `convertLeadToClaim` Gegner-Fzg/werkstatt/mietwagen/personen + Claim-Minimum.
**Konsolidierung (kreuzt aar-939):** Marketing-Forms → anfragen → createLead+Canonical-Link; `/anfrage` + `issue-flowlink`/`konvertiere-anfrage-zu-fall`(direkt-Fall) retiren.

---

## 6. Nächste Schritte
1. **Gegen das Entity-Modell challengen** (gemeinsam mit Entity-Session): liefert der FlowLink, was `convertLeadToClaim` für die Entities braucht — oder kommt der Rest sauber aus dem Onboarding? + Claim-Minimum.
2. PR #2374 reviewen/mergen (fertige Basis).
3. Entity-Session abwarten → `convertLeadToClaim`-Härtung **mit** ihnen.
4. Funnel-Gaps umsetzen (config-vs-Steps-Entscheidung zuerst), koordiniert mit aar-939.

**Offene Challenge-Fragen:** Schadenfotos-Verortung (FlowLink vs Onboarding) · config-getrieben vs explizite Steps · Claim-Minimum für `convertLeadToClaim`.

---

## 7. Lead→Entity-Feld-Contract — live verifiziert (Referenz zu #2429 §6)

**Stand 2026-06-04**, Spalten live gegen `paizkjajbuxxksdoycev`. Unser (Lead-Strecke) Teil des geteilten Contracts aus #2429 §6. **Plan-only** — DDL erst beim Verdrahten (nach CMM-49, koordiniert, via `apply_migration`).

| Entity-Resolver (#2429 §5) | Lead-Feld | Stand |
|---|---|---|
| `ensureVehicleFromKennzeichen` | `gegner_kennzeichen` + `gegner_fahrzeugtyp` | ✅ vorhanden |
| `ensureVersicherung` | `gegner_versicherung` (+ `gegner_versicherung_id`) | ✅ vorhanden |
| `ensurePersonForData` (Halter-Person) | `halter_*` + `ist_fahrzeughalter` + `ansprechpartner_beziehung` + `halter_ungleich_fahrer_flag` | ✅ — Halter-Toggle Person-Fall voll gedeckt |
| `ensureFirma` (Dedup `normalized_name`+`ust_id`) | `firma_ustid` | ❌ **fehlt** (keine `ust`-Spalte auf `leads`) |
| `ensureFirma` (Gegner/Halter-Firma) | per-Rolle `firma_name` | ⚠️ `firma_name` ist **Kunde-Firma** (gewerbl. Geschädigter); Gegner-Firma = Freitext `gegner_name`, Halter-Firma = kein Feld (`halter_*` = Person) |

**Offene Lead-Strecke-Arbeit (Gaps, die WIR schließen — post-CMM-49):**
1. **`leads.firma_ustid`** (+ ggf. per-Rolle) ergänzen — ust_id ist halber `firmen`-Dedup-Key.
2. **Strukturierte per-Rolle-Firma:** `gegner_ist_firma`/`halter_ist_firma`-Flag + `firma_name`/`ustid` je Rolle, damit `ensureFirma` den richtigen Namen je Partei bekommt (heute würde `lead.firma_name`→Gegner/Halter die Kunde-Firma fehlzuordnen).
3. FlowLink Gebiet 1 „Halter = Person oder Firma?" + Gebiet 3 Gegner-Erfassung füllen genau diese Felder (dynamic-display: vorhandene vorausgefüllt).

**Offene Frage an Entity (§5):** `ensureFirma` `ust_id`-**optional** (normalized_name-only Dedup wenn null) — Gegner/Halter-Firmen tragen am Intake fast nie ust_id.
