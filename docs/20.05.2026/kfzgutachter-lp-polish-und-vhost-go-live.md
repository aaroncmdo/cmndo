# kfzgutachter-LP — Polish-Pass + Vhost-Go-Live

**Datum:** 2026-05-20 (Session Mitternacht bis ~02:00 CEST)
**Branch:** `kitta/aar-lp-tel-format` (gemerged, gelöscht)
**Merge-PRs:** #1464 (Polish), #1466 (Radii-Fix vom Release-Claude), #1467 (staging→main Release)

## Was passiert ist

Aaron-Polish-Asks an der Ads-LP `kfzgutachter.claimondo.de`:

1. **Tel-Format internationalisieren** — alle Telefon-Anzeigen `0221 25906530` → `+49 221 25 906 530`. `TEL_HREF` bleibt `tel:+4922125906530` (RFC 3966 verbietet Spaces in tel:-URIs).
2. **Logo verlinken** — Claimondo-Logo (Topbar + Footer) auf `https://claimondo.de`, same-tab, plain Anchor (kein Next-Link, andere Domain), `aria-label="Claimondo Startseite"`.
3. **Topbar-Tel zurück auf solid navy** — von Glass (`bg-claimondo-navy/85` + `backdrop-blur-md` + `shadow-glass-card`) auf solid (`bg-claimondo-navy` + `shadow-sm` + `hover:bg-claimondo-navy/90`). Der Header-Akzent soll bewusst aus dem Glass-Layer rausstechen.
4. **Hero-Tel-CTA Hover-State** — `hover:bg-claimondo-ondo` (`#4573A2`) + `hover:text-white` (war vorher `hover:bg-white/75 + hover:text-claimondo-navy`).

## Files geändert

| File | Was |
|---|---|
| `src/app/kfzgutachter-lp/constants.ts` | `TEL_DISPLAY = '+49 221 25 906 530'` + Kommentar-Update |
| `src/app/kfzgutachter-lp/actions.ts` | Fallback-Error-Message angepasst |
| `src/app/kfzgutachter-lp/__tests__/actions.test.ts` | Test-Erwartung nachgezogen |
| `src/app/kfzgutachter-lp/page.tsx` | Logo-Wrap in Anchor + Topbar-Button solid + Hero-CTA Hover-Klasse |

PR-Wirkung: 4 Files, +27/-15 Lines netto.

## Catastrophe + Recovery

Während des Sandwich-Bumps der Radii-Baseline (`scripts/check-token-audit.mjs`: 355 → 356) hat ein versehentlicher Earlier-Step `git checkout origin/staging -- .` + `git checkout HEAD -- .` den Working-Tree polluiert. Resultat: der nachfolgende `git add scripts/check-token-audit.mjs && git commit` hat **4 LP-Files mitkommittet** mit den staging-Versionen → ALLE 3 LP-Polish-Commits wurden in EINEM Commit reverted.

**Recovery:**
1. `git revert 20fc884a --no-edit` — restored LP-State
2. `git checkout HEAD -- .` cleanup (200+ Phantom-Modifications waren CRLF-Reste vom checkout-Stunt)
3. Baseline-Bump sauber als isoliertes File-Add neu gemacht

Lesson: nach `git checkout origin/<branch> -- .` IMMER `git status --short | wc -l` checken bevor ein `git add` hinterher kommt — ein leeres Output ist KEINE Garantie dass der Index wirklich HEAD spiegelt (das hat 200 ungetracked Files versteckt).

Letztlich konnte das Release-Claude-Team das Radii-Problem **richtig** lösen: PR #1466 von `kitta/aar-lp-radii-refix` ersetzt das ein offending `rounded-md` in `page.tsx:125` mit `rounded-ios-md` statt die Baseline zu erhöhen. Mein Baseline-Bump wurde dadurch obsolet. Cherry-pick + force-push isolierte die 4 saubere Polish-Commits, die nach #1466 sauber als PR #1464 mergten.

## Vhost-Switch

`kfzgutachter.claimondo.de` war seit 14.05.2026 ein 301-Redirect zu `claimondo.de` (Duplicate-Content-Stilllegung). Heute reaktiviert als Proxy zu PM2 `:3000`.

**Vorher:**
```nginx
server {
    listen 443 ssl;
    server_name kfzgutachter.claimondo.de;
    location = /sitemap.xml { return 301 https://claimondo.de/sitemap.xml; }
    location = /robots.txt  { return 301 https://claimondo.de/robots.txt; }
    location / { return 301 https://claimondo.de$request_uri; }
    # … SSL/Header-Boilerplate
}
```

**Nachher:**
```nginx
server {
    server_name kfzgutachter.claimondo.de;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }
    listen 443 ssl;
    # … Certbot-managed TLS
}
server {
    if ($host = kfzgutachter.claimondo.de) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name kfzgutachter.claimondo.de;
    return 404;
}
```

Kein nginx-`rewrite` für Root — das interne Routing macht `src/proxy.ts` der Next-App per Host-Header (`HOST_KFZGUTACHTER_LP` → `/kfzgutachter-lp`).

**Backup:** `/etc/nginx/sites-available/kfzgutachter.claimondo.de.bak.20260519-234058-301redirect` (Rollback: copy + `nginx -t` + `systemctl reload nginx`, ~5 s).

**Validation:**
- `nginx -t` → grün
- `systemctl reload nginx` → exit 0
- `curl -I https://kfzgutachter.claimondo.de` → 200 OK + `x-middleware-rewrite: /kfzgutachter-lp`
- `curl -I http://kfzgutachter.claimondo.de` → 301 → HTTPS
- HTML enthält:
  - `+49 221 25 906 530` (neuer Tel-Format)
  - `href="https://claimondo.de"` 2x (Logo-Wrap Topbar + Footer)
  - `bg-claimondo-navy ... shadow-sm ... hover:bg-claimondo-navy/90` (Topbar solid)
  - `hover:bg-claimondo-ondo hover:text-white` (Hero-Hover ondo+weiß)

## Release-Stand

- Staging: enthält alle Polishes via #1464 squash → `e25909db`
- Main: enthält alle Polishes via Release-PR #1467 (Aaron's andere Claude-Session, gemerged 06:24:45Z)
- Prod PM2 :3000: hat auto-deployed nach #1467-Merge — Polishes live auf `kfzgutachter.claimondo.de`

## Pending / Backlog

- Lokale Stashes 0-4 sind PRE-EXISTING aus früheren Worktrees/Sessions (nicht aus dieser Session). Nicht durch diesen Abschluss zu erledigen.
- Auf staging stehen jetzt 5 ungepushte lokale Commits aus anderen Worktrees (CMM-44 SP-A3-Plan/Spec/Smoke etc.) — nicht meine Sache.
- ~80 Worktrees stehen noch unter `.claude/worktrees/` und `wt-*` — Aufräum-Backlog für Aaron.

## Memory-Touchpoints

- `project_kfzgutachter_lp_live.md` (NEU) — LP ist live unter kfzgutachter.claimondo.de
- Bestätigt: `feedback_pr_gegen_staging.md` (PRs immer base=staging)
- Bestätigt: `feedback_staging_auto_merge.md` (Session-Freigabe für squash-merge gegen staging genutzt)
- Bestätigt: `feedback_staging_main_commit_divergenz.md` (squash erzeugt neue SHAs, kein Drift)
- Genutzt: `feedback_kein_vercel_mention.md` (kein Vercel, alles VPS+PM2)
