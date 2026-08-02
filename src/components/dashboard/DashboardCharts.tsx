'use client'

import { Bar, BarChart, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getReadingLevelStyle } from '@/lib/reading-levels'

type DistributionItem = {
  level: string
  name: string
  count: number
  percentage: number
  translatedName: string
}

function formatPercentage(value: unknown): string {
  const percentage = Number(value)
  return percentage > 0 ? `${percentage}%` : ''
}

export default function DashboardCharts({
  distribution,
  distributionTitle,
  byLevelTitle,
  studentLabel,
}: {
  distribution: DistributionItem[]
  distributionTitle: string
  byLevelTitle: string
  studentLabel: string
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-lg bg-white p-6 shadow" data-testid="dashboard-pie-chart">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">{distributionTitle}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <Pie
              data={distribution}
              dataKey="count"
              nameKey="translatedName"
              cx="50%"
              cy="50%"
              outerRadius={78}
              label={{ dataKey: 'percentage', formatter: formatPercentage, position: 'outside', offset: 18 }}
              labelLine
            >
              {distribution.map((item) => (
                <Cell key={item.level} fill={getReadingLevelStyle(item.level).color} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name, item) => [
              `${value} (${item.payload.percentage}%)`,
              name,
            ]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg bg-white p-6 shadow" data-testid="dashboard-bar-chart">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">{byLevelTitle}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={distribution} layout="vertical" margin={{ right: 58 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="translatedName" width={120} />
            <Tooltip formatter={(value, _name, item) => [
              `${value} (${item.payload.percentage}%)`,
              studentLabel,
            ]} />
            <Legend />
            <Bar dataKey="count" fill="#3B82F6" name={studentLabel}>
              <LabelList dataKey="percentage" position="right" offset={12} formatter={formatPercentage} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
