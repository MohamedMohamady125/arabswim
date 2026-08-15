import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PageTracker from './components/PageTracker'
import { useAuth } from './context/AuthContext'
import { useFeatures } from './context/FeaturesContext'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminDashboard from './pages/AdminDashboard'
import AdminAnalytics from './pages/AdminAnalytics'
import Import from './pages/Import'
import Home from './pages/Home'
import Championships from './pages/Championships'
import MeetDetail from './pages/MeetDetail'
import Calendar from './pages/Calendar'
import Live from './pages/Live'
import Records from './pages/Records'
import NewRecords from './pages/NewRecords'
import Medals from './pages/Medals'
import Rankings from './pages/Rankings'
import QualifyingTimes from './pages/QualifyingTimes'
import Predictions from './pages/Predictions'
import Swimmers from './pages/Swimmers'
import SwimmerProfile from './pages/SwimmerProfile'
import Compare from './pages/Compare'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Coaches from './pages/Coaches'
import HallOfFame from './pages/HallOfFame'
import News from './pages/News'
import Article from './pages/Article'
import Media from './pages/Media'
import Album from './pages/Album'
import Market from './pages/Market'
import Countries from './pages/Countries'
import Reports from './pages/Reports'
import CountryProfile from './pages/CountryProfile'

function RequireAdmin({ children }) {
  const { isAdmin, authLoading } = useAuth()
  if (authLoading) return <div className="loading">Loading…</div>
  return isAdmin ? children : <Navigate to="/login" replace />
}

// Section hidden by a launch toggle: only admins can preview it
function RequireFeature({ flag, children }) {
  const { isAdmin } = useAuth()
  const { features } = useFeatures()
  if (features[flag] === false && !isAdmin) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <>
    <PageTracker />
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />
        <Route path="/import" element={<RequireAdmin><Import /></RequireAdmin>} />
        <Route path="/" element={<Home />} />
        <Route path="/championships" element={<Championships />} />
        <Route path="/meets/:id" element={<MeetDetail />} />
        <Route path="/calendar" element={<RequireFeature flag="calendar"><Calendar /></RequireFeature>} />
        <Route path="/live" element={<RequireFeature flag="live"><Live /></RequireFeature>} />
        <Route path="/records" element={<RequireFeature flag="records"><Records /></RequireFeature>} />
        <Route path="/new-records" element={<RequireFeature flag="new_records"><NewRecords /></RequireFeature>} />
        <Route path="/medals" element={<RequireFeature flag="medals"><Medals /></RequireFeature>} />
        <Route path="/rankings" element={<RequireFeature flag="rankings"><Rankings /></RequireFeature>} />
        <Route path="/qualifying-times" element={<RequireFeature flag="qualifying_times"><QualifyingTimes /></RequireFeature>} />
        <Route path="/predictions" element={<RequireFeature flag="predictions"><Predictions /></RequireFeature>} />
        <Route path="/swimmers" element={<RequireFeature flag="swimmers"><Swimmers /></RequireFeature>} />
        <Route path="/swimmers/:id" element={<RequireFeature flag="swimmers"><SwimmerProfile /></RequireFeature>} />
        <Route path="/compare" element={<RequireFeature flag="compare"><Compare /></RequireFeature>} />
        <Route path="/teams" element={<RequireFeature flag="teams"><Teams /></RequireFeature>} />
        <Route path="/teams/:id" element={<RequireFeature flag="teams"><TeamDetail /></RequireFeature>} />
        <Route path="/coaches" element={<RequireFeature flag="coaches"><Coaches /></RequireFeature>} />
        <Route path="/hall-of-fame" element={<RequireFeature flag="hall_of_fame"><HallOfFame /></RequireFeature>} />
        <Route path="/news" element={<RequireFeature flag="news"><News /></RequireFeature>} />
        <Route path="/news/:id" element={<RequireFeature flag="news"><Article /></RequireFeature>} />
        <Route path="/media" element={<RequireFeature flag="media"><Media /></RequireFeature>} />
        <Route path="/media/albums/:id" element={<RequireFeature flag="media"><Album /></RequireFeature>} />
        <Route path="/market" element={<RequireFeature flag="marketplace"><Market /></RequireFeature>} />
        <Route path="/countries" element={<Countries />} />
        <Route path="/reports" element={<RequireAdmin><Reports /></RequireAdmin>} />
        <Route path="/countries/:id" element={<CountryProfile />} />
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
    </>
  )
}
