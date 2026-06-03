# Dispatch Config-Unify — P2e re-scoped: Dispatcher-ZB1 ausgeblendet

**Datum:** 2026-06-02 · **Branch:** `kitta/dispatch-config-unify-p2e` (off frischem `origin/staging`) · **Migration:** `20260602072035_lead_erfassung_zb1_audience_kunde`

## TL;DR

Das `zb1-upload`-Foto-Feld der `lead-erfassung`-Flow rendert im Dispatcher-Renderer (`DispatchLeadForm`, `?v2`) **ohne `zb1Token`** → es zeigt „Upload-Token fehlt" und ist nicht benutzbar. Da der Dispatcher Kennzeichen/Fahrzeugdaten ohnehin **manuell tippt** (16 weitere Felder in derselben Sektion), wurde das Foto-Feld per `audience 'beide' → 'kunde'` **aus der Dispatcher-Sicht entfernt** — und ist damit korrekt für den Kunden-Renderer ab **P4** (Flowlink → `lead-erfassung`) vorbereitet.

## Warum nicht das ursprüngliche P2e (token-confirm/clear)?

Der Handoff (`HANDOFF-dispatch-config-unify.md` §2) beschrieb P2e als **ersten Live-Change**: „im Pre-Fall-Flowlink `/flow/[token]` gehen Kunden-OCR-Korrekturen verloren, weil `confirmZb1Korrekturen(fallId)`/`clearZb1Felder(fallId)` eine `fallId` brauchen." **Empirische Prüfung gegen `staging` widerlegt die Prämisse:**

| Renderer von `Zb1UploadField` | Flow | `zb1Token` | `fallId` | Status |
|---|---|---|---|---|
| `/kunde/onboarding-details` | `kunde-onboarding` | gesetzt | **immer gesetzt** | confirm/clear **funktionieren** — kein Bug |
| `DispatchLeadForm` (`?v2`) | `lead-erfassung` | **null** | **null** | Upload tot (kein Token); `?v2`-gated; Dispatcher tippt manuell |
| `/flow/[token]` (`FlowWizardKfz`) | — | — | — | **kein ZB1-Feld** (KFZ-125: Uploads ins Kunden-Portal verschoben) |
| `/anfrage/[token]` (Self-Service, anon) | `beauftragung` | — | — | **kein ZB1-Feld** |

→ Es gibt **keinen erreichbaren Kunden-Pfad** mit ZB1 ohne `fallId`. Das ursprüngliche P2e (token-basierte `confirmZb1KorrekturenViaToken`/`clearZb1FelderViaToken`) wäre **toter Code** und nicht smoke-bar gewesen. Es wird erst bei **P4** nötig (Kunden-Flowlink rendert `lead-erfassung` pre-fall, ohne `fallId`). Entscheidung Aaron 2026-06-02: **auf Dispatcher-ZB1 umdeuten.**

## Fix

Migration `20260602072035` (Natural-Key-`UPDATE`, nur die `lead-erfassung`-Variante):

```sql
update onboarding_felder f set audience = 'kunde'
from onboarding_phasen p
where f.phase_id = p.id and p.flow_key = 'lead-erfassung'
  and f.feld_key = 'fahrzeugschein_foto' and f.typ = 'zb1-upload';
```

`filterFelderByAudience(felder, 'dispatcher')` behält nur `audience ∈ {beide, dispatcher}` → das `kunde`-Feld fällt für den Dispatcher raus, bleibt aber für den Kunden-Loader (`audience='kunde'`) ab P4 sichtbar. Das **`kunde-onboarding`-ZB1-Feld** (andere Phase/Flow) bleibt unverändert `beide` → der **Live-Kunden-Pfad ist unberührt**.

## Verifikation

- **SQL:** lead-erfassung-Feld jetzt `kunde`, kunde-onboarding-Feld weiter `beide` (✓).
- **Data-Layer-Sim:** Dispatcher-sichtbare „Fahrzeug & Halter"-Felder = `kennzeichen, hersteller, modell, baujahr, fin, hsn, tsn, farbe, fahrbereit, ist_fahrzeughalter, halter_*` — `fahrzeugschein_foto` fehlt (✓).
- **tsc --noEmit:** exit 0 (kein TS-Change, reine DB-Migration + Smoke-Script).
- **UI-Smoke (`scripts/smoke-dispatch-zb1-audience.mjs`, staging, Dispatcher `?v2`):** `SMOKE_RESULT=PASS`, 0 Console-Errors. Sektion zeigt **16 Felder** (vorher 17), Kennzeichen/Marke/Modell vorhanden, **kein** „Fahrzeugschein"-Widget, **kein** „Upload-Token fehlt". Screenshots: `docs/02.06.2026/smoke-dispatch-v2-zb1/`.

## Konsequenz für die Strecke

- **P4** (Kunden-Flowlink → `lead-erfassung`): Dann wird das ZB1-Feld pre-fall ohne `fallId` für den **Kunden** rendern → **erst dann** werden token-basierte `confirmZb1KorrekturenViaToken`/`clearZb1FelderViaToken` (auf `dokument_upload_anfragen.token` → `lead_id`) gebraucht. Bis dahin: nicht bauen (wäre dead/un-smoke-bar).
- Nächster Schritt der Strecke bleibt **P2d** (Rich-Sektionen), siehe Handoff §2.
