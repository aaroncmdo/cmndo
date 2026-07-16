// Stabile Test-UUIDs (Prefix fb… = fixture) + bekannte Account-IDs.
// Single-Source-of-Truth für Idempotenz; auch von der SP2-Harness importierbar.
// 17.07.: 5 der 7 UUIDs auf die HEUTIGEN Konten remappt — der Prod-Golive-Accounts-Cleanup
// (13.07.) hat die alten Fixture-User geloescht/neu angelegt (provision.ts scheiterte mit
// 15 FK-Kaskaden auf die toten IDs). kunde = smoke-kunde@ (dediziertes Smoke-Konto,
// f99fdb10 17.07. mit Aaron-Go). Quelle der Wahrheit fuer Logins/PWs:
// Memory reference-internal-test-account-logins (die README-PW-Tabelle ist teils stale).
export const ACCOUNTS = {
  admin: 'd8a2606d-4551-451d-b145-270d94eff1a8',
  dispatch: '7b604e30-8308-4948-964c-6eec0540a42b',
  kanzlei: 'bbbb1111-0000-4000-8000-000000000010',
  kb: '60eff43e-bece-4553-bd8c-cc1f948e913f',
  kunde: 'd63661dd-40cf-4654-97f7-03fcd1f35429',
  makler: 'bbbb2222-0000-4000-8000-000000000020',
  sv: '41ebb10a-053b-4295-8a9d-057b95f2e692',
} as const

export const SV_SACHVERSTAENDIGE_ID = '0469524f-0547-4979-8068-a2d00b7fdaec'

export const CLAIMS = {
  c1: 'fbc10001-0000-4000-8000-000000000001',
  c2: 'fbc10002-0000-4000-8000-000000000002',
  c3: 'fbc10003-0000-4000-8000-000000000003',
  c4: 'fbc10004-0000-4000-8000-000000000004',
} as const
export const LEADS = {
  c1: 'fb1e0001-0000-4000-8000-000000000001',
  c2: 'fb1e0002-0000-4000-8000-000000000002',
  c3: 'fb1e0003-0000-4000-8000-000000000003',
  c4: 'fb1e0004-0000-4000-8000-000000000004',
} as const
export const PARTIES = {
  c1: 'fbc90001-0000-4000-8000-000000000001',
  c2: 'fbc90002-0000-4000-8000-000000000002',
  c3: 'fbc90003-0000-4000-8000-000000000003',
  c4: 'fbc90004-0000-4000-8000-000000000004',
} as const
export const AUFTRAEGE = {
  c2: 'fba00002-0000-4000-8000-000000000002',
  c4: 'fba00004-0000-4000-8000-000000000004',
} as const
export const PFLICHTDOK = {
  fahrzeugschein: 'fbd10001-0000-4000-8000-000000000001',
  unfallfotos: 'fbd10002-0000-4000-8000-000000000002',
  schadensfotos: 'fbd10003-0000-4000-8000-000000000003',
} as const
export const KANZLEI_ID = 'fbca0001-0000-4000-8000-000000000001'
export const KANZLEI_FALL_ID = 'fbca0f01-0000-4000-8000-000000000001'
export const KANZLEI_FALL_C4 = 'fbca0f04-0000-4000-8000-000000000004'

/** Intern (@claimondo.de) plus-adressiert -> test-sv-guard behandelt den Lead als intern. */
export function internEmail(stage: 'c1' | 'c2' | 'c3' | 'c4'): string {
  return `test-kunde+${stage}@claimondo.de`
}
