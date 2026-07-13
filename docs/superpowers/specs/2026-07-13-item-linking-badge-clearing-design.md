# Design: Feed/Task item linking + unified notification-badge clearing (all roles)

**Status:** design approved by Aaron (2026-07-13, "das passt" + "eigentlich alle rollen" + "die anderen 1en mit").
**Branch:** `kitta/notif-badges-item-linking` (off staging).
**This is Project A** of a larger request. Project B (roll out **search** to portals that lack it) is a separate spec → not covered here.

## Goal

Two coupled UX fixes, delivered through the **shared** components so they land across **every role/portal** at once:

1. **Item → detail linking.** Every task/update list item is fully clickable and opens the *detail view of the thing it is about* (the entity: Fall / Lead / SV / …) — via one shared resolver. Today many items are not fully clickable (cell-only links, static `<div>` cards, `href="#"` dead links).
2. **Unified badge clearing.** Every red "1" count badge behaves consistently:
   - **Notification badges** ("something new to look at") clear when **seen**.
   - **Work/alert badges** ("open action items") use a **two-tier** model: **unseen = red count → seen = grey/muted (still open) → done (`erledigt`) = gone**.
   - Invariants: **no badge stays bright-red after you've looked at it**, and **no open work becomes invisible** (a persistent open-work count remains, just not as "new").

## Load-bearing current state (recon 2026-07-13)

**Linking**
- The shared **`UpdatesNav`** bell-feed (`src/components/shared/updates/UpdatesNav.tsx` + `UpdateItem.tsx`) items DO navigate → entity detail via **`routeForKontext`** (falls→Fallakte per role, leads→`/dispatch/leads/{id}`, rueckruf→`/dispatch/rueckrufe?open={id}`, etc.). This is the reference pattern.
- **Task lists are the gap:** admin `KanbanBoard` TaskCard links only the entity cell; admin `MyTasksClient` links only the Fall cell (not full-row); **Gutachter** task cards are static `<div>` with an inline Fall-link only; `mitarbeiter/tasks` is already full-row `<Link>`. No `/tasks/{id}` detail route exists (and we are NOT adding one).
- Dispatch `rueckrufe` rows link only the name cell.

**Badges (~30 files, built on shared primitives):** `TasksPill`, `RealtimeCountView`/`RealtimeCountBadge`, `NeueTermineBadge`, `DropletBadge` (primitive), `PortalNav`, plus per-portal shells (`AdminNav`, `DispatchNav`, `MitarbeiterNav`, `KanzleiNav`, `GutachterShell`, `MaklerShell`, `WerkstattShell`, `FlotteManagerShell`).

Two clearing models already exist, **inconsistently applied**:

| Badge | File | Category | Count source | Clears today | Target |
|---|---|---|---|---|---|
| UpdatesNav **action pill** (red) | `updates/UpdatesNav.tsx:125` | work/alert | `get_updates_action` RPC, `modus='action'` | **only on DB-resolve (`erledigt`); NOT on seen** ← the confusing one | two-tier (seen→grey, done→gone) |
| UpdatesNav info-dot (blue) | `updates/*` | notification | unseen info items vs `updates_last_seen_at` | on "Alles gesehen" | keep (seen-clear) |
| **Kalender / Rückrufe** nav count | `NeueTermineBadge.tsx`, `AdminNav`/`DispatchNav` | notification | `admin_termine typ=rueckruf status=offen gesehen_am IS NULL` | on rueckrufe-page load (`gesehen_am`) | keep (seen-clear), make trigger consistent |
| Gutachter `neueTermine` | `GutachterShell.tsx` | notification | `gutachter_termine gesehen_am IS NULL` | on fall-open | keep (seen-clear) |
| Gutachter `auftraege` | `GutachterShell.tsx` | work | open auftraege | on resolve | open-work count (optional two-tier) |
| `TasksPill` | `shared/TasksPill.tsx` | work | open tasks assigned to user | on `erledigt`/`blockiert` | open-work count (see Open Decision 1) |
| `FallCardBadges` (red) | `faelle/FallCardBadges.tsx` | notification | `count_unread_updates` RPC per fall | on `fall_read_states` update | keep (seen-clear); verify write-path |
| Chat unread (`GlobalPosteingangFab`, `PinnedChatBubble`, Kunde chat, `MitarbeiterNav` posteingang) | various | notification | `nachrichten gelesen=false` | on read (`gelesen=true`) | keep (seen-clear) |
| `MobileUpdatesDot` | `updates/MobileUpdatesDot.tsx` | notification | actionCount>0 OR newInfoCount>0 | mixed | follow the action-pill + info-dot rules |

## Design

### Part 1 — Item → detail linking (all roles)

