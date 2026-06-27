import { NavLink } from 'react-router-dom'

const tabs = [
  { path: '/swimmers', label: 'Swimmers', icon: '👥' },
  { path: '/championships', label: 'Championship', icon: '🏆' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/new-records', label: 'New Records', icon: '📋' },
  { path: '/records', label: 'Records', icon: '📋' },
  { path: '/medals', label: 'Medals', icon: '🏅' },
  { path: '/rankings', label: 'Ranking', icon: '📊' },
  { path: '/teams', label: 'Teams', icon: '🏊' },
  { path: '/import', label: 'Import', icon: '📥' },
]

export default function TabBar() {
  return (
    <nav className="bg-gray-50 border-b border-gray-200 px-6">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              }`
            }
          >
            <span>{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
