import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col w-full">
        <Header />
        <main className="px-3 py-3 sm:px-4 sm:py-4 md:p-6 flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
