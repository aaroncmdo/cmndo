// Portal-Header P1: Sub-Route ist jetzt ein Client-State-Tab im Hub. Stub haelt
// den alten Deeplink am Leben (kein 404 fuer E-Mail-CTA/KPI-Links) -> Hub-Default.
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/admin/finance')
}
