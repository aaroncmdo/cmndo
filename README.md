This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Development Workflow

### Branch-Strategie

| Branch | Zweck | Vercel |
|--------|-------|--------|
| `main` | Production | Production Deploy |
| `staging` | Preview / QA | Preview Deploy |
| `feature/*` | Feature-Branches | Preview Deploy |

### PR-Workflow

1. Feature-Branch von `main` erstellen
2. Entwicklung + lokale Tests
3. PR gegen `staging` oeffnen
4. CI laeuft automatisch (typecheck, lint, build)
5. Review + Merge in `staging`
6. QA auf Preview-URL testen
7. Aaron mergt `staging` -> `main` fuer Production Deploy

### CI Pipeline

Bei jedem Push und PR laeuft automatisch:
- `npm run typecheck` - TypeScript Typepruefung
- `npm run lint` - ESLint
- `npm run build` - Next.js Production Build

CI blockiert bei Failures. Config: `.github/workflows/ci.yml`

### Backup

- **Taeglich 03:00 UTC**: Automatischer JSON-Export der kritischen Tabellen via Vercel Cron
- **Sonntag 04:00 UTC**: Zusaetzliches Backup via GitHub Action
- Backups in Supabase Storage Bucket `db-backups/daily/`
- 30 Tage Aufbewahrung

Disaster-Recovery-Runbook: `scripts/disaster-recovery-runbook.md`

### Aaron-TODOs (manuell)

- [ ] **GitHub Branch Protection auf `main`**: Settings > Branches > Add rule > `main` > "Require pull request reviews" + "Require status checks to pass" (CI)
- [ ] **GitHub Secrets eintragen** (damit CI-Build funktioniert):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `SENTRY_AUTH_TOKEN`
  - `CRON_SECRET` (fuer Backup Action)
  - `PRODUCTION_URL` (z.B. `https://cmndo.vercel.app`, fuer Backup Action)
- [ ] **Vercel**: Production Branch auf `main` belassen (default), `staging` wird automatisch als Preview deployed
- [ ] **Team informieren**: Hunde sollen ab jetzt zu `staging` pushen statt direkt `main` (Aaron entscheidet Timing)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
