// Chat-Inbox P2: geteilter Datums-Trenner (MaklerChatTab-Stil).

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-2">
      <span className="text-[10px] text-claimondo-ondo bg-claimondo-bg border border-claimondo-border rounded-full px-3 py-0.5">
        {label}
      </span>
    </div>
  )
}
