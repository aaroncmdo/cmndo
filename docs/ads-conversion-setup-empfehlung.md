# Empfehlung: Conversion-Setup Google Ads „Claimondo Cluster" (951-112-7970)

**Stand:** 2026-06-20 · **Quelle:** Live ausgelesen aus Google Ads → Zielvorhaben → Alle Conversion-Aktionen (14 Aktionen)
**Ziel:** Saubere Trennung „zählt vs. beobachten", **keine Doppelzählung**, klare Bidding-Signale.
**Hinweis:** Reine Empfehlung — es wurde **nichts geändert**. Umsetzung erst nach Freigabe.

---

## Grundprinzip

1. **Eine reale Aktion = ein Mess-Weg als „primär".** Pro echtem Lead nur EINE Conversion-Aktion zählen lassen — sonst Doppelzählung.
2. **Echte Leads = primär** (zählen + Smart Bidding): Formular-Anfrage, Rückruf-Anfrage, Buchung, **qualifizierter** Anruf (≥60 s).
3. **Micro-/Zwischenschritte = sekundär** (nur Beobachtung, kein Bidding): Telefon-/WhatsApp-Klick, Routenberechnung, Tool-Öffnen.
4. **GA4-Importe** doppeln hier vorhandene native Website-Tags → **sekundär lassen** (oder pausieren), damit dieselbe Aktion nicht zweimal zählt.

Antwort auf die Ausgangsfrage: GA4-Traffic wird **importiert und angezeigt**, zählt aber aktuell **nicht** (alle GA4-Aktionen stehen auf „Sekundär / nicht in Conversions einbezogen"). Das ist hier sogar **richtig so**, weil die nativen Website-Tags dieselben Aktionen bereits abdecken.

---

## Ist-Zustand (alle 14 Aktionen)

| # | Conversion-Aktion | Quelle | Status | Optimierung | zählt? | Conv. |
|---|---|---|---|---|---|---|
| 1 | monika_anfrage_submit | Website | ⚠️ Überprüfung erforderlich | Primär | **Ja** | 0 |
| 2 | Gutachter-Finder Reservierung | Website | keine kürzl. Conv. | Primär | **Ja** | 0 |
| 3 | Gutachter-Finder Rückruf | Website | keine kürzl. Conv. | Primär | **Ja** | 0 |
| 4 | Gutachter-Finder Anruf | Website | ⚠️ **Inaktiv** | Primär | **Ja** | 0 |
| 5 | monika_callback_request | Website | ⚠️ Überprüfung erforderlich | Primär | **Ja** | 0 |
| 6 | call_60s | Anruf über Anzeigen | keine kürzl. Conv. | Primär | **Ja** | 0 |
| 7 | Calls from ads | Anruf über Anzeigen | ✅ Aktiv | Primär | **Ja** | 2 |
| 8 | call_website_60s_v2 | Website | keine kürzl. Conv. | Primär | **Ja** | 0 |
| 9 | phone_click | Website | ✅ Aktiv | Sekundär | Nein | 3 (75 €) |
| 10 | whatsapp_click | Website | ⚠️ Überprüfung erforderlich | Sekundär | Nein | 0 |
| 11 | Local actions – Directions | Von Google gehostet | ✅ Aktiv | Sekundär | Nein | 5 |
| 12 | **Cluster Management (web) phone_click** | **Website (GA4)** | keine kürzl. Conv. | Sekundär | Nein | 0 |
| 13 | **Cluster Management (web) request_submit** | **Website (GA4)** | keine kürzl. Conv. | Sekundär | Nein | 0 |
| 14 | **Cluster Management (web) tool_open** | **Website (GA4)** | keine kürzl. Conv. | Sekundär | Nein | 0 |

Gesamt erfasst (Zeitraum): 10 Conv. / 82 € — davon zählt im „Conversions"-Wert nur **Calls from ads (2)**; phone_click (3) und Directions (5) sind sekundär.

---

## Empfohlenes Ziel-Setup pro Aktion

### → PRIMÄR (zählen + Smart Bidding) — echte Leads

| Aktion | Empfehlung | Begründung |
|---|---|---|
| monika_anfrage_submit | **Primär behalten** + Tag verifizieren | Kern-Lead (Formular). „Überprüfung erforderlich" beheben, sonst unzuverlässig. |
| monika_callback_request | **Primär behalten** + Tag verifizieren | Rückruf-Anfrage = Lead. Verifizierung offen. |
| Gutachter-Finder Reservierung | **Primär behalten** | Buchung = stärkster Lead. |
| Gutachter-Finder Rückruf | **Primär** — Überschneidung mit `monika_callback_request` prüfen | Falls dieselbe Aktion: nur eine primär lassen. |
| call_website_60s_v2 | **Primär behalten** | Qualifizierter Website-Anruf (≥60 s). |
| Calls from ads **oder** call_60s | **EINE** primär, andere sekundär | Beide „Anruf über Anzeigen" → Überschneidungsgefahr. Empfehlung: `Calls from ads` primär (läuft, 2 Conv.), `call_60s` sekundär. |

### → SEKUNDÄR (nur Beobachtung) — Micro-Conversions

| Aktion | Empfehlung | Begründung |
|---|---|---|
| phone_click | Sekundär lassen | Klick ≠ Gespräch; gehört nicht ins Bidding. |
| whatsapp_click | Sekundär lassen + Tag verifizieren | Micro-Signal. |
| Local actions – Directions | Sekundär lassen | Routenklick (GBP), kein echter Lead. |

### → SEKUNDÄR oder PAUSIEREN — GA4-Importe (Dubletten!)

| Aktion | Empfehlung | Begründung |
|---|---|---|
| Cluster Management (web) phone_click | Sekundär/pausieren | Dublette zu nativem `phone_click` (#9). |
| Cluster Management (web) request_submit | Sekundär/pausieren | Dublette zu `monika_anfrage_submit` (#1). |
| Cluster Management (web) tool_open | Sekundär lassen | Reines Engagement-Signal. |

---

## ⚠️ Doppelzählungs-Risiken (vor „primär"-Schaltung klären)

1. **phone_click**: nativ (#9) **und** GA4 (#12) — niemals beide primär. → nativ behalten, GA4 sekundär.
2. **Formular-Submit**: `monika_anfrage_submit` (#1) **und** GA4 `request_submit` (#13) — dieselbe Aktion. → nativ primär, GA4 sekundär.
3. **Anrufe aus Anzeigen**: `Calls from ads` (#7) **und** `call_60s` (#6) — eine primär wählen.

## Hygiene-To-dos (unabhängig vom Zählen)

- **Tag-Verifizierung** für #1, #5, #10 (Status „Überprüfung erforderlich") — sonst werden Conversions evtl. nicht erfasst.
- **#4 „Gutachter-Finder Anruf" ist Inaktiv** — reaktivieren (falls gewollt) oder entfernen.
- Nach Umstellung 1–2 Wochen beobachten, ob „Conversions"-Spalte plausibel bleibt (keine Verdopplung).

---

## Kurzfassung für dich

- GA4 zählt aktuell **nicht** in Ads (alles sekundär) — und das soll auch so bleiben, weil die nativen Tags dieselben Leads schon erfassen.
- Echte Leads (Formular, Rückruf, Buchung, qualifizierter Anruf) → **primär**.
- Klicks/Routen/Tool-Open + GA4-Dubletten → **sekundär**.
- Vor jeder „primär"-Schaltung die 3 Doppelzählungs-Paare prüfen.
