import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import Footer from './Footer'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TopNav />
      <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-4 md:px-6 lg:px-8 py-3 md:py-6 overflow-x-hidden">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
