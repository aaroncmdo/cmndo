# Plan — Kanonischer FlowLink: Funnel + Quali-Gebiete (Diskussionsbasis zum Challengen)

**Stand:** 2026-06-04 · **Quelle:** Aaron-Live-Durchsprache 04.06. · **Status:** PLAN (kein Code) — gegen das Entity-Modell challengen.
**Owner-Grenze:** Funnel/FlowLink = diese Session (aar-956). Entity-Split (`convertLeadToClaim`) = Entity-Session (`d7227c2f`) — **WARTEN, nicht anfassen.**

---

## 1. Gesamt-Pipeline (Aaron, verbindlich)

```
Marketing-Seiten (= DIE Anfrage, alle Formulare dort)
   → gutachter_finder_anfragen  (direkt, kein /anfrage-Route)
   → [Absenden]  createLead + kanonischer FlowLink raus (WA→SMS→Email)
   → /flow/[token]  durchlaufen  (flach; Lead bleibt flach)
   → SA + Vollmacht unterschrieben
   → convertLeadToClaim  = HIER Split auf Entitäten → Claim + Entities   [ENTITY-SESSION]
   → Kunden-Login
   → EIN kanonisch-dynamischer Onboarding-Wizard   (keine tausend Wizards)
```

**Prinzipien:**
- FlowLink holt die **leicht qualifizierbaren + high-value Allgemein-Infos**; der **Rest → Onboarding** (nach Login).
- **Lead bleibt flach.** Entity-Auflösung **nur** in `convertLeadToClaim` (post-SA). Nichts in die Lead/Anfrage/Wizard-Stage vorziehen.
- `convertLeadToClaim`-**Timing flexibel** (verschiebbar, falls nötig) — Minimum für den Claim klären.
- **Signatur (SA + Vollmacht) NUR im FlowLink.**

---

## 2. FlowLink-Gebiete — Aarons Sequenz (04.06.)

| # | Gebiet | Was | Pflicht? | Status heute |
|---|--------|-----|----------|--------------|
| 1 | **Stammdaten** (immer) | Kontakt/Name, Review+Edit | leicht | ✅ `zusammenfassung`-Step |
| 2 | **ZB1-Scan** (Option) | Foto → OCR füllt Fahrzeug/Halter (H6) | optional | ✅ Part 2 `FlowZb1Upload` |
| 3 | **Fahrzeug** | meist aus ZB1 vorausgefüllt; Lücken manuell | leicht | ✅ Part 2 manuell + feststellung |
| 4 | **Unfall** (kurz) | Hergang/Konstellation knapp | leicht | 🟡 feststellung-Config (kürzen?) |
| 5 | **Schaden + Schadenfotos** | Beschreibung + Foto-Upload im Flow | high-value | 🔴 GAP: Schadenfoto-Upload im /flow |
| 6 | **Polizeibericht** (optional) | wenn Polizei vor Ort → Upload möglich, sonst Onboarding | optional | 🔴 GAP: Polizei-Upload im /flow |
| 7 | **Besichtigungsort** (wenn Lücke) | Adress-Abfrage | high-value | ✅ Task 3 |
| 8 | **Termin** | Resolver (SV+Slot / fixer / global) | high-value | ✅ Task 2 |
| 9 | **service_typ** | komplett / nur-Gutachter | leicht | ✅ Task 4 (feststellung-Config) |
| 10 | **Schuldfrage** (Quali-Gate) | Eigenverschulden → Kasko-Ende | leicht | ✅ |
| 11 | **SA + Vollmacht** | Signatur (NUR hier) | high-value | ✅ SA · 🟡 Vollmacht = separat? |

> Heutige STEPS-Maschine (FlowWizardKfz, incomplete-Pfad):
> `zusammenfassung → [quali] → [feststellung (+ZB1)] → termin → gutachter → sa → account`.
> Aarons Gebiete müssen auf diese STEPS abgebildet/umsortiert werden (s. Challenge-Fragen).

---

## 3. Einteilung „easy + high-value" (zum Challengen)

