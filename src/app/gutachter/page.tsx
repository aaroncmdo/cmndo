// AAR-700: /gutachter ist nur noch ein Redirect-Stub auf /gutachter/heute.
// Das alte Cockpit (overview/navigation/onsite-Modes) hat die Heute-Page
// (AAR-381) abgelöst — die soll der Default-Einstieg für SVs sein.

import { redirect } from 'next/navigation'

export default function GutachterRootPage() {
  redirect('/gutachter/heute')
}
