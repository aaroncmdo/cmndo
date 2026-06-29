# Artikel-Kommentare — Plan 3: Admin-Portal-Moderation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Admin kann im App-Portal ausstehende Kommentare freigeben/ablehnen/verstecken + Nutzer sperren.

**Architecture:** Haupt-App (`src/`, app.claimondo.de). Moderation = `requireRole(['admin'])`-gated Server-Actions, die via `createAdminClient()` (service-role) `article_comments.status` bzw. `community_profiles.is_blocked` setzen — **kein neues RLS nötig** (Auth-Gate ist der App-Guard; exakt wie der Foundation-Smoke approved). Marketing-Anzeige liest nur `approved` (Plan 1 RLS) → freigegebene Kommentare erscheinen nach `revalidatePath`.

**Tech Stack:** Next 16, untypisierter Supabase-Client (kein Types-Regen), `@/components/shared/DataTable`, `requireRole` aus `@/lib/auth/guards`.

## Global Constraints

- Server-Actions: `'use server'`, `requireRole(['admin'])` → `if (!auth.success) return { ok:false, error:'Nur Admin.' }`, `createAdminClient()`, `revalidatePath`, Result-Object `{ ok; error? }` — nie `throw`.
- Rolle: **`'admin'`** (kein `'redaktion'`-Rolle im System).
- Tabellen `article_comments`/`community_profiles` sind NICHT in `database.types.ts` — Client ist untypisiert, daher `.from('article_comments')` = `any`, kein Regen nötig.
- UI: `@/components/shared/DataTable` (kein handgerolltes Table-Markup). Semantische Tokens `bg-success`/`bg-danger`.
- nutzersichtbare Strings Deutsch + Umlaute.

## Tasks

### Task 1: Moderations-Actions (`src/app/admin/kommentare/actions.ts`)
`approveComment` / `rejectComment` / `hideComment` (setzen `status` + `moderated_at`) + `blockUser` (setzt `community_profiles.is_blocked`). Jede `requireRole(['admin'])`-gated, `createAdminClient()`, `revalidatePath('/admin/kommentare')`. (moderated_by = Folge, sobald GuardResult-Feld bestätigt.)

### Task 2: Moderations-Seite + Row-Actions
`src/app/admin/kommentare/page.tsx` (Server, `dynamic='force-dynamic'`): liest `pending` Kommentare via `createAdminClient()` (join `community_profiles(username)`, order created_at desc, limit 100), rendert DataTable (Nutzer · Artikel-Slug · Kommentar · Aktionen). `src/app/admin/kommentare/ModerationActions.tsx` (Client): Freigeben/Ablehnen/Sperren-Buttons (`useTransition`, ruft die Actions, Fehler via alert v1).

### Task 3: Nav-Eintrag
`src/app/admin/_components/AdminNav.tsx`: `{ href: '/admin/kommentare', label: 'Kommentare', icon: MessageSquareIcon }` ins `NAV_ITEMS`-Array.

## Akzeptanz
- [ ] `/admin/kommentare` listet pending Kommentare (admin-gated; Layout-Guard greift).
- [ ] Freigeben → `status='approved'` → erscheint öffentlich (Marketing, nach revalidate).
- [ ] Ablehnen/Verstecken/Sperren funktionieren.
- [ ] Haupt-App `tsc`/`build` grün, keine neuen Fehler.

## Offen (Folge)
- trusted/auto-approve (Trigger oder Counter) — Plan 4.
- moderated_by setzen (GuardResult-Feld) · Toast statt alert · approved-Liste/Undo.
