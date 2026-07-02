import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { LogOut, BarChart3 } from 'lucide-react'

export default function Header() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="bg-white border-b border-gray-200 px-6 h-16 flex items-center justify-end gap-3">
      <button
        onClick={() => navigate('/rankings')}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
      >
        <BarChart3 size={15} />
        View Reports
      </button>
      <button
        onClick={logout}
        className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
      >
        <LogOut size={15} />
        Logout
      </button>
    </header>
  )
}
