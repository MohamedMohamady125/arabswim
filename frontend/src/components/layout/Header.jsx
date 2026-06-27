import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
        <img src="/logo.png" alt="ArabSwiM" className="h-10 w-10 object-contain" />
        <div>
          <div className="text-xl font-bold text-blue-600 leading-tight">ArabSwiM</div>
          <div className="text-gray-400 text-[11px] leading-tight">Management System</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/rankings')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          View Reports
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
