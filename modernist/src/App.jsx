import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import { useFeatures } from './context/FeaturesContext'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminDashboard from './pages/AdminDashboard'
import Import from './pages/Import'
import Home from './pages/Home'
import Championships from './pages/Championships'
import MeetDetail from './pages/MeetDetail'
import Calendar from './pages/Calendar'
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
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/import" element={<RequireAdmin><Import /></RequireAdmin>} />
        <Route path="/" element={<Home />} />
        <Route path="/championships" element={<Championships />} />
        <Route path="/meets/:id" element={<MeetDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/records" element={<Records />} />
        <Route path="/new-records" element={<NewRecords />} />
        <Route path="/medals" element={<Medals />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/qualifying-times" element={<QualifyingTimes />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/swimmers" element={<Swimmers />} />
        <Route path="/swimmers/:id" element={<SwimmerProfile />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/coaches" element={<RequireFeature flag="coaches"><Coaches /></RequireFeature>} />
        <Route path="/hall-of-fame" element={<RequireFeature flag="hall_of_fame"><HallOfFame /></RequireFeature>} />
        <Route path="/news" element={<RequireFeature flag="news"><News /></RequireFeature>} />
        <Route path="/news/:id" element={<RequireFeature flag="news"><Article /></RequireFeature>} />
        <Route path="/media" element={<RequireFeature flag="media"><Media /></RequireFeature>} />
        <Route path="/media/albums/:id" element={<RequireFeature flag="media"><Album /></RequireFeature>} />
        <Route path="/market" element={<RequireFeature flag="marketplace"><Market /></RequireFeature>} />
        <Route path="/countries" element={<Countries />} />
        <Route path="/countries/:id" element={<CountryProfile />} />
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
  )
}
