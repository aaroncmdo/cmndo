import { redirect } from 'next/navigation'

// AAR-370 / AAR-722: Mitteilungen sind aus dem Posteingang raus. Sie leben
// ab AAR-725 in der Updates-Nav oben in der Navbar (in Arbeit). Solange
// AAR-725 noch nicht gebaut ist, schickt dieser Legacy-Redirect den User
// auf das Dashboard — nicht mehr auf den Posteingang (der zeigt nur Chats
// und würde die User-Erwartung brechen).
export default function MitteilungenRedirectPage() {
  redirect('/gutachter')
}
