import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
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
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
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
        <Route path="/swimmers" element={<Swimmers />} />
        <Route path="/swimmers/:id" element={<SwimmerProfile />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/coaches" element={<Coaches />} />
        <Route path="/hall-of-fame" element={<HallOfFame />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:id" element={<Article />} />
        <Route path="/media" element={<Media />} />
        <Route path="/media/albums/:id" element={<Album />} />
        <Route path="/market" element={<Market />} />
        <Route path="/countries" element={<Countries />} />
        <Route path="/countries/:id" element={<CountryProfile />} />
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
  )
}
