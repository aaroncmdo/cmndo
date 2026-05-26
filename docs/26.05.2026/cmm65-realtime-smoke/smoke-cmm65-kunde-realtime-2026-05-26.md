# CMM-65 §0 — Browser-Realtime-Smoke (Kunde) auf staging — 2026-05-26

**Ziel:** den einzigen offenen Verify-Punkt aus PR #1741 schliessen — liefert die
neue **claims**-Realtime-Subscription (`FallRealtimeRefresh`, 3. Leg faelle→claims)
den Live-Refresh der Fall-Seite im Browser? **Kunde ist der kritische Fall**: er
kann `gutachter_termine` nicht abonnieren (keine Kunde-SELECT-RLS dort), die
`claims`-Subscription ist also sein **einziger** Termin/Recency-Refresh-Pfad.

**Ergebnis: GRÜN für den Kunden (empirisch, Browser).** SV-Leg ist RLS-blockiert
(charakterisiert, mitigiert). Admin trivial gedeckt.

---

## 1 · Methode

Echte Browser-Session (Playwright/chromium) gegen `https://app.staging.claimondo.de`
(nginx-Basic-Auth), eingeloggt als Standard-Test-Kunde `test-kunde@claimondo.de`
(2FA aus). Spec: `tests/e2e/flows/smoke-cmm65-kunde-realtime.spec.ts`, Auth-Cache
via `tests/e2e/kunde-auth-setup.spec.ts` (storageState — kein Login pro Run, weil
staging POST `/login` unter Pool-Last 502t).

Ablauf:
1. Fall-Seite `/kunde/faelle/<id>` öffnen (mountet `<FallRealtimeRefresh claimId=…/>`).
2. Auf den Realtime-WebSocket (`/realtime/v1`) + SUBSCRIBED-Handshake warten.
3. `claims`-UPDATE triggern: service-role `PATCH /rest/v1/claims?id=eq.<claim>` mit
   `updated_at=now()` — **exakt was `touchClaimRecency` tut** (Recency-Bump).
4. Assert (a) das `postgres_changes`-Payload mit der `claim_id` kommt **nach** dem
   Trigger auf dem **Kunde-authentifizierten Socket** an → beweist, dass RLS den
   Kunden das claim-Row per Realtime lesen lässt; (b) `router.refresh()` feuert
   (RSC-Request).

**Test-Claim:** `test-kunde` → CLM-2026-00115, fall_id `65a7640b-…`, claim_id
`5b2757e1-…`. Es gilt `claims.geschaedigter_user_id = test-kunde` (die simple
Realtime-RLS-Gleichheit).

### Fixture-Vorbereitung (temporär, wieder zurückgesetzt)

Die Kunde-Fall-Seite hat zwei Gates **vor** dem Render (orthogonal zur Realtime-RLS):
1. **CMM-63 Ownership** (`getKundeFallDetailRecord`: `claim_parties.user_id ODER
   faelle.kunde_id ODER lead.email`). Der Fixture-Claim hatte
   `geschaedigter_user_id=test-kunde` **aber** keine passende `claim_parties`-Row
   und `faelle.kunde_id≠test-kunde` → `notFound()`. → temporär `faelle.kunde_id`
   auf test-kunde gesetzt (`80ff9fe2…`→`113aebe5…`).
2. **Onboarding-Gate** (`onboarding_complete=false` → Redirect `/kunde/onboarding`).
   → temporär `claims.onboarding_complete=true` gesetzt (war `false`).

**Beide nach dem Smoke 1:1 zurückgesetzt** (`kunde_id`→`80ff9fe2-6dbb-47a2-957a-59f8c1c6db02`,
`onboarding_complete`→`false`). Shared-DB ist sauber. (Nebenbefund: dieser Fixture-
Claim hat `geschaedigter_user_id` gesetzt, aber weder `claim_parties`-Geschädigter-Row
noch `faelle.kunde_id` — inkonsistente Alt-Test-Daten, kein Produktbug.)

---

## 2 · Ergebnis — Kunde (GRÜN)

```
[fall-page] url=…/kunde/faelle/5b2757e1-…        (rendert; CMM-63 kanonisiert fall_id→claim_id)
[realtime]  ws connected: 2 socket(s)
[trigger]   PATCH claims id=5b2757e1-… -> 204
[result]    claims realtime frame delivered to Kunde socket OK
[result]    router.refresh() fired OK
[summary]   claimFramesAfterTrigger=1  rscRefreshesAfterTrigger=7
1 passed (13.9s)
```

- Screenshots: `screens/01-kunde-fall-loaded.png`, `screens/02-kunde-fall-after-refresh.png`
  (gesunde, voll gerenderte Fall-Übersicht CLM-2026-00115 — kein Error/Onboarding/404).
