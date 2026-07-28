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
import RecordFormPage from './pages/RecordFormPage'
import MedalsPage from './pages/MedalsPage'
import RankingsPage from './pages/RankingsPage'
import ImportPage from './pages/ImportPage'
import MeetDetailPage from './pages/MeetDetailPage'
import TeamsPage from './pages/TeamsPage'
import TeamProfilePage from './pages/TeamProfilePage'
import TeamFormPage from './pages/TeamFormPage'
import HomePage from './pages/HomePage'
import NewsPage from './pages/NewsPage'
import NewsFormPage from './pages/NewsFormPage'
import MarketPage from './pages/MarketPage'
import MarketFormPage from './pages/MarketFormPage'
import HallOfFamePage from './pages/HallOfFamePage'
import InducteeFormPage from './pages/InducteeFormPage'
import MediaPage from './pages/MediaPage'
import AlbumDetailPage from './pages/AlbumDetailPage'
import CountriesPage from './pages/CountriesPage'
import CountryProfilePage from './pages/CountryProfilePage'
import CompareSwimmersPage from './pages/CompareSwimmersPage'
import QualifyingTimesPage from './pages/QualifyingTimesPage'
import SponsorsPage from './pages/SponsorsPage'
import CoachesPage from './pages/CoachesPage'
import CoachFormPage from './pages/CoachFormPage'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="swimmers" element={<SwimmersPage />} />
        <Route path="swimmers/new" element={<ProtectedRoute><SwimmerFormPage /></ProtectedRoute>} />
        <Route path="swimmers/:id/edit" element={<ProtectedRoute><SwimmerFormPage /></ProtectedRoute>} />
        <Route path="swimmers/compare" element={<CompareSwimmersPage />} />
        <Route path="swimmers/:id" element={<SwimmerProfilePage />} />
        <Route path="championships" element={<ChampionshipsPage />} />
        <Route path="championships/new" element={<ProtectedRoute><ChampionshipFormPage /></ProtectedRoute>} />
        <Route path="championships/:id/edit" element={<ProtectedRoute><ChampionshipFormPage /></ProtectedRoute>} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="meets/:id" element={<MeetDetailPage />} />
        <Route path="new-records" element={<NewRecordsPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="records/new" element={<ProtectedRoute><RecordFormPage /></ProtectedRoute>} />
        <Route path="records/:id/edit" element={<ProtectedRoute><RecordFormPage /></ProtectedRoute>} />
        <Route path="medals" element={<MedalsPage />} />
        <Route path="rankings" element={<RankingsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/new" element={<ProtectedRoute><TeamFormPage /></ProtectedRoute>} />
        <Route path="teams/:id/edit" element={<ProtectedRoute><TeamFormPage /></ProtectedRoute>} />
        <Route path="teams/:id" element={<TeamProfilePage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="news/new" element={<ProtectedRoute><NewsFormPage /></ProtectedRoute>} />
        <Route path="news/:id/edit" element={<ProtectedRoute><NewsFormPage /></ProtectedRoute>} />
        <Route path="market" element={<MarketPage />} />
        <Route path="market/new" element={<ProtectedRoute><MarketFormPage /></ProtectedRoute>} />
        <Route path="market/:id/edit" element={<ProtectedRoute><MarketFormPage /></ProtectedRoute>} />
        <Route path="hall-of-fame" element={<HallOfFamePage />} />
        <Route path="hall-of-fame/new" element={<ProtectedRoute><InducteeFormPage /></ProtectedRoute>} />
        <Route path="hall-of-fame/:id/edit" element={<ProtectedRoute><InducteeFormPage /></ProtectedRoute>} />
        <Route path="media" element={<MediaPage />} />
        <Route path="media/albums/:id" element={<AlbumDetailPage />} />
        <Route path="countries" element={<CountriesPage />} />
        <Route path="countries/:id" element={<CountryProfilePage />} />
        <Route path="qualifying-times" element={<QualifyingTimesPage />} />
        <Route path="sponsors" element={<SponsorsPage />} />
        <Route path="coaches" element={<CoachesPage />} />
        <Route path="coaches/new" element={<ProtectedRoute><CoachFormPage /></ProtectedRoute>} />
        <Route path="coaches/:id/edit" element={<ProtectedRoute><CoachFormPage /></ProtectedRoute>} />
        <Route path="import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
      </Route>
    </Routes>
  )
}
