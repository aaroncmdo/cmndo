// Portal-Header P1: Sub-Route ist jetzt ein Client-State-Tab im Hub. Stub haelt
// den alten Deeplink am Leben (Email-CTA/KPI/Drilldown) -> Hub mit passendem ?tab=.
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/admin/finance?tab=kanzlei')
}