- **Single resolver.** Reuse/extend **`routeForKontext`** (the existing update-item resolver) so *task* items resolve to the same targets. Linking logic stays in ONE place for all roles.
- **Shared clickable wrapper.** A small shared component (e.g. `shared/ClickableItemRow` or extend `UpdateItem`'s pattern) that makes the whole row/card a navigation target, with a **click-through guard**: clicks that originate on an interactive control (`button`, `a`, `select`, `[role=button]`, drag handle, `[data-no-nav]`) do NOT trigger navigation. Keyboard-accessible (Enter/Space, `role`, focus ring).
- **Apply to the gap surfaces:** Gutachter task cards (static → clickable), admin `MyTasksClient` rows (cell-only → full-row), admin `KanbanBoard` TaskCard (card body → nav, keep drag + status controls), dispatch `rueckrufe` rows, and any per-portal task/update lists (makler/werkstatt/kanzlei/kunde/flotte) found during build.
- **Target = the entity detail** (no new task-detail page). Items with **no** navigable target render **explicitly non-clickable** (remove `href="#"` dead links; cursor default, no hover affordance).

### Part 2 — Unified badge clearing (all roles)

- **Taxonomy drives behavior** (table above): notification badges → *seen clears*; work/alert badges → *two-tier*.
- **Seen-state infra.**
  - Notification badges mostly already have per-item seen state (`admin_termine.gesehen_am`, `gutachter_termine.gesehen_am`, `nachrichten.gelesen`, `profiles.updates_last_seen_at`, `fall_read_states`). Work = ensure each **clears on the right "seen" trigger** and renders consistently (red → hidden at 0). Fix any that don't (e.g. `FallCardBadges` write-path if missing).
  - The **action pill** two-tier needs a *seen cursor for action items*: new column **`profiles.actions_last_seen_at timestamptz`** (DDL via Supabase plugin, Regel 2). **Red count** = action items with `max(erstellt/updated) > actions_last_seen_at` (unseen). Opening the feed advances the cursor → previously-counted items render **grey/muted** (seen, still open) and drop out of the red count. Clicking an item to its detail also marks it seen (advances cursor to ≥ that item). Item disappears entirely only when its DB state resolves (`erledigt`) — unchanged.
- **Centralize the render.** The shared badge components (`RealtimeCountView`/`RealtimeCountBadge`, `NeueTermineBadge`, `DropletBadge`, `TasksPill`) get a consistent **tone** convention: `unseen` (danger/red), `seen-open` (muted/grey — work badges only), hidden at 0. Two-tier = a **count-split + tone** concern centralized here, so per-portal shells don't each reimplement it.

## DDL

- **One column:** `profiles.actions_last_seen_at timestamptz` (nullable). Applied via `mcp__plugin_supabase_supabase__apply_migration` (Regel 2), migration file named to the plugin-recorded version (Regel 2 step 3+4). No other schema changes — reuse existing `gesehen_am`/`gelesen`/`updates_last_seen_at`/`fall_read_states`.

## Boundaries & coordination

- **Shared components in play:** `updates/UpdatesNav` + `UpdateItem`, `TasksPill`, `RealtimeCountView`/`Badge`, `NeueTermineBadge`, `DropletBadge`, `routeForKontext`, `PortalNav`, per-portal shells.
- **⚠ Overlap — portal-header-phase2 (session `7ca8e37c`, `docs/superpowers/2026-07-13-HANDOFF-portal-header-phase2.md`):** they are reworking the portal **header/nav layout**. To avoid trampling: this project touches the **badge/count components + seen-logic + feed-item click behavior**, NOT the header/nav layout structure. Coordinate via marker; if their header work lands first, rebase the badge changes onto it. Prefer editing the badge components (`NeueTermineBadge`, `RealtimeCountView`, `TasksPill`, `UpdateItem`) over the shell layout files where possible.
- **⚠ #4200** already touched a makler "Badge-Tone" (staging tip). Re-verify makler badge rendering before editing `MaklerShell`/makler badges.
- Coordination marker written for these sessions (see memory `COORDINATION-notif-badges-item-linking-*`).

## Testing

- **Unit (pure, no DB):** the action-item seen-split (unseen vs seen-open count given a cursor + item timestamps); `routeForKontext` for the added task-item kontext types.
- **Component/source-guard:** the clickable wrapper's click-through guard (control clicks don't navigate; row click does); badge tone mapping (unseen=red, seen-open=grey, hidden at 0).
- **Build + ratchets:** `npm run build` green (heap-bumped), tsc 0, knip/token-audit/component-set `0 neu` (new shared component must use primitives/tokens — no raw Tailwind badge colors).
- **Prod Playwright smoke (mandate):** click a task item → lands on the correct detail; open the feed → red action count dims to grey (not gone); resolve an item → grey item disappears; a Kalender/Rückruf badge clears after visiting the surface. Test accounts per broadcast.

## Out of scope

- Search rollout (Project B).
- A dedicated `/tasks/{id}` detail page (items route to their entity).
- Changing WHICH items are "action" vs "info" (the RPC categorization stays; we only change how badges clear + items link).
- Header/nav **layout** (owned by portal-header-phase2).

## Open decisions (for Aaron's spec review)

1. **`TasksPill`** — leave as a plain persistent "open work" count (clears on `erledigt`), or also two-tier it (new-since-seen red, seen-open grey)? Recommendation: **leave as-is** (it's understood as a workload number, not a "new" alert); the two-tier focus is the UpdatesNav action pill. 
2. **"Seen" trigger granularity** — mark action items seen on **feed-open** (bulk, simplest) and additionally on **item-click** (that item). Recommendation: **both**.

## Decomposition (for the plan)

- **Slice A1 — Linking:** shared clickable wrapper + `routeForKontext` extension + apply to the task-list gaps. (No DDL.)
- **Slice A2 — Badges:** `actions_last_seen_at` DDL + two-tier count-split + shared badge tone convention + wire "seen" triggers + unify the notification-badge clears.
