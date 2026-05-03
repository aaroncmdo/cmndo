// CMM-23: Deep-Link in das LexDrive-Kanzlei-Portal pro Fall.
//
// Aaron-Spec: SV soll vom Fall-Lifecycle direkt in den konkreten Vorgang
// im LexDrive-Portal springen können. Authentication-Layer fängt die
// LexDrive-Seite selbst — der Deep-Link bringt den SV nach Login auf den
// konkreten Vorgang.
//
// faelle.lexdrive_case_id ist die Salesforce-recordId. Template lebt in
// einer ENV-Var damit wir später auf Sandbox/Prod umstellen können ohne
// Migration.
//
// Default-Template (LexDrive-Live):
//   https://ruby-momentum-209.my.site.com/partner/s/aktendetailansicht?recordId={case_id}

const DEFAULT_DEEP_LINK_TEMPLATE =
  'https://ruby-momentum-209.my.site.com/partner/s/aktendetailansicht?recordId={case_id}'

const DEFAULT_LOGIN_URL = 'https://ruby-momentum-209.my.site.com/partner/'

/**
 * Liefert die Deep-Link-URL zum konkreten Vorgang. null wenn das Template
 * fehlt oder der case_id nicht gesetzt ist (= Mandat noch nicht angenommen).
 */
export function getLexdriveDeepLink(caseId: string | null | undefined): string | null {
  if (!caseId) return null
  const template = process.env.LEXDRIVE_PORTAL_URL_TEMPLATE ?? DEFAULT_DEEP_LINK_TEMPLATE
  return template.replace('{case_id}', encodeURIComponent(caseId))
}

/**
 * Liefert die Login-URL zum LexDrive-Portal (Fallback wenn case_id noch
 * nicht da ist).
 */
export function getLexdriveLoginUrl(): string {
  return process.env.LEXDRIVE_PORTAL_LOGIN_URL ?? DEFAULT_LOGIN_URL
}
