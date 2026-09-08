# Value-Based Bidding Strategie + Code-Review – Claimondo Cluster (Google Ads 951-112-7970)

**Stand:** 2026-06-20 · **Ziel:** Google Ads auf den **echten Lead-Wert** optimieren, nicht auf Lead-Anzahl. Primäres Conversion-Ziel = **SA-Unterschrift**.

---

## 1. Geschäftslogik (von Aaron)

- Es werden **ausschließlich Haftpflichtschäden** bearbeitet → keine Schadenart-Differenzierung nötig (Wertgutachten bekommen nie einen FlowLink/SA).
- **Eine unterschriebene SA ist der einzige echte Wertträger.** Brutto ~350 €, abzüglich Lead-Kosten ≈ **210 € netto** (Proxy; der exakte Fallwert hängt vom tatsächlichen Gutachten ab und ist nicht sauber trackbar).
- **Der Wert ist NICHT additiv.** Eine Reservierung/Anfrage führt *ggf.* zur SA → die gesamte Journey ist **insgesamt 210 €** wert, nicht Anfrage (100 €) + SA (210 €). Doppelzählung muss vermieden werden.
- Volumen: ~**20 SA-Unterschriften/Monat** (Zielgröße) → value-based Bidding machbar, aber am unteren Rand.

## 2. Zielmodell: Event → Wert → Rolle

| Event | Quelle | Wert | Rolle im Bidding |
|---|---|---|---|
| **`sa_signed`** (Unterschrift/Vollmacht) | GA4 server-side (client_id) | **210 € (flat)** | **PRIMÄR** – einziger Wertträger, Bidding-Ziel |
| `monika_anfrage_submit` / `generate_lead` | Website | – | sekundär (Beobachtung) |
| `Gutachter-Finder Reservierung` / `Rückruf` | Website | – | sekundär |
| `monika_callback_request` | Website | – | sekundär |
| `call_60s` / `Calls from ads` | Anruf über Anzeigen | – | sekundär (+ Call-Pfad separat, s. §5) |
| `phone_click` / `whatsapp_click` | Website | – | sekundär (Micro) |
| `Local actions – Directions`, GA4-Imports | – | – | sekundär |

**Kernprinzip:** Nur `sa_signed` trägt Wert. Alles Upstream = reine Funnel-/Audience-Beobachtung → keine Doppelzählung, Smart Bidding jagt **Unterschriften**, nicht Absendungen.

## 3. Ist-Zustand & die zentrale Lücke

- ✅ `sa_signed` **feuert bereits** server-side an GA4 mit `value=210, currency=EUR` (Code: `src/lib/analytics/ga4-conversions.ts` `SA_SIGNED_VALUE_EUR=210` + `src/app/flow/[token]/actions.ts`), über gespeicherte `ga_client_id`, consent-respektierend, mit Dedup.
- ❌ **`sa_signed` ist NICHT als Google-Ads-Conversion importiert** (von 14 Ads-Aktionen war es keine; importiert sind nur GA4 `phone_click`/`request_submit`/`tool_open`).
- ❌ Folge: **Das 210-€-Signal erreicht das Ads-Bidding nicht.** Google optimiert aktuell auf die Upstream-Leads.
- ⚠️ Die Lead-Aktionen wurden interim auf **primär / 100 € Fallback** gesetzt – unter dem Zielmodell gehören sie auf **sekundär**.

## 4. Umsetzungsschritte (in Reihenfolge)

1. **GA4 (Cluster-Property):** `sa_signed` als **Schlüsselereignis** markieren (falls noch nicht). Prüfen, dass `value=210, currency=EUR` ankommt (DebugView/Echtzeit).
2. **Google Ads:** `sa_signed` aus GA4 **importieren** → Conversion-Aktion anlegen, **„in Conversions einbeziehen" = Ja**, **primär**, Wert aus Event.
3. **Upstream-Leads auf sekundär** zurückstellen (Anfrage, Reservierung, Rückruf, callback, phone_click, whatsapp_click, call_60s) → kein additiver Wert mehr.
4. **Gebotsstrategie** (NICHT sofort, erst nach Schritt 1–3 + Datensammlung):
   - Start: **„Conversion-Wert maximieren" ohne tROAS-Ziel** → ~4–6 Wochen lernen lassen.
   - Danach, wenn stabil (genug SA-Volumen): **tROAS-Ziel** ergänzen.
   - ⚠️ Nicht umstellen, solange `sa_signed` noch keine Historie in Ads hat → sonst Lernphase-Einbruch.
5. **Call-Pfad** (§5) separat anbinden.

## 5. Attribution: zwei Pfade

