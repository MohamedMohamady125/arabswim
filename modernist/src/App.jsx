import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import PageTracker from './components/PageTracker'
import { useAuth } from './context/AuthContext'
import { useFeatures } from './context/FeaturesContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Join from './pages/Join'
import Vote from './pages/Vote'
import AdminDashboard from './pages/AdminDashboard'
import AdminAnalytics from './pages/AdminAnalytics'
import NameMatch from './pages/NameMatch'
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
import Academies from './pages/Academies'
import AcademyProfile from './pages/AcademyProfile'
import TeamDetail from './pages/TeamDetail'
import TeamEventDepth from './pages/TeamEventDepth'
import Coaches from './pages/Coaches'
import Referees from './pages/Referees'
import HallOfFame from './pages/HallOfFame'
import News from './pages/News'
import Article from './pages/Article'
import Media from './pages/Media'
import Album from './pages/Album'
import Market from './pages/Market'
import Countries from './pages/Countries'
import Reports from './pages/Reports'
import Lab from './pages/Lab'
import CountryProfile from './pages/CountryProfile'
import { Loading } from './components/ui'

function RequireAdmin({ children }) {
  const { isAdmin, authLoading, visitorView } = useAuth()
  if (authLoading) return <Loading />
  // an admin previewing the visitor view is sent home, as a visitor would be
  if (visitorView) return <Navigate to="/" replace />
  return isAdmin ? children : <Navigate to="/login" replace />
}

// Section hidden by a launch toggle: only admins can preview it
function RequireFeature({ flag, children }) {
  const { isAdmin } = useAuth()
  const { features } = useFeatures()
  if (features[flag] === false && !isAdmin) return <Navigate to="/" replace />
  return children
}

// Paradox of the Active User: a wrong link says what happened and offers the
// few places most people are looking for (Hick's Law: five, not the whole menu).
function NotFound() {
  const { pathname } = useLocation()
  const { features } = useFeatures()
  const links = [
    ['Championships', '/championships', 'Meets and full results'],
    ['Swimmers', '/swimmers', 'Find a swimmer by name', 'swimmers'],
    ['Records', '/records', 'Arab and national records', 'records'],
    ['Rankings', '/rankings', 'Fastest times by event', 'rankings'],
    ['News', '/news', 'Latest stories', 'news'],
  ].filter(([, , , flag]) => !flag || features[flag] !== false)
  return (
    <div className="pad-lg content-notfound">
      <div className="kicker" style={{ marginBottom: 6 }}>Error 404</div>
      <h1 style={{ margin: 0, letterSpacing: '-0.03em' }}>Page not found</h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', margin: '10px 0 20px', maxWidth: 520 }}>
        There is no page at <strong style={{ overflowWrap: 'anywhere' }}>{pathname}</strong>. The link may be old or mistyped.
        Use the search at the top of the page, or start from one of these.
      </p>
      <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>Go to the home page</Link>
      <div className="content-notfound-links">
        {links.map(([label, to, hint]) => (
          <Link key={to} to={to}>
            <strong>{label} →</strong>
            <span>{hint}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
    <PageTracker />
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/vote/:slug" element={<Vote />} />
        <Route path="/register" element={<Register />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/admin/analytics" element={<RequireAdmin><AdminAnalytics /></RequireAdmin>} />
        <Route path="/admin/name-match" element={<RequireAdmin><NameMatch /></RequireAdmin>} />
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
        <Route path="/teams/:id/depth/:eventId" element={<RequireFeature flag="teams"><TeamEventDepth /></RequireFeature>} />
        <Route path="/academies" element={<RequireFeature flag="academies"><Academies /></RequireFeature>} />
        <Route path="/academies/:id" element={<RequireFeature flag="academies"><AcademyProfile /></RequireFeature>} />
        <Route path="/coaches" element={<RequireFeature flag="coaches"><Coaches /></RequireFeature>} />
        <Route path="/referees" element={<RequireFeature flag="referees"><Referees /></RequireFeature>} />
        <Route path="/hall-of-fame" element={<RequireFeature flag="hall_of_fame"><HallOfFame /></RequireFeature>} />
        <Route path="/news" element={<RequireFeature flag="news"><News /></RequireFeature>} />
        {/* Article reader stays reachable even when the /news index is toggled off:
            federation & club pages link articles regardless of the news flag */}
        <Route path="/news/:id" element={<Article />} />
        <Route path="/media" element={<RequireFeature flag="media"><Media /></RequireFeature>} />
        <Route path="/media/albums/:id" element={<RequireFeature flag="media"><Album /></RequireFeature>} />
        <Route path="/market" element={<RequireFeature flag="marketplace"><Market /></RequireFeature>} />
        <Route path="/countries" element={<Countries />} />
        <Route path="/reports" element={<RequireAdmin><Reports /></RequireAdmin>} />
        <Route path="/lab" element={<RequireFeature flag="lab"><Lab /></RequireFeature>} />
        <Route path="/countries/:id" element={<CountryProfile />} />
        {/* virtual pan-Arab federation: the federation dashboard aggregated
            over every Arab + GCC nation */}
        <Route path="/arab-federation" element={<CountryProfile arabFed />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </>
  )
}
