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
import HomePage from './pages/HomePage'
import NewsPage from './pages/NewsPage'
import NewsFormPage from './pages/NewsFormPage'
import MarketPage from './pages/MarketPage'
import MarketFormPage from './pages/MarketFormPage'
import AcademiesPage from './pages/AcademiesPage'
import AcademyFormPage from './pages/AcademyFormPage'
import HallOfFamePage from './pages/HallOfFamePage'
import InducteeFormPage from './pages/InducteeFormPage'
import MediaPage from './pages/MediaPage'
import AlbumDetailPage from './pages/AlbumDetailPage'
import CountriesPage from './pages/CountriesPage'
import CountryProfilePage from './pages/CountryProfilePage'
import CompareSwimmersPage from './pages/CompareSwimmersPage'

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
        <Route index element={<HomePage />} />
        <Route path="swimmers" element={<SwimmersPage />} />
        <Route path="swimmers/new" element={<SwimmerFormPage />} />
        <Route path="swimmers/:id/edit" element={<SwimmerFormPage />} />
        <Route path="swimmers/compare" element={<CompareSwimmersPage />} />
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
        <Route path="news" element={<NewsPage />} />
        <Route path="news/new" element={<NewsFormPage />} />
        <Route path="news/:id/edit" element={<NewsFormPage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="market/new" element={<MarketFormPage />} />
        <Route path="market/:id/edit" element={<MarketFormPage />} />
        <Route path="academies" element={<AcademiesPage />} />
        <Route path="academies/new" element={<AcademyFormPage />} />
        <Route path="academies/:id/edit" element={<AcademyFormPage />} />
        <Route path="hall-of-fame" element={<HallOfFamePage />} />
        <Route path="hall-of-fame/new" element={<InducteeFormPage />} />
        <Route path="hall-of-fame/:id/edit" element={<InducteeFormPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="media/albums/:id" element={<AlbumDetailPage />} />
        <Route path="countries" element={<CountriesPage />} />
        <Route path="countries/:id" element={<CountryProfilePage />} />
        <Route path="import" element={<ImportPage />} />
      </Route>
    </Routes>
  )
}
