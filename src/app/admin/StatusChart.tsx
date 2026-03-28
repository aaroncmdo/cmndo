'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

type StatusData = { name: string; value: number; color: string }

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <span className="text-zinc-200">{payload[0].name}: </span>
      <span className="text-white font-semibold">{payload[0].value}</span>
    </div>
  )
}

export default function StatusChart({ data, total }: { data: StatusData[]; total: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={56}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5 min-w-0 flex-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-zinc-400 truncate flex-1">{d.name}</span>
            <span className="text-zinc-200 font-medium tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
