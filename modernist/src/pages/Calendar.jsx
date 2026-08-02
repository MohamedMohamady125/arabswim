import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCalendarEvents } from '../api/calendar'
import { getChampionships } from '../api/championships'
import { getSwimmerBirthdays } from '../api/swimmers'
import Flag from '../components/Flag'
import { PageHead, Loading, Empty, SectHead } from '../components/ui'
import { formatDateRange, MONTHS_FULL } from '../utils'

function parseMeetDate(d) {
  if (!d) return null
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function Countdown({ target }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86400000)
  const hrs = Math.floor((diff % 86400000) / 3600000)
  const min = Math.floor((diff % 3600000) / 60000)
  const cells = [[days, 'Days'], [String(hrs).padStart(2, '0'), 'Hrs'], [String(min).padStart(2, '0'), 'Min']]
  return (
    <div style={{ display: 'flex', gap: 1, background: 'var(--color-divider)', marginTop: 14, maxWidth: 360 }}>
      {cells.map(([v, l]) => (
        <div key={l} style={{ flex: 1, background: 'var(--color-bg)', padding: '8px 10px' }}>
          <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24 }}>{v}</div>
          <div className="micro" style={{ fontSize: 10 }}>{l}</div>
        </div>
      ))}
    </div>
  )
}

export default function Calendar() {
  const [meets, setMeets] = useState([])
  const [calEvents, setCalEvents] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const month = new Date().getMonth() + 1
    async function load() {
      try {
        const [meetsRes, calRes, bdayRes] = await Promise.allSettled([
          getChampionships({ page_size: 200 }),
          getCalendarEvents(),
          getSwimmerBirthdays(month),
        ])
        if (!alive) return
        const val = (r) => (r.status === 'fulfilled' ? r.value.data : null)
        const list = (d) => (Array.isArray(d) ? d : d?.results || [])
        setMeets(list(val(meetsRes)))
        setCalEvents(list(val(calRes)))
        setBirthdays(list(val(bdayRes)))
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // upcoming = championships + calendar events, merged, sorted by date
  const upcoming = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const meetItems = meets
      .map((m) => ({ kind: 'meet', item: m, d: parseMeetDate(m.date) }))
    const calItems = calEvents
      .map((e) => ({ kind: 'event', item: e, d: parseMeetDate(e.date || e.start_date) }))
    return [...meetItems, ...calItems]
      .filter((x) => x.d && x.d >= today)
      .sort((a, b) => a.d - b.d)
  }, [meets, calEvents])

  const featured = upcoming[0]

  const groups = useMemo(() => {
    const out = []
    let cur = null
    upcoming.forEach((x) => {
      const key = `${MONTHS_FULL[x.d.getMonth()]} ${x.d.getFullYear()}`
      if (!cur || cur.key !== key) {
        cur = { key, items: [] }
        out.push(cur)
      }
      cur.items.push(x)
    })
    return out
  }, [upcoming])

  const today = new Date()
  const todayBirthdays = birthdays.filter((b) => b.day === today.getDate())

  if (loading) return <Loading label="Loading calendar" />

  return (
    <div>
      <PageHead kicker="Season" title="Calendar" sub="Upcoming championships and events across the Arab world" />

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 380px' }}>
        {/* left: featured + upcoming */}
        <div className="rule-r">
          {/* featured next meet */}
          <div className="rule-b pad-lg">
            <div className="kicker" style={{ marginBottom: 8 }}>Next up</div>
            {featured ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {featured.kind === 'meet' && (
                    <Flag code={featured.item.country_detail?.code} name={featured.item.country_detail?.name} large />
                  )}
                  <div>
                    {featured.kind === 'meet' ? (
                      <Link to={`/meets/${featured.item.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        <h2 style={{ margin: 0, letterSpacing: '-0.02em' }}>{featured.item.name}</h2>
                      </Link>
                    ) : (
                      <h2 style={{ margin: 0, letterSpacing: '-0.02em' }}>{featured.item.title || featured.item.name}</h2>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 6 }}>
                      {featured.item.location}
                      {featured.item.country_detail ? `, ${featured.item.country_detail.name}` : ''}
                      {' · '}{formatDateRange(featured.item.date, featured.item.end_date)}
                      {featured.item.pool ? ` · ${featured.item.pool}` : ''}
                    </div>
                  </div>
                </div>
                <Countdown target={featured.d.getTime()} />
              </>
            ) : (
              <div className="text-muted" style={{ fontSize: 13 }}>Nothing scheduled yet.</div>
            )}
          </div>

          {/* upcoming grouped by month */}
          {groups.length === 0 && <Empty label="No upcoming meets or events" />}
          {groups.map((g) => (
            <div key={g.key} className="rule-b">
              <div className="pad" style={{ paddingBottom: 10 }}>
                <div className="kicker">{g.key}</div>
              </div>
              {g.items.map((x, i) => (
                <div
                  key={`${x.kind}-${x.item.id}`}
                  className={i < g.items.length - 1 ? 'hair-b' : ''}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 32px' }}
                >
                  <div className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, width: 34, flex: 'none', textAlign: 'center' }}>
                    {x.d.getDate()}
                  </div>
                  {x.kind === 'meet' && <Flag code={x.item.country_detail?.code} name={x.item.country_detail?.name} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {x.kind === 'meet' ? (
                      <Link to={`/meets/${x.item.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                        {x.item.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{x.item.title || x.item.name}</span>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                      {x.item.location}
                      {' · '}{formatDateRange(x.item.date, x.item.end_date)}
                    </div>
                  </div>
                  {x.item.pool && <span className="tag tag-neutral hide-mobile">{x.item.pool}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* right: birthdays */}
        <div>
          <div className="rule-b" style={{ padding: '24px 28px' }}>
            <SectHead title="Birthdays today" />
            {todayBirthdays.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No birthdays today.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todayBirthdays.map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link to={`/swimmers/${b.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, flex: 1 }}>{b.name}</Link>
                    {b.age > 0 && <span className="micro">turns {b.age}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '24px 28px' }}>
            <SectHead title={`Birthdays · ${MONTHS_FULL[today.getMonth()]}`} />
            {birthdays.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 13 }}>No birthdays this month.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {birthdays.map((b, i) => (
                  <div
                    key={b.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: i < birthdays.length - 1 ? '1px solid var(--color-divider)' : 'none' }}
                  >
                    <span className="asw-num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, width: 24, textAlign: 'center', flex: 'none' }}>{b.day}</span>
                    <Link to={`/swimmers/${b.id}`} style={{ color: 'inherit', textDecoration: 'none', fontSize: 13, flex: 1 }}>{b.name}</Link>
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
                      {b.nationality}{b.age > 0 ? ` · ${b.age}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
