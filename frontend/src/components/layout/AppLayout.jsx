import { Outlet } from 'react-router-dom'
import Header from './Header'
import TabBar from './TabBar'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <TabBar />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
