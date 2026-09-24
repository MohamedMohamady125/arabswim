import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAcademy } from '../api/academies'
import Flag from '../components/Flag'
import { Loading, Empty } from '../components/ui'
import { mediaUrl } from '../utils'

function acronym(name) {
  const words = String(name || '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase()
}

const heroIcon = {
  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
  background: '#1a56a0', color: '#fff',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function HeroContact({ icon, children, href }) {
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: '#0b2948' }}>
      <span style={heroIcon}>{icon}</span>
      <span style={{ wordBreak: 'break-word' }}>{children}</span>
    </span>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
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
  background: '#fff', border: '1px solid #e2e9f2', borderRadius: 10,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
}
const infoLabel = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#7a8aa0' }
const infoValue = { fontSize: 14, fontWeight: 700, color: '#0b2948' }

export default function AcademyProfile() {
  const { id } = useParams()
  const [academy, setAcademy] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getAcademy(id)
      .then((res) => { if (alive) setAcademy(res.data) })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  if (loading) return <Loading label="Loading academy" />
  if (!academy) return <Empty label="Academy not found" />

  const a = academy
  const country = a.country_detail

  return (
    <div>
      {/* Hero */}
      <div className="rule-b" style={{
        background: 'linear-gradient(120deg, #eef5fc 0%, #f6fafe 45%, #dcecf9 100%)',
        padding: '30px 32px 28px',
      }}>
        <Link to="/academies" style={{ fontSize: 12.5, fontWeight: 700, color: '#1a56a0', textDecoration: 'none' }}>
          ← All academies
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginTop: 16, flexWrap: 'wrap' }}>
          <span style={{
            width: 148, height: 148, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: '#fff', border: '4px solid #0c2340',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(11,41,72,.18)',
          }}>
            {a.logo ? (
              <img src={mediaUrl(a.logo)} alt="" style={{ width: '84%', height: '84%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, color: '#1a56a0' }}>
                {acronym(a.name)}
              </span>
            )}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 800,
              fontSize: 'clamp(24px, 4vw, 40px)', lineHeight: 1.1,
              textTransform: 'uppercase', letterSpacing: '.01em', color: '#0b2948',
            }}>
              {a.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13.5, fontWeight: 600, color: '#37567a', flexWrap: 'wrap' }}>
              {country && <Flag code={country.code} name={country.name} />}
              <span>Swimming Academy{country ? ` · ${country.name}` : ''}{a.city ? ` · ${a.city}` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 16, flexWrap: 'wrap' }}>
              {a.phone && <HeroContact icon={svg.phone} href={`tel:${a.phone}`}>{a.phone}</HeroContact>}
              {a.email && <HeroContact icon={svg.mail} href={`mailto:${a.email}`}>{a.email}</HeroContact>}
              {a.website && <HeroContact icon={svg.globe} href={a.website}>{String(a.website).replace(/^https?:\/\//, '')}</HeroContact>}
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
      <div style={{ background: '#eaf1f9', padding: '26px 32px 40px' }}>
        <div style={{ maxWidth: 860 }}>
          {a.description && (
            <div style={{
              background: '#fff', border: '1px solid #e2e9f2', borderRadius: 12,
              boxShadow: '0 1px 6px rgba(11,41,72,.06)', padding: '18px 20px', marginBottom: 16,
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0b2948', marginBottom: 8 }}>
                About the Academy
              </div>
              <div className="text-muted" style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {a.description}
              </div>
            </div>
          )}

          <div style={{
            background: '#fff', border: '1px solid #e2e9f2', borderRadius: 12,
            boxShadow: '0 1px 6px rgba(11,41,72,.06)', padding: '18px 20px',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, color: '#0b2948', marginBottom: 12 }}>
              Academy Information
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {country && (
                <div style={infoCell}>
                  <span style={infoLabel}>Country</span>
                  <span style={{ ...infoValue, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Flag code={country.code} name={country.name} /> {country.name}
                  </span>
                </div>
              )}
              {a.city && (
                <div style={infoCell}>
                  <span style={infoLabel}>City</span>
                  <span style={infoValue}>{a.city}</span>
                </div>
              )}
              {a.phone && (
                <div style={infoCell}>
                  <span style={infoLabel}>Phone</span>
                  <span style={infoValue}>{a.phone}</span>
                </div>
              )}
              {a.email && (
                <div style={infoCell}>
                  <span style={infoLabel}>Email</span>
                  <span style={{ ...infoValue, wordBreak: 'break-all' }}>{a.email}</span>
                </div>
              )}
            </div>
            {a.address && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14, fontSize: 13.5, color: '#37567a' }}>
                <span style={heroIcon}>{svg.pin}</span>
                <span style={{ paddingTop: 5 }}>{a.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
