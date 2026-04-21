// AAR-kanzlei-portal: /kanzlei → /kanzlei/dashboard Redirect.
// Layout-Guard fängt fehlende Auth/Rolle bereits ab.

import { redirect } from 'next/navigation'

export default function KanzleiLanding() {
  redirect('/kanzlei/dashboard')
}
