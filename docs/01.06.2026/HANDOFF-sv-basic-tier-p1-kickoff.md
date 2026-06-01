# HANDOFF — SV Basic-Tier, Kickoff P1 (Claim-Flow)

**Datum:** 2026-06-01 · **Für:** frische Session zum Ausführen von P1.

## Was ist SV Basic-Tier?
Kostenloser, **self-onboardender** Sachverständiger als sauberer **Fallback** im Matching. Er beansprucht (GMB-artig) seinen vorhandenen DAT-Kalt-Pin, durchläuft ein dynamisches Onboarding, wird vom Team in 48 h freigegeben, erscheint dann auf der Karte (kurzes Profil) + im Matching als Fallback, zahlt pro Lead (30 % Einzelpreis, inbound — wir fassen sein Honorar nie an).

## Lies das zuerst (in dieser Reihenfolge)
1. **Spec (ganze Vision P0–P5):** `docs/superpowers/specs/2026-06-01-sv-basic-tier-self-service-onboarding-design.md`
2. **P1-Plan (dein Auftrag):** `docs/superpowers/plans/2026-06-01-sv-basic-tier-p1-claim-flow.md`
3. **Memory:** `project_sv_basic_tier.md` (alle gelockten Entscheidungen E1–E10 + Stand)

GitHub (Branch `kitta/sv-onboarding-audit`):
- Spec: https://github.com/aaroncmdo/cmndo/blob/kitta/sv-onboarding-audit/docs/superpowers/specs/2026-06-01-sv-basic-tier-self-service-onboarding-design.md
- P0-Plan: https://github.com/aaroncmdo/cmndo/blob/kitta/sv-onboarding-audit/docs/superpowers/plans/2026-06-01-sv-basic-tier-p0-datenmodell.md
- P1-Plan: https://github.com/aaroncmdo/cmndo/blob/kitta/sv-onboarding-audit/docs/superpowers/plans/2026-06-01-sv-basic-tier-p1-claim-flow.md

## Stand
- **P0 (Datenmodell) ✅ GEMERGT auf staging (#2193, mergeCommit 61801b78), live auf DB.** Enthält: `sv_leads.konvertiert_zu_sv_id/konvertiert_am/claim_status`; `sachverstaendige.onboarding_quelle` + `verifizierung_status`+'abgelehnt'; `PAKET_PRIO['basic']=0` + `istKontingentBlockiert()` in `src/lib/dispatch/findBestSV.ts`.
- **P1 = dein Job.** Plan ist vollständig (bite-sized, TDD, Adversarial-Punkte).

## Erster Schritt (P1 Task 0)
```bash
git fetch origin staging
node scripts/new-session-worktree.mjs sv-basic-p1-claim staging
# im Worktree: node_modules-Junction anlegen (New-Item -ItemType Junction) fuer vitest/tsc
```
Dann subagent-driven nach dem P1-Plan. Supabase **project_id = `paizkjajbuxxksdoycev`** (DDL nur via Plugin `apply_migration` → recorded-version-File).

## 🔴 Kritische Reminder
- **P1 ist sicherheitssensibel** (anon → Auth-Account via service-role + RLS + Public-Route). Adversarial-Quality-Review PFLICHT, Auth-Smokes gegen ECHTE Constraints (nicht Mocks), Rate-Limit + Email-Dedupe vor erstem echten anon-Claim.
- **Live-RLS/Schema vor jeder Migration prüfen** (`information_schema`/`pg_policies`) — andere Sessions droppen parallel.
- **Anon-Suche NICHT über verbreiterte anon-RLS** — service-role-Action mit Minimal-Projektion (kein DAT-Listen-Leak).
- **Karten-Sichtbarkeit (P4)** muss den anon-GRANT-Constraint #2177 wahren (REVOKE ALL anon + GRANT nur Map-Spalten).
- Branch off staging, PR gegen staging, **nicht selbst mergen**, 7-Punkte-Audit, Umlaute in UI, Result-Object in Server-Actions.

## Wiederverwenden (im Code vorhanden)
- Account-Erzeugung: `src/app/admin/sachverstaendige/anlegen/actions.ts:anlegeSv` (createUser→profiles→sachverstaendige + Rollback-Kaskade + calculateIsochrone).
- Magic-Link: `src/lib/magic-link/dispatch-magic-link.ts` + `flows.ts`.
- WA-Reachability: `src/lib/whatsapp/availability.ts` (entity 'profile'); Phone-Verify: `src/lib/twilio/verify-client.ts`.
- Leadpreis (P5): `src/lib/leadpreis.ts` (Einzel 30 %).
- Wizard-Engine (P2): `onboarding_phasen`/`onboarding_felder` + `src/components/onboarding/WizardClient.tsx` + `load-needed-phases.ts`.

## Offene Aufräum-Items (diese Session)
- Worktrees `.claude/worktrees/sv-onboarding-audit` (Docs, Branch kitta/sv-onboarding-audit, kein PR) + `.claude/worktrees/sv-basic-p0-datenmodell` (P0, gemergt) existieren noch. Können entfernt werden (`git worktree remove`; bei sv-basic-p0 zuerst node_modules-Junction via `cmd rmdir` lösen).
- Spec/Pläne liegen auf `kitta/sv-onboarding-audit` OHNE PR (reine Referenz). Optional: Docs-PR gegen staging.