- **Web-Pfad:** Ad-Klick → Web-Session (GA4 client_id + gclid) → Anfrage → FlowLink → `sa_signed` (server-side, via client_id → GA4↔Ads-Link). ✅ funktioniert.
- **Call-Pfad:** Ad-Anruf → manueller Lead → FlowLink → SA. Ein Anruf hat **keine GA4 client_id** → die SA wird dem Klick **nicht** automatisch zugeordnet. Lösung: **Offline-Conversion-Import** per **gclid**. **gclid wird bereits persistiert** (`anfrage-columns.ts` + DB-Schema) und ein **Webhook (`tracking-webhook-core.ts`) liefert `gclid` + `value_eur`** → Pfad ist machbar, muss nur an Ads-Offline-Import angebunden werden.

## 6. Code-Review: „sauber integriert?" → überwiegend JA

**Sauber:** pure/getestete `value-model.ts`; server-only MP-Sender (Secret nicht im Bundle); **consent-korrekt** (`ga_client_id` nur bei Statistik-Consent → Präsenz impliziert Consent → `sa_signed` nur für Einwilligende); Attribution gclid+UTM aus URL **und** localStorage (First-Touch 90 T); gclid + ga_client_id persistiert; E.164-Phone, `value` als Number, `lead_id`-Dedup auf Lead-Event; Offline-Conversion-Webhook vorhanden; Tests vorhanden.

**Schwachstellen:**
1. **`sa_signed` ohne `transaction_id` → Doppelzählungs-Risiko.** Params nur `{source, value, currency}`. Reload/Retry zählt 210 € mehrfach. **Fix:** `transaction_id: leadId` (oder `fall.id`) ergänzen. Wichtigster Fix, da sa_signed primär wird.
2. **🔴 GA4-Property-Mismatch — BESTÄTIGT (Root-Cause):** Ads ist verknüpft mit **„Cluster Management" `G-3GER9D7KRZ` (Property-ID 540525497)**. `sa_signed` wird aber an `NEXT_PUBLIC_GA4_ID = G-9YF2W9ZP2S` (Claimondo.de-Property) gesendet — **diese ist NICHT mit Ads verknüpft.** → Das 210-€-Signal kann das Ads-Bidding **nie** erreichen. Funnel ist auf zwei Properties gesplittet (kfz-LP+gclid → G-3GER9D7KRZ; Embed/Flow+sa_signed → G-9YF2W9ZP2S). **Fix nötig (Architektur-Entscheidung):**
   - **B (kurzfristig):** Claimondo.de-Property (G-9YF2W9ZP2S) zusätzlich mit Ads verknüpfen, `sa_signed` dort Key-Event + importieren; gclid-Fluss in diese Property verifizieren.
   - **C (sauber):** Funnel auf EINE Property vereinheitlichen (Embed/Flow + sa_signed auf die mit Ads verknüpfte Cluster-Property G-3GER9D7KRZ; Cross-Domain LP↔app). Empfehlung: kurzfristig B, mittelfristig C.
3. Klein: `SA_SIGNED_VALUE_EUR=210` Code-Konstante (Änderung = Deploy); MP ohne `ad_storage` (für GA4-Import ok).

## 7. Offene To-dos

- [ ] **`sa_signed`: `transaction_id` ergänzen (Dedup)** — Code-Fix (Ticket: `dev-ticket-sa-signed-dedup.md`).
- [x] `NEXT_PUBLIC_GA4_ID` = **G-9YF2W9ZP2S** (Claimondo.de). Ads verknüpft mit **G-3GER9D7KRZ** (Cluster, 540525497) → **Mismatch bestätigt** (s. §6.2).
- [ ] **🔴 Property-Mismatch fixen** (Pfad B oder C) — **blockiert** den sa_signed-Import.
- [ ] `sa_signed` als Key-Event + in Ads importieren (erst SEKUNDÄR) — **nach** Property-Fix.
- [ ] Upstream-Leads → sekundär.
- [ ] Gebotsstrategie erst nach Datensammlung umstellen.
- [ ] Call-Pfad Offline-Import scharf schalten (Webhook → Ads).
- [ ] `call_60s` vs. `Calls from ads` Doppelzählung auflösen (eine sekundär).

## Referenzen (Code)
- `src/embed/monika/value-model.ts` (+ `.test.ts`) – Lead-Wertmodell, Enhanced-Conversion-Felder
- `src/embed/monika/attribution.ts`, `app.tsx` – Attribution-Capture + Conversion-Push
- `src/lib/analytics/ga4-conversions.ts` – `SA_SIGNED_VALUE_EUR=210`, consent-gated client_id
- `src/lib/analytics/ga4-mp.ts` – GA4 Measurement Protocol (server-only)
- `src/app/flow/[token]/actions.ts` – SA-Flow + `sa_signed` (value 210, **ohne transaction_id**)
- `src/lib/embed/tracking-webhook-core.ts` – Offline-Conversion-Webhook (gclid + value_eur)
- `src/lib/embed/anfrage-columns.ts` – Persistenz gclid + ga_client_id
