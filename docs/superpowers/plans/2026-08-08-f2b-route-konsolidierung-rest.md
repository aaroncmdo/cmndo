# F2b — Route-Konsolidierung VERVOLLSTÄNDIGEN (Listen + anlegen/basic-freigaben/leads/qr-pool)

> Fortsetzung von F2 (#5065, [id]-Details, gemergt). Ziel: KEINE dual-erreichbaren Legacy-SV/WS-URLs mehr — alle Rest-Routen kanonisch unter `/admin/vertrieb/*`, Legacy → 308. Gate: `tsc` + `check:redirect-stubs` + `next build` + Regel-4-Prod-Smoke (Routing hat keine Unit-Tests).

## KRITISCHE FAKTEN (verifiziert 08.08.)
- Alle vertrieb-Rest-Routen sind **Re-Exports** von Legacy (Content an Legacy):
  `vertrieb/sachverstaendige/{page,anlegen,basic-freigaben}` → `@/app/admin/sachverstaendige/{page,anlegen,basic-freigaben}/page`;
  `vertrieb/werkstaetten/{page,qr-pool,qr-pool/drucken}` → `@/app/admin/werkstaetten/{page,qr-pool,qr-pool/drucken}/page`.
  (SV `leads` hat KEIN vertrieb-Pendant — nur Legacy `admin/sachverstaendige/leads` + `admin/sv-leads`.)
- **Legacy-Listen redirecten schon** (next.config 399/400): `/admin/sachverstaendige` → `/admin/vertrieb`, `/admin/werkstaetten` → `/admin/vertrieb` (Dashboard). Die Listen-page.tsx sind also **shadowed** (nie gerendert) — ihre internen hrefs sind tot.
- **Legacy-`@drawer/(.)anlegen` + `(.)leads` sind TOT** (die Liste, von der aus man soft-navigiert, redirectet weg) → löschen ohne UX-Verlust. Die vertrieb-Konsole hat eigene anlegen/freigaben/qr-pool-Drawer (VertriebAktionsleiste + wizards/*DrawerContent).
- **NICHT anfassen (Import-Pfade, kein Nav):** `@/app/admin/sachverstaendige/anlegen/{constants,actions,AnlegenTabs}` · `.../basic-freigaben/BasicFreigabeRowActions` · `@/app/admin/werkstaetten/qr-pool/{QrPoolClient,flyer-actions}` · `qr-pool-actions`. Diese Module bleiben an ihrem Legacy-Ort (viele Importer). Nur die **`page.tsx`-Route-Slots** werden umbenannt + nur **Navigations-hrefs/router.push** migriert.
- Redirect-Ketten (next.config): 282 `karte`→`sachverstaendige`, 289 `sv-leads`→`sachverstaendige/leads`, 352 →`sachverstaendige/anlegen`, 460 `sachverstaendige/neu`→`sachverstaendige/anlegen`. Nach dem Redirect `sachverstaendige/anlegen`→vertrieb werden diese zu Doppel-Hops → Ziele direkt auf vertrieb ziehen.

## Global Constraints
Branch `kitta/f2b-route-konsolidierung-rest` (off staging, hat F2). Worktree-cwd + RELATIVE Pfade (Pfad-Falle!). PR → staging. Redirect NUR via next.config + page.tsx umbenennen (kein Redirect-Stub). Redirect-source für Kollektionen ist EXAKT-Match (kein `:path*`), damit Sub-Pfade (z.B. `qr-pool/drucken`) separat bleiben. Umlaute; 7-Punkt-Audit; Ratchets grün.

---

### Task A (SV-rest) — anlegen · basic-freigaben · leads + Liste
**Rename (raus aus dem Route-Slot; co-lokalisierte Module bleiben):**
- `admin/sachverstaendige/anlegen/page.tsx` → `AnlegenContent.tsx` (co-lokal `AnlegenTabs`/`constants`/`actions` bleiben).
- `admin/sachverstaendige/basic-freigaben/page.tsx` → `BasicFreigabenContent.tsx` (co-lokal `BasicFreigabeRowActions` bleibt).
- `admin/sachverstaendige/leads/page.tsx` → `LeadsContent.tsx`.
- `admin/sachverstaendige/page.tsx` (Liste) → `SvListeContent.tsx` (interne hrefs → vertrieb).
**Re-Exports umhängen:** `vertrieb/sachverstaendige/{anlegen,basic-freigaben,page}` → auf die neuen *Content. **NEU anlegen:** `vertrieb/sachverstaendige/leads/page.tsx` = `export { default } from '@/app/admin/sachverstaendige/leads/LeadsContent'` (+ `export const dynamic='force-dynamic'`).
**@drawer:** löschen `admin/sachverstaendige/@drawer/(.)anlegen/page.tsx` + `(.)leads/page.tsx` (tot). `@drawer/(.)[id]` ist schon von F2 weg; `default.tsx` bleibt.
**next.config Redirects ergänzen (EXAKT-Match je Route):**
`/admin/sachverstaendige/anlegen`→`/admin/vertrieb/sachverstaendige/anlegen` · `/admin/sachverstaendige/basic-freigaben`→vertrieb · `/admin/sachverstaendige/leads`→vertrieb. **Redirect-Ketten umbiegen:** 460 `sachverstaendige/neu`→ direkt `vertrieb/sachverstaendige/anlegen`; 289 `sv-leads`→ direkt `vertrieb/sachverstaendige/leads`; 352 Ziel → vertrieb/anlegen; 282 `karte` Ziel → vertrieb/sachverstaendige (Liste ist unter vertrieb).
**Nav-hrefs migrieren → vertrieb (NUR diese, keine Import-Pfade):** `SvListeContent.tsx:66,76,83,89` · `components/live-ops/DeadPinDrawer.tsx:239` (leads) · `lib/sv-basic/claim-actions.ts:437` (`adminPfad` basic-freigaben). **revalidatePath → vertrieb:** `admin/sv-leads/actions.ts` ×5 (`/admin/sachverstaendige/leads`).
**Verify:** tsc 0 · redirect-stubs grün · `grep -rn "/admin/sachverstaendige/\(anlegen\|basic-freigaben\|leads\)" src` = nur Redirect-sources + Import-Pfade (keine Nav) · git-status worktree-only.

### Task B (WS-rest) — qr-pool · qr-pool/drucken + Liste
**Rename:** `admin/werkstaetten/qr-pool/page.tsx`→`QrPoolContent.tsx` (co-lokal `QrPoolClient`/`flyer-actions` bleiben) · `qr-pool/drucken/page.tsx`→`QrPoolDruckenContent.tsx` · `admin/werkstaetten/page.tsx` (Liste)→`WsListeContent.tsx`.
**Re-Exports umhängen:** `vertrieb/werkstaetten/{qr-pool,qr-pool/drucken,page}` → auf die neuen *Content.
**next.config Redirects (EXAKT-Match):** `/admin/werkstaetten/qr-pool`→vertrieb · `/admin/werkstaetten/qr-pool/drucken`→vertrieb (separater Eintrag, EXAKT, sonst würde `qr-pool` `:path*` `drucken` schlucken — hier EXAKT beide).
**Nav-hrefs → vertrieb:** `WerkstaettenClient.tsx:70` (`router.push('/admin/werkstaetten/qr-pool')`) · `QrPoolClient.tsx:161,176` (drucken-links). **revalidatePath → vertrieb:** `admin/werkstaetten/qr-pool-actions.ts` ×2.
**Verify:** tsc 0 · redirect-stubs grün · `grep -rn "/admin/werkstaetten/qr-pool" src` = nur Redirect-sources + Import-Pfade · git-status worktree-only.

### Task C — Build + Ratchets + PR + Regel-4-Smoke-Plan
Voller `next build` + redirect-stubs + component-set/knip/token-audit grün. PR → staging (7-Punkt-Audit). Regel-4-Smoke: je Rest-Route curl 308 (anlegen/basic-freigaben/leads/qr-pool/drucken) + Negativ (kein Fehl-Fang) + Staff-Render der vertrieb-Route + `/neu`/`sv-leads`-Ketten landen direkt auf vertrieb (ein Hop).

## Self-Review-Fallen
(1) NUR page.tsx umbenennen — co-lokale Module (constants/actions/clients/AnlegenTabs/QrPoolClient/BasicFreigabeRowActions) BLEIBEN (Importer!). (2) Nav-hrefs vs Import-Pfade strikt trennen. (3) qr-pool vs qr-pool/drucken = zwei EXAKT-Redirects. (4) Redirect-Ketten (neu/sv-leads/karte/352) auf vertrieb umbiegen — sonst Doppel-Hop. (5) leads braucht ein NEUES vertrieb-page.tsx (hatte keins). (6) Legacy-@drawer(.)anlegen+(.)leads löschen (tot).
