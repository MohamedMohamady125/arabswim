import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import SwimmersPage from './pages/SwimmersPage'
import SwimmerFormPage from './pages/SwimmerFormPage'
import SwimmerProfilePage from './pages/SwimmerProfilePage'
import ChampionshipsPage from './pages/ChampionshipsPage'
import ChampionshipFormPage from './pages/ChampionshipFormPage'
import CalendarPage from './pages/CalendarPage'
import NewRecordsPage from './pages/NewRecordsPage'
import RecordsPage from './pages/RecordsPage'
import MedalsPage from './pages/MedalsPage'
import RankingsPage from './pages/RankingsPage'
import ImportPage from './pages/ImportPage'
import MeetDetailPage from './pages/MeetDetailPage'
import TeamsPage from './pages/TeamsPage'
import TeamProfilePage from './pages/TeamProfilePage'
import TeamFormPage from './pages/TeamFormPage'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/swimmers" />} />
        <Route path="swimmers" element={<SwimmersPage />} />
        <Route path="swimmers/new" element={<SwimmerFormPage />} />
        <Route path="swimmers/:id/edit" element={<SwimmerFormPage />} />
        <Route path="swimmers/:id" element={<SwimmerProfilePage />} />
        <Route path="championships" element={<ChampionshipsPage />} />
        <Route path="championships/new" element={<ChampionshipFormPage />} />
        <Route path="championships/:id/edit" element={<ChampionshipFormPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="meets/:id" element={<MeetDetailPage />} />
        <Route path="new-records" element={<NewRecordsPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="medals" element={<MedalsPage />} />
        <Route path="rankings" element={<RankingsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/new" element={<TeamFormPage />} />
        <Route path="teams/:id/edit" element={<TeamFormPage />} />
        <Route path="teams/:id" element={<TeamProfilePage />} />
        <Route path="import" element={<ImportPage />} />
      </Route>
    </Routes>
  )
}
