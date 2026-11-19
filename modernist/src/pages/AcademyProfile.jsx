import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAcademy } from '../api/academies'
import { AcademyModal } from './Academies'
import OwnerWelcome from '../components/OwnerWelcome'
import Flag from '../components/Flag'
import TrainingCalendar from '../components/TrainingCalendar'
import { Loading, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { mediaUrl } from '../utils'
import Pic from '../components/Pic'

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

const heroIcon = {
  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
  background: 'var(--color-accent-800)', color: '#fff',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function HeroContact({ icon, children, href }) {
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--color-accent-800)' }}>
      <span style={heroIcon} aria-hidden="true">{icon}</span>
      <span style={{ wordBreak: 'break-word' }}>{children}</span>
    </span>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>
        {body}
      </a>
    )
  }
  return body
}

const svg = {
  phone: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  mail: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  globe: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  at: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>,
}

const infoCell = {
  background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: 0,
  padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4,
}
const infoLabel = { fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }
const infoValue = { fontSize: 14, fontWeight: 700, color: 'var(--color-accent-800)' }

export default function AcademyProfile() {
  const { id } = useParams()
  const { isAdmin, user } = useAuth()
  const [academy, setAcademy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getAcademy(id)
      .then((res) => { if (alive) setAcademy(res.data) })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id, reloadKey])

  if (loading) return <Loading label="Loading academy" />
  if (!academy) return (
    <Empty label="Academy not found" hint="It may have been removed, or the link is wrong.">
      <Link to="/academies" className="btn btn-secondary">All academies</Link>
    </Empty>
  )

  const a = academy
  const country = a.country_detail
  // the academy's own account fills in its page
  const ownsAcademy = user?.role === 'ACADEMY' && user?.academy === a.id

  return (
    <div className="m-zoom">
      {/* Hero */}
      <div className="rule-b m-pad" style={{
        background: 'var(--color-bg)',
        padding: '30px 32px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/academies" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent-800)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 32 }}>
            ← All academies
          </Link>
          {(isAdmin || ownsAcademy) && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>Edit academy</button>
          )}
        </div>
        <OwnerWelcome
          show={ownsAcademy}
          name={a.name}
          items={[
            { label: 'Logo', done: !!a.logo },
            { label: 'Description', done: !!a.description },
            { label: 'Contact details', done: !!(a.phone || a.email || a.website || a.address) },
            { label: 'Instagram', done: !!a.instagram },
          ]}
          actionLabel="Fill in your academy page"
          onAction={() => setEditing(true)}
        />
        {editing && (
          <AcademyModal academy={a} ownerMode={!isAdmin} countries={country ? [country] : []}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); setReloadKey((k) => k + 1) }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
          <span style={{
            width: 148, height: 148, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: '#fff', border: '4px solid var(--color-accent-800)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--color-divider)',
          }}>
            {a.logo ? (
              <Pic kind="logo" w={160} eager src={a.logo} />
            ) : (
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, color: 'var(--color-accent-800)' }}>
                {acronym(a.name)}
              </span>
            )}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800,
              fontSize: 'clamp(24px, 4vw, 40px)', lineHeight: 1.1,
              color: 'var(--color-accent-800)',
            }}>
              {a.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--color-accent-2-700)', flexWrap: 'wrap' }}>
              {country && <Flag code={country.code} name={country.name} />}
              <span>Swimming Academy{country ? ` · ${country.name}` : ''}{a.city ? ` · ${a.city}` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              {a.phone && <HeroContact icon={svg.phone} href={`tel:${a.phone}`}>{a.phone}</HeroContact>}
              {a.email && <HeroContact icon={svg.mail} href={`mailto:${a.email}`}>{a.email}</HeroContact>}
              {a.website && <HeroContact icon={svg.globe} href={/^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}`}>{String(a.website).replace(/^https?:\/\//, '')}</HeroContact>}
              {a.instagram && (
                <HeroContact icon={svg.at} href={`https://instagram.com/${String(a.instagram).replace(/^@/, '')}`}>
                  @{String(a.instagram).replace(/^@/, '')}
                </HeroContact>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="m-pad" style={{ padding: '24px 32px 40px' }}>
        <div style={{ maxWidth: 860 }}>
          {a.description && (
            <div style={{
              background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: 0,
              border: '1px solid var(--color-divider)', padding: '16px 20px', marginBottom: 16,
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)', marginBottom: 8 }}>
                About the Academy
              </div>
              <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {a.description}
              </div>
            </div>
          )}

          {/* Occam's Razor: country, city, phone and email are already in the
              header (as working links), so this card carries only what the
              header does not — the address */}
          {a.address && (
            <div style={{
              background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: 0,
              border: '1px solid var(--color-divider)', padding: '16px 20px',
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)', marginBottom: 4 }}>
                Where to find us
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--color-accent-2-700)' }}>
                <span style={heroIcon} aria-hidden="true">{svg.pin}</span>
                <span style={{ paddingTop: 5 }}>{a.address}</span>
              </div>
            </div>
          )}
          {!a.description && !a.address && (
            <Empty label="This academy has not added its details yet" hint="Training times appear in the calendar below when they are published." />
          )}

          {/* Training calendar */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: 'var(--color-accent-800)', marginBottom: 10 }}>
              Training Calendar
            </div>
            <TrainingCalendar academyId={Number(id)} canEdit={isAdmin || (user?.role === 'ACADEMY' && user?.academy === a.id)} />
          </div>
        </div>
      </div>
    </div>
  )
}
