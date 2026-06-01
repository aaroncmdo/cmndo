# Handoff — CMM-73: `v_claim_phase` Begutachtung aus `gutachter_termine` ableiten

**Datum:** 01.06.2026 · **Quelle:** §6.5-Reader-Welle (CMM-69/72), Session `cmm-49-t1-2-cutover`
**Ticket:** [CMM-73](https://linear.app/aaroncmndo/issue/CMM-73) (Priorität **LOW**) · Parent CMM-44 · related CMM-49/69/72
**Empfohlener Owner:** die **Termin-Engine-Session** (`kitta/unisone-termin-engine`) — sie berührt `v_claim_phase`/Termine ohnehin. `v_claim_phase` ist eine **geteilte Kern-View** → nicht solo, vorher abstimmen.

---

## TL;DR (was du raffen musst)

`v_claim_phase` (SQL) und ihr TS-Zwilling `getClaimLifecycle` leiten die **Begutachtungs**-Phase **nur aus `auftraege.erstgutachten`** ab — **nicht** aus `gutachter_termine`. Ein Claim mit **aktivem SV-Termin, aber (noch) ohne erstgutachten-Auftrag** fällt deshalb auf `erfassung` / `sub_phase = vollmacht_offen` zurück → das Dashboard-Badge zeigt „Vollmacht offen", obwohl ein Besichtigungstermin existiert.

- **Live-Größe: genau 1 Claim** (Stand 01.06.). **Nicht dringend, nicht blockierend.**
- Die **funktionalen** Folgen sind bereits abgefangen: CMM-69 floor't die Section-Sichtbarkeit über `aktueller_termin_start`, CMM-72 den Abrechnungs-Scope über `_hasGutachten`. **Residual = rein kosmetisch** (das eine Badge).
- **Blockiert NICHT** b″/CMM-49 — die §6.5-Reader sind gegen die Lücke abgesichert.

> Wenn du knapp an Zeit bist: das hier kann warten. Es ist ein Korrektheits-/Robustheits-Fix, kein Bug mit Live-Schaden.

---

## Erst entscheiden: Daten-Fix ODER Derivation-Fix?

**Wahrscheinlichere Wurzel:** Die **Termin-Anlage erzeugt keinen `erstgutachten`-Auftrag.** Im sauberen Flow bekommt ein Fall mit SV-Termin einen `auftraege`-Eintrag (`typ='erstgutachten'`, `status='termin'`) → dann derivt die Phase **schon heute korrekt** auf begutachtung/termin. Die 1 Lücke ist evtl. einfach ein Fall, dem dieser Auftrag fehlt.

→ **Prüfe zuerst:** Wird beim Termin-Setzen (gutachter_termine INSERT / Dispatch-Zuweisung) verlässlich ein `erstgutachten`-Auftrag angelegt? Falls **nein** → der Fix ist **dort** (Daten-Pipeline), NICHT in der Ableitung. Das wäre der **kleinere, sauberere** Fix und vermeidet den parity-gegateten View-Umbau unten.

Nur falls „Termin ohne Auftrag" ein **gewollter** Zustand ist (z. B. Termin vor formaler Auftragserstellung), lohnt der Derivation-Fix:

---

## Scope B — Derivation-Fix (falls nötig; GROSS, **parity-gegated**)

`v_claim_phase` **muss bit-parity** zu `getClaimLifecycle` bleiben (North-Star-Gate). Beide Seiten ändern + Test grün halten.

1. **`src/lib/claims/lifecycle.ts` → `getClaimLifecycle`:**
   - `ClaimLifecycleInput` um die SV-Termin-Info erweitern (z. B. `hatAktivenSvTermin: boolean` oder die `gutachter_termine`-Rows).
   - Im Begutachtungs-Zweig (aktuell `if (erstgutachten && erstgutachten.status !== 'abgeschlossen')`) **vor** dem Erfassungs-Fallback einen Branch ergänzen: aktiver SV-Termin (nicht `kb_beratung`, nicht cancelled, status reserviert/bestaetigt/gegenvorschlag) **ohne** aktiven erstgutachten-Auftrag → `mainPhase='begutachtung'`, `subPhase='termin'` (bzw. `besichtigung`, falls Termin in der Vergangenheit — analog `lib/gutachter/subphase.ts`).
   - **Caller-Plumbing:** `getClaimLifecycleForClaim` (Loader) + alle Caller müssen die `gutachter_termine`-Info beschaffen + durchreichen. (Heute lädt der Loader nur lead/auftraege/kanzleiFall/claimStatus.)
2. **`v_claim_phase` (Migration via Supabase-Plugin, Regel 2):** denselben Branch in die SQL-`CASE`-Logik (main_phase + sub_phase) einbauen — bit-gleich zu (1). Die View joint bereits `auftraege` per LATERAL; analog `gutachter_termine` joinen (aktueller Termin).
3. **Parity-Test grün halten** (getClaimLifecycle ↔ v_claim_phase). Falls kein Test existiert: einen Fixture-Fall „Termin ohne Auftrag" ergänzen.
4. **App-weiter Ripple verifizieren:** ALLE Phasen-Consumer zeigen betroffene Faelle dann als termin/begutachtung statt vollmacht_offen — Dashboards (#2160), Kanban, Fallakte-Pipeline, makler, die §6.5-Reader (CMM-69/72). Smoke auf staging. **Korrigiert auch die Dashboard-Badges aus #2160.**

---

## Live-Verifikations-Queries (Größe re-checken vor Bau)

```sql
-- Echte Lücke: aktiver SV-Termin, aber kein aktiver erstgutachten-Auftrag → wohin derivt?
SELECT vcp.main_phase, vcp.sub_phase, count(*)
FROM claims c JOIN v_claim_phase vcp ON vcp.claim_id = c.id
WHERE EXISTS (SELECT 1 FROM gutachter_termine gt WHERE gt.claim_id=c.id
        AND gt.cancelled_at IS NULL AND gt.typ<>'kb_beratung'
        AND gt.status IN ('reserviert','bestaetigt','gegenvorschlag','abgeschlossen'))
  AND NOT EXISTS (SELECT 1 FROM auftraege a WHERE a.claim_id=c.id
        AND a.typ='erstgutachten' AND a.status<>'abgeschlossen')
GROUP BY 1,2;
-- 01.06.: 1 Zeile (erfassung/vollmacht_offen). Wenn das 0 ist → erledigt sich von selbst.
```

(Project-ID `paizkjajbuxxksdoycev`; **GETEILTE prod+staging-DB** → nur `execute_sql` READ.)

---

## Regeln / Koordination

- **Regel 2:** View-Änderung NUR via Supabase-Plugin `apply_migration` (dann File committen, getrackte Version). Kein raw DDL.
- **PR gegen `staging`** (Regel 1), nie main.
- **Geteilte Kern-View + viele aktive Sessions** → vor `v_claim_phase`-Touch kurz mit der Termin-Engine-Session + CMM-50 abstimmen (Datei-/View-Kollision).
- Mehrere Sessions parallel → eigener Worktree (`node scripts/new-session-worktree.mjs cmm-73-… staging`).

## Querverweise
- §6.5-Kontext + b″-Gate: `docs/31.05.2026/T1.2-claims-status-cutover-handoff.md` (§6.5)
- North-Star (Parity-Gate, Lifecycle): `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md` §6
- Vorbild für Termin-Datums-Logik: `src/lib/gutachter/subphase.ts` (svTermin/nachTermin24h → termin/vor-ort/gutachten-erstellen)
- Schon abgesichert (Floors als Referenz): PR #2167 (CMM-69, `phase-config.ts` getVisibleSections-Floor) · PR #2169 (CMM-72, `_hasGutachten`-Scope)
