import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, BarChart3 } from 'lucide-react'

export default function Header() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="bg-white border-b border-gray-200 h-12 md:h-14 flex items-center justify-end gap-2 px-3 md:px-6 ml-10 md:ml-0">
      <button
        onClick={() => navigate('/rankings')}
        className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 md:px-4 py-1.5 rounded-lg text-[11px] md:text-sm hover:bg-blue-700"
      >
        <BarChart3 size={14} />
        Reports
      </button>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 border border-gray-300 px-2.5 md:px-4 py-1.5 rounded-lg text-[11px] md:text-sm hover:bg-gray-50"
      >
        <LogOut size={14} />
        <span className="hidden sm:inline">Logout</span>
      </button>
    </header>
  )
}
