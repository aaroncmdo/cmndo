export default function SAVolltextPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] py-10 px-5">
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sicherungsabtretung und Unterschriftsvollmacht</h1>

        <div className="prose prose-sm text-gray-700 max-w-none space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">1. Abtretungserklaerung</h2>
          <p>
            Hiermit trete ich saemtliche mir aus dem nachfolgend bezeichneten Schadensereignis zustehenden
            Schadensersatzansprueche — insbesondere die Ansprueche auf Erstattung der Sachverstaendigenkosten —
            erfuellungshalber an die <strong>Claimondo GmbH</strong> ab.
          </p>
          <p>
            Die Abtretung umfasst insbesondere folgende Ansprueche gegenueber dem Schaediger und/oder dessen
            Haftpflichtversicherung:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Sachschadenersatzansprueche</li>
            <li>Anspruch auf Erstattung der Gutachterverguetung (Sachverstaendigenkosten)</li>
            <li>Nebenkosten (Auslagenpauschale, Nutzungsausfall, Mietwagenkosten etc.)</li>
            <li>Anspruch auf Erstattung vorgerichtlicher Rechtsanwaltskosten</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-800 mt-6">2. Kostenfreiheit</h2>
          <p>
            Dem Auftraggeber entstehen durch die Beauftragung der Claimondo GmbH <strong>keine Kosten</strong>.
            Die Sachverstaendigenkosten werden im Rahmen der Sicherungsabtretung direkt von der gegnerischen
            Haftpflichtversicherung getragen. Im Falle einer Kuerzung oder Ablehnung durch die Versicherung
            traegt die Claimondo GmbH das wirtschaftliche Risiko.
          </p>

          <h2 className="text-lg font-semibold text-gray-800 mt-6">3. Vollmacht</h2>
          <p>
            Der Auftraggeber bevollmaechtigt die Claimondo GmbH, in seinem Namen:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>einen qualifizierten Kfz-Sachverstaendigen mit der Erstellung eines Schadengutachtens zu beauftragen,</li>
            <li>die abgetretenen Ansprueche aussergerichtlich gegenueber der Versicherung geltend zu machen,</li>
            <li>Zahlungen entgegenzunehmen und an die berechtigten Parteien weiterzuleiten,</li>
            <li>erforderliche Korrespondenz mit der gegnerischen Versicherung zu fuehren.</li>
          </ul>

          <h2 className="text-lg font-semibold text-gray-800 mt-6">4. Widerrufsbelehrung</h2>
          <p>
            Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gruenden diesen Vertrag zu widerrufen.
            Die Widerrufsfrist betraegt vierzehn Tage ab dem Tag des Vertragsschlusses. Um Ihr Widerrufsrecht
            auszuueben, muessen Sie uns (Claimondo GmbH) mittels einer eindeutigen Erklaerung (z.B. ein mit der
            Post versandter Brief oder E-Mail) ueber Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.
          </p>

          <h2 className="text-lg font-semibold text-gray-800 mt-6">5. Datenschutz</h2>
          <p>
            Die Erhebung und Verarbeitung Ihrer personenbezogenen Daten erfolgt ausschliesslich zum Zweck der
            Schadensabwicklung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragsdurchfuehrung).
            Ihre Daten werden nur an den beauftragten Sachverstaendigen und die gegnerische Versicherung
            weitergegeben, soweit dies fuer die Schadensregulierung erforderlich ist.
          </p>

          <div className="border-t border-gray-200 pt-5 mt-6">
            <p className="text-xs text-gray-400">
              Claimondo GmbH &middot; Dieses Dokument dient der Information. Die rechtlich bindende
              Fassung wird im Rahmen der digitalen Unterschrift erstellt.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
