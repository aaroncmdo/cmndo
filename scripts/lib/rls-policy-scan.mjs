// Pure-Logik fuer den RLS-Policy-Ratchet (keine IO — unit-testbar).
//
// REGEL: Eine PERMISSIVE `CREATE POLICY` in einer Migration MUSS eine explizite
// `TO <rolle>`-Klausel haben, die nicht `public` ist.
//
// WARUM: Laesst man `TO` weg, ist der Postgres-Default `TO public` — die Policy faechert damit
// ueber ALLE Rollen des Clusters auf, auch ueber `authenticator`/`cli_login_postgres`/
// `dashboard_user`/`supabase_privileged_role`, die keinerlei App-Traffic haben (und auf den
// betroffenen Tabellen 0 Grants). Der Supabase-Advisor zaehlt `multiple_permissive_policies`
// je (Tabelle x ROLLE x Action) -> jeder Overlap wird dadurch 4x doppelt gezaehlt. Genau das
// war das 49-%-Rauschen (313 Findings), das B2a (Migration 20260714171501) rausgeraeumt hat.
// Ohne Gate kommt es zurueck: `TO public` ist der Default, den man sich einfaengt, wenn man
// die Klausel schlicht vergisst — binnen Stunden schon 4x passiert (cold_mail_*).
//
// DREI AUSNAHMEN — hier liegen die einzigen False-Positive-Quellen:
//
//  1. `AS RESTRICTIVE` ist EXEMPT. Bei einer restriktiven Policy ist `TO public` KORREKT:
//     sie gilt dann fuer alle Rollen = maximale Abdeckung. Ein Verengen auf `TO authenticated`
//     wuerde die Restriktion fuer `anon` AUFHEBEN — also LOCKERN. (Real: die einzige
//     RESTRICTIVE-Policy im Schema ist `nachrichten_thread_insert_member_only`.)
//
//  2. DYNAMISCHES SQL ist EXEMPT. Policies, die per `EXECUTE format('CREATE POLICY %I ... TO %s
//     ...')` erzeugt werden, bekommen ihre Rollen zur Laufzeit — die TO-Klausel IST explizit,
//     nur eben parametrisiert. (Real: die B1-Konsolidierungs-Migrationen erzeugen so 320
//     Policies.) Erkennung ueber Format-Platzhalter `%I`/`%s`/`%L`. Ein dynamisches
//     `EXECUTE 'CREATE POLICY x ON t USING (true)'` OHNE Platzhalter wird weiterhin geflaggt.
//
//  3. Nur der HEADER (vor `USING` / `WITH CHECK`) wird nach `TO` durchsucht. Sonst matcht ein
//     beliebiges `to` im Qual-Ausdruck (Spaltenname, String) und maskiert eine fehlende Klausel.
//
// Grammatik: CREATE POLICY name ON tbl [AS {PERMISSIVE|RESTRICTIVE}]
//            [FOR {ALL|SELECT|INSERT|UPDATE|DELETE}] [TO role[,…]] [USING (…)] [WITH CHECK (…)]

/** Kommentare entfernen — sonst matcht `-- CREATE POLICY ...` in einem Header. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // Block-Kommentare
    .replace(/--[^\n]*/g, ' ')         // Zeilen-Kommentare
}

/**
 * Scannt SQL-Text auf verletzende CREATE-POLICY-Statements.
 * @returns {{policy:string, table:string, kind:'to-public'|'missing-to'}[]}
 */
export function scanSql(sql) {
  const clean = stripComments(String(sql))
  const out = []
  // CREATE POLICY … bis zum naechsten ';' (Quals enthalten keine Semikolons)
  const re = /create\s+policy\b[\s\S]*?;/gi
  let m
  while ((m = re.exec(clean)) !== null) {
    const stmt = m[0]

    // (2) dynamisches SQL: Rollen kommen zur Laufzeit -> exempt
    if (/%[IsL]/.test(stmt)) continue

    // (1) RESTRICTIVE: `TO public` ist dort korrekt -> exempt
    if (/\bas\s+restrictive\b/i.test(stmt)) continue

    // (3) nur den Header vor USING / WITH CHECK betrachten
    const bodyAt = stmt.search(/\b(using|with\s+check)\b/i)
    const header = bodyAt >= 0 ? stmt.slice(0, bodyAt) : stmt

    const name = /create\s+policy\s+("[^"]+"|[a-z0-9_]+)/i.exec(stmt)?.[1]?.replace(/"/g, '') ?? '(?)'
    const table = /\bon\s+((?:[a-z0-9_]+\.)?(?:"[^"]+"|[a-z0-9_]+))/i.exec(header)?.[1]?.replace(/"/g, '') ?? '(?)'

    if (/\bto\s+public\b/i.test(header)) {
      out.push({ policy: name, table, kind: 'to-public' })
      continue
    }
    // explizite TO-Klausel mit einer echten Rolle?
    if (!/\bto\s+("?[a-z_][a-z0-9_"]*)/i.test(header)) {
      out.push({ policy: name, table, kind: 'missing-to' })
    }
  }
  return out
}

/** Bequemer Wrapper: Datei-Inhalte -> Findings je Datei. */
export function scanFiles(entries) {
  const findings = []
  for (const { file, sql } of entries) {
    for (const f of scanSql(sql)) findings.push({ file, ...f })
  }
  return findings
}

/** Baseline-Diff auf Datei-Ebene (wie component-set / knip). */
export function diffBaseline(violatingFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(violatingFiles)
  return {
    added: [...cur].filter((f) => !base.has(f)).sort(),
    removed: [...base].filter((f) => !cur.has(f)).sort(),
  }
}
