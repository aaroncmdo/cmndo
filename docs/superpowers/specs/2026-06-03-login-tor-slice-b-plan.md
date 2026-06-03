# Login-Tor Slice B — Plan (Confirm + Relink + Surface)

**Stand 2026-06-03. Status: Plan (NICHT gebaut). Voraussetzung: PR #2360 (Engine + Slice A) gemergt.**

Folge-Schritt zu Slice A (`findOrphanPersonMatchesForUser`, read-only Detection, gebaut in #2360). Slice B macht aus den erkannten Orphan-Kandidaten eine **User-first-Self-Confirm** mit anschliessendem Relink. **Auth-nah + Write + aar-939-Hotpath → supervised, eigenes ruhiges Fenster, mit Aaron.**

---

## 1. Was Slice B tut

Nach Login findet Slice A Orphan-Shell-Personen (tier hart/stark), die wahrscheinlich = der User sind. Slice B:
1. **Surface:** dezenter, dismissbarer Hinweis „Wir haben einen möglichen früheren Vorgang gefunden — bist du das?" — **kein** PII-Detail vor Confirm (§13-A).
2. **Confirm-Action:** auf „Ja, das bin ich" → Relink der Orphan-Person an die Account-Person.
3. **§5-Matrix:** MVP = **nur Self-Confirm** (kein Auto-Write). Auto-Assign (Login + starker Match ohne Confirm) ist ein **späterer** Schritt — der gefährlichste Teil, separat.

## 2. Die §3-Entscheidung (Aaron) — Soft-Link vs. direktes Re-Pointen

| Ansatz | Mechanik | Reversibel | DDL nötig |
|---|---|---|---|
| **A — Soft-Link (Spec §8, empfohlen)** | `personen.canonical_person_id` (nullable self-FK) auf der Orphan-Person → Account-Person; Reads folgen dem Canonical | ja (Pointer lösen) | **ja** — additive Spalte + Reader müssen Canonical folgen |
| **B — Direktes Re-Pointen** | Orphan-`claim_parties.person_id` → Account-Person umhängen (wie `relinkPartyPersonOnAccount`, aber für ALLE Parteien der Orphan-Person) | schwer (kein Provenance) | nein |

**Empfehlung:** **Ansatz A** (Soft-Link) — entspricht der Spec (§3/§6/§8: aggressiv weil trivial reversibel) und vermeidet den irreversiblen Mass-Repoint. Kostet aber eine additive Spalte **+** Reader-Anpassung (Canonical folgen), was den Scope vergrössert. **Pragmatischer MVP-Kompromiss:** Ansatz B für die **Parteien** (Re-Point, sofort wirksam, nutzt bestehende Relink-Mechanik) **+** `canonical_person_id` als **Provenance-Marker** setzen (für spätere Trennbarkeit), Reader-Migration auf Canonical als Folgeschritt. → in der supervised Session mit Aaron final entscheiden.

## 3. Bau-Reihenfolge (TDD, supervised)

1. **(falls Ansatz A/Kompromiss)** additive Migration `personen.canonical_person_id uuid null references personen(id)` via `apply_migration` (Regel 2).
2. **Lib `confirmOrphanPersonIsMe(db, userId, orphanPersonId)`** (TDD, non-throwing Result-Object, Muster wie `ensure-person.ts`):
   - verifiziert: Orphan-Person hat **keinen** eigenen `user_id` (sonst = fremder Account → **Hard-Merge**, NICHT hier; ablehnen).
   - verifiziert: Account-Person (`personen.user_id = userId`) existiert.
   - re-pointed alle `claim_parties` der Orphan-Person auf die Account-Person (+ optional `canonical_person_id` setzen).
   - idempotent.
3. **Server-Action** (`'use server'`, Result-Object, `revalidatePath`) als dünner Wrapper um die Lib — ruft `requireUser`, prüft dass `orphanPersonId` wirklich in den Slice-A-Kandidaten des Users ist (kein beliebiges Re-Pointen!).
4. **Surface** (Post-Login, dismissbar) — ruft Slice A serverseitig, rendert den Hinweis nur wenn Kandidaten da; Confirm-Button → Action.
5. **Voller `npm run build`** (Route/Server-Action → Next-Validator), Smoke mit Screenshot.

## 4. Sicherheits-Gates (hart)

- **§2-Invariante:** Relink ändert `claim_parties.person_id` (Dedup-Ebene), **nie** RLS/Access auf `person_id`. Zugriff bleibt an `user_id`/Party-Membership.
- **Confirm-Authz:** die Server-Action darf nur Orphan-Personen relinken, die `findOrphanPersonMatchesForUser(userId)` **für genau diesen User** liefert — nie eine vom Client beliebig übergebene `personId` ohne Re-Check (sonst Claim-Hijack).
- **Orphan mit eigenem Account = Hard-Merge** (zwei echte Logins) → **nicht** Slice B; braucht Provenance + Trenn-Funktion (Spec §6), eigener gegateter Schritt.
- **§13-A:** Surface zeigt minimal, PII-Detail erst nach Confirm.
- **Koordination:** Touchpoints (Post-Login, evtl. `/flow`) überlappen mit aktiven `aar-939`/`aar-956-flow-booking`-Sessions → vor Bau abstimmen.

## 5. Akzeptanz

- User mit Orphan-Match sieht Confirm-Hinweis; „Ja" hängt die Orphan-Parteien an seinen Account; Reload zeigt die Vorgänge unter seinem Account.
- User ohne Match sieht nichts.
- Fremder Account (Orphan mit `user_id`) wird **abgelehnt** (kein stiller Merge).
- Beliebige `personId` an die Action (nicht in den Kandidaten) → abgelehnt.
- Lib TDD grün, voller Build grün, Smoke-Screenshot.
