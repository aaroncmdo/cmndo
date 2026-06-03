# AAR-956 Phase C — `/anfrage` + `self_service_token` deprecaten (Inventur + Plan)

> Owner: cdd8f4f3 (AAR-940). **Status: GATED — noch NICHT ausführbar.** §3a (#2313) hat den kanonischen `/start`→`/flow`-Pfad fertiggemacht; Phase C entfernt das „verbotene Doppel" (`/anfrage/[token]` + `gutachter_finder_anfragen.self_service_token`) — aber erst wenn **0 Consumer** übrig sind. Diese Datei ist die Readiness-Karte + Ausführungs-Reihenfolge.

## Das Doppel (was weg soll)
- Route `src/app/anfrage/[token]/` (page + actions + AnfrageStartClient + BeauftragungWizardStart + SelbstQualiClient + TerminBuchungClient)
- Issuance `src/lib/self-service/issue-flowlink.ts` (`issueSelfServiceFlowLink`) → `${APP_URL}/anfrage/${token}`
- Spalten `gutachter_finder_anfragen.self_service_token` + `_expires_at` (+ partial-unique-idx)
- middleware-Whitelist `src/lib/supabase/middleware.ts:177` (`'/anfrage'`)

**Kanonischer Ersatz (steht):** `/start/[anfrageId]` → `issueCanonicalFlowLinkForAnfrage` (gfa→Lead + `flow_links` + `/flow/[token]`), `/flow` datengetrieben via §3a. Lead-gekeyte Actions: `src/app/flow/[token]/self-service-actions.ts`.

## Consumer-Inventur (live, staging `ceffa7828`)

### 1. Issuance — wer erzeugt noch `/anfrage`-Links
- **Cluster-LP-Webhook** `src/app/api/anfrage-from-lp/route.ts:156-158`: `if (process.env.SELF_SERVICE_AUTO_ISSUE === 'true' && payload.source === 'kfz_gutachter_lp') await issueSelfServiceFlowLink(...)`. → **aktiver Consumer**, solange `SELF_SERVICE_AUTO_ISSUE=true` (ist live scharf, [[project_aar940_self_service]]).

### 2. 🔴 Shared-Action-Import — der harte Blocker
`@/app/anfrage/[token]/actions.ts` exportiert `speichereQuali`, `ladeMatching`, `bucheTermin`, `unterschreibeUndErstelleFall`, `speichereBeauftragungStep`, `promoteAnfrageZuLead`. Importiert von **route-neutralen, geteilten** Onboarding-Bausteinen:
- `src/components/onboarding/WizardClient.tsx:8` → `speichereBeauftragungStep, speichereQuali, unterschreibeUndErstelleFall`
- `src/components/onboarding/fields/TerminField.tsx:14` → `ladeMatching, bucheTermin`

**`WizardClient` läuft in DREI Routen** (nicht nur `/anfrage`):
- `src/app/anfrage/[token]/BeauftragungWizardStart.tsx:43` (`flowKey="beauftragung"`)
- `src/app/kunde/onboarding-details/page.tsx:115`
- `src/app/gutachter/willkommen/SvBasicOnboardingClient.tsx:33`

`TerminField` wird von `FieldRenderer.tsx:150` in **jedem** DynamicWizard gerendert. → **Modul-Level-Import auf die `/anfrage`-Route**: `/anfrage` löschen bricht Build/Bundle von **Kunde- + SV-Onboarding**, nicht nur `/anfrage`. (Auch wenn die beauftragung-spezifischen Actions in anderen flowKeys nicht *aufgerufen* werden — der Import allein ist die Build-Kopplung.)

### 3. v2-beauftragung-Pfad (`?wizard=v2`)
`/anfrage/[token]?wizard=v2` → `BeauftragungWizardStart` → `WizardClient(flowKey='beauftragung')`. Default ist noch `bespoke` (AnfrageStartClient). Dieser Pfad IST `/anfrage`-intern — verschwindet mit der Route, sobald die Issuance (1) weg ist.

## Gate-Kriterium
```
grep -rn "from '@/app/anfrage/\[token\]/actions'" src/        → 0
grep -rn "issueSelfServiceFlowLink|/anfrage/\$\{token\}" src/  → 0 (außer Migration/Docs)
+ SELF_SERVICE_AUTO_ISSUE entfernt / auf canonical umgestellt
+ 0 Reads auf self_service_token (außer der Drop-Migration)
```

## Ausführungs-Reihenfolge (wenn Gate sich öffnet)

1. **Decouple (un-gated, JETZT sicher machbar — der eine vorziehbare Schritt):** die geteilten Actions aus `app/anfrage/[token]/actions.ts` in eine **route-neutrale Lib** ziehen (z. B. `src/lib/self-service/booking-actions.ts`, `'use server'`), `/anfrage/actions` + `WizardClient` + `TerminField` re-importieren von dort. → Onboarding-Wizards (Kunde/SV) werden `/anfrage`-unabhängig; spätere Route-Löschung = no-op für sie. **Kein Verhaltens-Change, voller Build-Gate.**
2. **Issuance umstellen:** Cluster-LP von `issueSelfServiceFlowLink` → `issueCanonicalFlowLinkForAnfrage` (oder `SELF_SERVICE_AUTO_ISSUE` aus + Marketing-`/start` deckt die LPs). Verifizieren: echte LP-Anfrage → `/flow`-Link, nicht `/anfrage`.
3. **v2-beauftragung entscheiden:** entweder der `?wizard=v2`-Pfad wandert nach `/flow` (DynamicWizard-im-Flow) ODER er wird mit `/anfrage` retired (falls Marketing-`/start`→`/flow` ihn ersetzt). Aaron-Entscheidung.
4. **Route + Whitelist entfernen:** `app/anfrage/[token]/*` löschen + middleware-`'/anfrage'`-Whitelist raus. Knip-Baseline senken.
5. **Spalten droppen** (DDL via Plugin, nach 0 Reads): `self_service_token` + `_expires_at` + idx.
6. Voller Portal-Smoke (Kunde/SV-Onboarding unberührt? Cluster-LP→`/flow`?).

## Fazit
Phase C ist **mehrstufig + gated**, nicht „Route löschen". Der echte Blocker ist nicht das Issuance-Flag, sondern die **geteilten Onboarding-Bausteine, die `/anfrage`-Actions importieren** (Schritt 1). Schritt 1 ist der einzige **jetzt** sicher vorziehbare Decoupling-Schritt (entkoppelt Kunde/SV-Onboarding von der `/anfrage`-Route, ohne irgendwas zu deprecaten). Schritte 2–6 warten auf den Marketing-`/start`-Rollout (CANONICAL_FLOWLINK_ENABLED scharf) + Aaron-Go.
