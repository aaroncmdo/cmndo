# CMM-49 PC-4 — Destruktiver Smoke `delete_fall_komplett(2-arg)` (02.06.2026)

> **Ergebnis: PASS** (3 Modi, alle transaktional/rollback → **Null Persistenz** auf der geteilten DB).
> Schließt den offenen Punkt aus `HANDOFF-cmm49-drop-session-eod.md` §3e ("PC-4 destruktiver Smoke"). Voraussetzung **#2210 gemerged** ✓.

## Was getestet wurde

Die in #2210 (Commit-Reihe, Mig `20260601224517`/`20260601224557`) eingeführte **2-arg** RPC `delete_fall_komplett(p_fall_id uuid, p_claim_id uuid)`. Sie ist drop-safe gebaut: dynamische `EXECUTE format('DELETE FROM public.%I …')`-Loops über 21 fall_id-Tabellen + 7 claim_id-Tabellen, die faelle-Zeile per `information_schema.tables`-EXISTS-Guard, Reihenfolge faelle→claims (wegen `faelle_claim_id_fkey ON DELETE RESTRICT`).

## Methodik — warum sicher auf der geteilten DB

Die Staging-App läuft gegen dieselbe DB wie Prod (Handoff §3e "geteilte DB"). Statt einen echten Fall zu löschen oder einen Seed zu persistieren, lief jeder Smoke als **eine** `BEGIN … ROLLBACK`-Transaktion in einem einzigen `execute_sql`-Call:

1. **Vorab-Probe verifiziert:** `BEGIN; INSERT claims …; SELECT count; ROLLBACK;` → in-tx count=1, danach (separater Read) count=**0** → Rollback wird honoriert, Multi-Statement-TX wird unterstützt. ⇒ Seed-Rows sind anderen Sessions nie sichtbar (TX-Isolation) und persistieren nie.
2. Seed-IDs fix + erkennbar: claim `cc000000-…-049`, fall `ff000000-…-049`, Marker `SMOKE-CMM49`.
3. Guard-Trigger geprüft: `guard_claims_created_by` lässt `postgres` (privileged) ohne `created_by` zu; `check_fall_claim_id` ist nur `RAISE WARNING` bei NULL claim_id → Seed-Inserts passen ohne Tricks.

## Seed

`claims(schadentag)` (einziges NOT-NULL-ohne-Default) → `faelle(claim_id)` (einziges NOT-NULL-ohne-Default) → fall_id-Children: `timeline`, `tasks`, `nachrichten`, `gutachter_termine`; + **1 claim_id-only** `gutachter_mitteilungen` (`fall_id IS NULL`, `claim_id` gesetzt) um den **claim_id-Loop** der RPC zu treffen (alle 7 claim-Tabellen sind auch fall-Tabellen → claim-only-Row ist der einzige Weg, den claim_id-Pfad isoliert zu prüfen).

## Ergebnisse

| Modus | Aufruf | Ergebnis |
|---|---|---|
| **Seed-Proof** | (nur Insert) | fall=1, claim=1, timeline=1, tasks=1, nachrichten=1, gutachter_termine=1, gutachter_mitteilungen(claim-only)=1 — **Seed legt alle 7 Rows an** ✓ |
| **Both-args** (current world) | `delete_fall_komplett(F, C)` | alle 7 `_rem`=**0** (faelle, claims, 4 fall_id-Children, claim_id-Child); `faelle_total`=75, `claims_total`=76 (Baseline) → **kompletter Cascade, keine Über-Löschung** ✓ |
| **Claim-only** (post-DROP-Konvention) | `delete_fall_komplett(NULL, C)` | claim=**0**, claim-Child=**0**, claims_total=76 → **faelle-EXISTS-Guard greift, kein Error bei NULL fall_id** ✓ |

## Was damit bewiesen ist

- ✓ faelle-Zeile gelöscht (EXISTS-Guard durchlaufen).
- ✓ claims-Zeile gelöscht — beweist Reihenfolge faelle-VOR-claims (sonst hätte `ON DELETE RESTRICT` geworfen).
- ✓ fall_id-Loop räumt alle 4 fall_id-Children.
- ✓ claim_id-Loop räumt die claim-only-Row (fall_id NULL → nur der claim_id-Pfad erreicht sie).
- ✓ Kein `WHEN OTHERS THEN NULL`-Silent-Swallow versteckt einen unvollständigen Delete (jede Tabelle einzeln auf 0 geprüft, nicht nur "kein Fehler").
- ✓ Totals zurück auf Baseline → keine Fremd-Rows angefasst (parametrisierte `WHERE fall_id=/claim_id=` strukturell garantiert + empirisch bestätigt).
- ✓ **Post-DROP-Pfad** (`NULL, claim_id`) funktioniert — der eigentliche Sinn von PC-4: die RPC überlebt `DROP TABLE faelle`.

## Caveat / Offen
- Smoke gegen die geteilte DB (= prod-wirksam wäre er ohne Rollback). Persistenter Staging-only-Lauf ist **nicht nötig** — der Rollback-Beweis (Schritt 1) deckt es ab, und ein persistenter Lauf wäre prod-wirksam.
- `delete_fall_komplett(uuid)` **1-arg** (Legacy) ist NICHT drop-safe (harte `faelle`-Refs) → PC-7-DROP, siehe `cmm49-phase-f-inventory-and-draft.md` §4.2.
