// Fail-CLOSED Auth-Guard fuer Cron-Routes (src/app/api/cron/*).
//
// Ersetzt den frueheren hand-gerollten Inline-Guard
//   const authHeader = request.headers.get('authorization')
//   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { return 401 }
// der bei UNSET CRON_SECRET fail-opente: das Template-Literal wurde zu
// "Bearer undefined" -> ein Angreifer mit genau diesem Authorization-Header kam
// durch (unauthentifizierter Cron-Trigger, schwerer Blast-Radius: SEPA-Einzug,
// Provisions-Release, db-backup). Siehe AUDIT-cron-secret-fail-open.
//
// Dieser Helper verweigert hart, wenn kein Secret konfiguriert ist (fail-closed).
// Bei GESETZTEM CRON_SECRET ist das Verhalten identisch zum alten Guard.
export function assertCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}
