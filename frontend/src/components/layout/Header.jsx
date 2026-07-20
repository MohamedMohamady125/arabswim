import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, BarChart3 } from 'lucide-react'

export default function Header() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-6 h-14 flex items-center justify-end gap-2 sm:gap-3 pl-14 md:pl-3">
      <button
        onClick={() => navigate('/rankings')}
        className="flex items-center gap-1.5 sm:gap-2 bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-700"
      >
        <BarChart3 size={15} />
        <span className="hidden sm:inline">View Reports</span>
        <span className="sm:hidden">Reports</span>
      </button>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 sm:gap-2 border border-gray-300 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-gray-50"
      >
        <LogOut size={15} />
        <span className="hidden sm:inline">Logout</span>
      </button>
    </header>
  )
}