- **Interpretation:** Das `claims`-UPDATE wird dem Kunde-authentifizierten Socket
  zugestellt → die einfache Policy `claims_kunde_sv_dispatch_select_consolidated`
  (`geschaedigter_user_id = auth.uid()`) ist realtime-tauglich (wie zuvor
  `faelle.kunde_id=auth.uid()`). Der Live-Refresh-Pfad des Kunden ist intakt.

**DB-Preconditions live (2026-05-26):** `claims` REPLICA IDENTITY FULL (`relreplident='f'`)
+ in `supabase_realtime`-Publication. Trigger-Realität bestätigt = wie Handoff
(40-Spalten-`trg_sync_faelle_to_claims` ist weg; nur `trg_claims_updated_at` all-col-bump
+ bidirektionaler sv_id-Sync).

---

## 3 · Nebenbefund — SV-claims-Leg ist RLS-blockiert (charakterisiert, mitigiert)

Die **live** `claims`-SELECT-Policy `claims_kunde_sv_dispatch_select_consolidated`
lautet:
```
(is_dispatcher() AND dispatcher_owns_lead(lead_id))
 OR geschaedigter_user_id = auth.uid()
 OR is_claim_user_party(id)
```
**Kein `is_sv_for_claim(id)`-Term** (anders als der FallRealtimeRefresh-Kommentar
behauptet — die Policies wurden seit dem Handoff konsolidiert). `is_claim_user_party`
prüft `claim_parties.user_id=auth.uid()` — ein SV ist **keine** claim-Party.

**Daten-Beweis:** von 50 SV-zugewiesenen Claims haben **0** den SV als aktive
claim-Party (`sv_also_active_party=0/50`). ⇒ **kein SV besteht die claims-SELECT-Policy**
⇒ der neue `claims`-Realtime-Leg liefert dem SV **nichts**.

**Mitigation / Impact:** Die `gutachter_termine`- + `auftraege`-Legs in
`FallRealtimeRefresh` sind durch CMM-65 **unverändert** (`fall_id`-gefiltert) → der
SV-Live-Refresh für **Termin/Auftrag**-Events ist nicht regressiert. Verloren geht
nur der Live-Refresh für **claims-only Recency-Bumps** (z.B. `touchClaimRecency` aus
briefing/dokumente, die nicht auch termine/auftraege schreiben) — vor CMM-65 fing
das der faelle-Leg (SV konnte `faelle` abonnieren). **Minor-Regression, nicht
release-kritisch.**

**Nuance für den Fix:** „einfach `is_sv_for_claim(id)` zur SELECT-Policy addieren"
ist **nicht trivial sicher** — CMM-60 hat SV-claims-Tabellen-SELECT **bewusst entfernt**
(„SV liest Claims nur noch über `v_claim_sv`", Lifecycle-Leck geschlossen). Eine
breite SV-SELECT-Policy auf der Tabelle könnte dieses Leck wieder öffnen. Optionen:
(a) als bekannt-minor akzeptieren; (b) gezielter SV-Realtime-Pfad (eigenes Ticket,
mit CMM-60-Kontext).

**Admin:** `claims_staff_all_consolidated` (`is_admin() OR …`) → Admin liest alle
Claims → Realtime-Leg funktioniert (gleicher Mechanismus; nicht separat gesmoket,
trivial korrekt).

---

## 4 · CMM-66-relevanter Messwert: claims.updated_at Clobber

`claims.updated_at`: **12 distinct values / 60 Rows** (max = 2026-05-26 02:00 Cron).
Heute früh war es ~1 distinct (Voll-Clobber durch SP-Backfills). Also **partiell
erholt, aber weiter niedrige Kardinalität** = Backfill-artefaktiert. Der CMM-66-Caveat
bleibt: **kein naiver Repoint** `fall_updated_at → claims.updated_at`. `created_at`-
Repoint bleibt sauber (claims.created_at ist kanonisch, NOT NULL, nicht moddatetime-getoucht).

View-Quellen live bestätigt:
- `v_claim_full.fall_updated_at` = `f.updated_at` (→ CMM-66; Consumer: pflichtdokumente-reminder Idle-Gating)
- `v_faelle_mit_aktuellem_termin.updated_at`/`.created_at` = `f.*` (→ CMM-66; makler-Order / created_at-Reads)
- `v_claim_listing.updated_at` = `c.updated_at` (bereits claims — kein Gap)

---

## 5 · Fazit

- **§0-Gate für den Kunden GRÜN** — der nächste staging→main-Release ist aus
  Realtime-Sicht für den kritischen Pfad freigegeben.
- SV-claims-Leg = bekannt-minor (mitigiert durch unveränderte termine/auftraege-Legs);
  Fix braucht CMM-60-Kontext → eigene Entscheidung.
- Smoke ist reproduzierbar: `kunde-auth-setup.spec.ts` (einmal) → `smoke-cmm65-kunde-realtime.spec.ts`.
  Benötigt die Fixture-Vorbereitung aus §1 (Ownership + Onboarding) für test-kunde.
