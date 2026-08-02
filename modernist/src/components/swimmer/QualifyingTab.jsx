import { useEffect, useState } from 'react'
import { getQualifyingStandards } from '../../api/qualifyingTimes'
import { getSwimmerQualifyingGaps } from '../../api/swimmers'
import { Loading, Empty, Seg } from '../ui'
import { GapBar } from './RecordsTab'

const list = (d) => (Array.isArray(d) ? d : d?.results || [])

export default function QualifyingTab({ swimmerId }) {
  const [standards, setStandards] = useState(null)
  const [gapStandard, setGapStandard] = useState(null)
  const [qualifyingGaps, setQualifyingGaps] = useState([])
  const [gapPool, setGapPool] = useState('LCM')
  const [gapCut, setGapCut] = useState('A')

  useEffect(() => {
    let alive = true
    getQualifyingStandards()
      .then((res) => {
        if (!alive) return
        const l = list(res.data)
        setStandards(l)
        if (l.length > 0) setGapStandard((prev) => prev ?? l[0].id)
      })
      .catch(() => { if (alive) setStandards([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!swimmerId || !gapStandard) return
    let alive = true
    getSwimmerQualifyingGaps(swimmerId, { standard: gapStandard })
      .then((res) => { if (alive) setQualifyingGaps(res.data || []) })
      .catch(() => { if (alive) setQualifyingGaps([]) })
    return () => { alive = false }
  }, [swimmerId, gapStandard])

  if (standards === null) return <Loading label="Loading standards" />
  if (standards.length === 0) return <Empty label="No qualifying standards available" />

  const filteredGaps = (qualifyingGaps || []).filter((g) => g.pool === gapPool && g.cut === gapCut)
  const activeStandard = standards.find((s) => s.id === gapStandard)

  return (
    <div>
      <div className="sect-head">
        <h4>Qualifying standards gap</h4>
        <span className="micro">
          {activeStandard?.name || qualifyingGaps[0]?.standard_name} — based on{' '}
          {qualifyingGaps[0]?.basis === 'all_time' ? 'all-time' : new Date().getFullYear()} best times
        </span>
      </div>

      {/* Standard pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {standards.map((s) => (
          <button key={s.id} type="button" onClick={() => setGapStandard(s.id)}
            className={gapStandard === s.id ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: 12 }}>
            {s.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <Seg options={[{ value: 'LCM', label: 'LCM' }, { value: 'SCM', label: 'SCM' }]} value={gapPool} onChange={setGapPool} />
        <Seg options={[{ value: 'A', label: 'A Cut' }, { value: 'B', label: 'B Cut' }]} value={gapCut} onChange={setGapCut} />
      </div>

      {filteredGaps.length === 0 ? (
        <Empty label={`No qualifying gaps for ${gapPool} ${gapCut} Cut`} />
      ) : (
        <div className="rule-t">
          {filteredGaps.map((g) => {
            const maxGap = Math.max(...filteredGaps.map((x) => Math.abs(x.gap_cs)))
            const barPct = maxGap > 0 ? (Math.abs(g.gap_cs) / maxGap) * 100 : 0
            return (
              <div key={g.event_id} className="hair-b" style={{ padding: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{g.event_name}</span>
                    {g.pool && <span className={`tag ${g.pool === 'SCM' ? 'tag-accent-2' : 'tag-accent'}`}>{g.pool}</span>}
                    <span className="tag tag-neutral">{g.cut} Cut</span>
                  </div>
                  {g.qualified ? (
                    <span className="tag tag-dark">QUALIFIED</span>
                  ) : (
                    <span className="asw-num" style={{ fontWeight: 700, fontSize: 13 }}>+{g.gap_pct}%</span>
                  )}
                </div>
                <GapBar done={g.qualified} barPct={barPct} leftLabel="Your best" rightLabel="Qualifying" />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="asw-time" style={{ fontSize: 15, color: 'var(--color-accent)' }}>{g.swimmer_best}</span>
                  <span className="asw-num" style={{ fontWeight: 700, fontSize: 13, color: g.qualified ? 'var(--asw-fast)' : 'var(--asw-slow)' }}>
                    {g.qualified ? '-' : '+'}{g.gap_time}
                  </span>
                  <span className="asw-time" style={{ fontSize: 15 }}>{g.qualifying_time}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
