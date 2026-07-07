// Stabile Test-UUIDs (Prefix fb… = fixture) + bekannte Account-IDs.
// Single-Source-of-Truth für Idempotenz; auch von der SP2-Harness importierbar.
export const ACCOUNTS = {
  admin: 'bdfe432b-250e-4dec-8bdd-f5d6ac04d910',
  dispatch: '7b0787fb-2da1-4f61-aa79-1e56a6d32bf2',
  kanzlei: 'bbbb1111-0000-4000-8000-000000000010',
  kb: '59bdb155-e283-4fd1-a4ca-222f924a0efa',
  kunde: '113aebe5-0630-4753-809a-6756df5ba432',
  makler: 'bbbb2222-0000-4000-8000-000000000020',
  sv: '25a8c28e-b85a-4769-94d4-920e47f64079',
} as const

export const SV_SACHVERSTAENDIGE_ID = '1da11741-a406-45ce-a27b-c041576cccbb'

export const CLAIMS = {
  c1: 'fbc10001-0000-4000-8000-000000000001',
  c2: 'fbc10002-0000-4000-8000-000000000002',
  c3: 'fbc10003-0000-4000-8000-000000000003',
} as const
export const LEADS = {
  c1: 'fb1e0001-0000-4000-8000-000000000001',
  c2: 'fb1e0002-0000-4000-8000-000000000002',
  c3: 'fb1e0003-0000-4000-8000-000000000003',
} as const
export const PARTIES = {
  c1: 'fbcp0001-0000-4000-8000-000000000001',
  c2: 'fbcp0002-0000-4000-8000-000000000002',
  c3: 'fbcp0003-0000-4000-8000-000000000003',
} as const
export const AUFTRAEGE = { c2: 'fba00002-0000-4000-8000-000000000002' } as const
export const PFLICHTDOK = {
  fahrzeugschein: 'fbpd0001-0000-4000-8000-000000000001',
  unfallfotos: 'fbpd0002-0000-4000-8000-000000000002',
  schadensfotos: 'fbpd0003-0000-4000-8000-000000000003',
} as const
export const KANZLEI_ID = 'fbca0001-0000-4000-8000-000000000001'
export const KANZLEI_FALL_ID = 'fbca0f01-0000-4000-8000-000000000001'

/** Intern (@claimondo.de) plus-adressiert -> test-sv-guard behandelt den Lead als intern. */
export function internEmail(stage: 'c1' | 'c2' | 'c3'): string {
  return `test-kunde+${stage}@claimondo.de`
}