- **FlowLink (jetzt erheben):** Stammdaten · ZB1/Fahrzeug · Schuldfrage · Besichtigungsort · Termin · service_typ · Schadenfotos · SA+Vollmacht.
- **FlowLink optional / deferrable:** Polizeibericht · Unfall-Tiefe · Schaden-Detail.
- **Onboarding (nach Login):** tiefe Stammdaten · Werkstatt · Mietwagen-Detail · weitere Dokumente · Vorschäden · alles Spezielle.

Leitfrage je Feld: *leicht zu beantworten?* + *bringt es früh Mehrwert (Matching/Claim/SA)?* → ja = FlowLink, sonst Onboarding.

---

## 4. Schon gebaut (PR #2374) vs. Gaps

**Gebaut (PR #2374):** Resolver (Termin/SV/Besichtigungsort, eine Quelle) · ZB1 Foto/OCR/manuell + gap-gating · service_typ-Config · Schuldfrage · SA-Auto-Confirm-on-Termin · kanonischer Link (1 Lead = 1 Link) + Send-Text nach DB-Stand · saubere react-email-Vorlagen.

**Gaps im FlowLink (Funnel-Owner, nach Plan-Freigabe):**
- 🔴 **Schadenfotos-Upload** im /flow (flow-token-Upload, reuse `/upload/dokumente` `unfallfotos`-Slot + das Part-2-Foto-Pattern).
- 🔴 **Polizeibericht-Upload** (optional) im /flow (analog, `polizeibericht`-Slot).
- 🟡 **Unfall/Schaden-Kurz-Steps** als eigene Gebiete (heute in feststellung gemischt).
- 🟡 **STEPS-Reihenfolge** an Aarons Gebiets-Sequenz angleichen.
- 🟡 **Vollmacht-Signatur** — separat von SA oder zusammen? (heute nur SA).

**Entity-Session (WARTEN, `d7227c2f`):** `convertLeadToClaim` Gegner-Fzg / werkstatt / mietwagen / personen-Härtung. Nicht anfassen, bis deren Schema + `ensure<Entity>`-Helfer stehen (heute nur `ensureVehicleFromFin` + `ensurePersonForData`).

**Konsolidierung (Funnel-Cutover):** Marketing-Forms → `gutachter_finder_anfragen` → createLead + Canonical-Link; `/anfrage`-Route + `issue-flowlink`/`konvertiere-anfrage-zu-fall` (direkt-Fall!) retiren. ⚠️ kreuzt die aar-939-Embed-Forms → koordiniert.

---

## 5. Challenge-Fragen (gegen das Modell)

1. **Reihenfolge:** Aarons Sequenz (Stammdaten→ZB1→Fahrzeug→Unfall→Schaden→Polizei→…→SA) vs. heutige STEPS. Eine lineare Gebiets-Liste, oder bleibt der quali/termin-Block dazwischen?
2. **Claim-Minimum:** Was MUSS für `convertLeadToClaim` (bei SA) da sein? Das definiert die FlowLink-Pflichtfelder vs. Onboarding. (Timing verschiebbar — was ist das Minimum?)
3. **Schadenfotos / Polizeibericht im Flow:** flow-token-Upload analog Part-2-ZB1 (reuse `runZB1Ocr`-Infra-Muster bzw. `uploadDokument`-Slot). Polizei = optional/deferrable — UI dafür?
4. **Vollmacht:** eine Signatur mit SA, oder zweiter Schritt? Eigene Vorlage/Canvas?
5. **Onboarding-Grenze:** Was genau landet im 1 dynamischen Onboarding-Wizard (nach Login) — und ist das diese Session oder eine andere?
6. **Entity-Abgleich:** Sammelt der FlowLink alles, was die Entities (vehicles/personen/versicherungen/werkstatt/mietwagen) bei `convertLeadToClaim` brauchen — oder kommt der Rest sauber aus dem Onboarding nach? (← der eigentliche „gegen das Modell challengen"-Punkt, gemeinsam mit der Entity-Session.)

---

## 6. Nächste Schritte (Reihenfolge)
1. Diesen Plan **gemeinsam challengen** (v.a. §5).
2. PR #2374 reviewen/mergen (fertige Basis).
3. Entity-Session abwarten → `convertLeadToClaim`-Härtung **mit** ihnen planen.
4. Funnel-Gaps (Schadenfotos/Polizei-Upload, STEPS-Reihenfolge, Vollmacht) — nach Plan-Freigabe, koordiniert mit aar-939.
