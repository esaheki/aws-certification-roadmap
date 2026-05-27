import { SERVICES, PROFICIENCY_LEVELS } from '../config/services.js'

const BULK_LABELS = ['None', 'B', 'I', 'A']

export default function KnowledgeMap({ kmap, onToggle, onBulkSet }) {
  const lv = (s) => kmap[s] || 0

  const dominantLevel = (svcs) => {
    const counts = [0, 0, 0, 0]
    svcs.forEach(s => counts[lv(s)]++)
    return counts.indexOf(Math.max(...counts))
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 30, marginBottom: 10, background: 'linear-gradient(to right,#fff,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Map Your AWS Knowledge
        </h1>
        <p style={{ color: '#475569', fontSize: 14, maxWidth: 540, lineHeight: 1.7 }}>
          Click each service to cycle your proficiency level, or use the level buttons on each category to set all at once.
        </p>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
          {PROFICIENCY_LEVELS.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
              <div style={{ width: 26, height: 20, borderRadius: 5, background: p.bg, border: `1px solid ${p.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: p.text }}>
                {p.dot || '·'}
              </div>
              <span style={{ color: p.text, fontFamily: "'IBM Plex Mono', monospace" }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {Object.entries(SERVICES).map(([cat, svcs]) => {
          const dominant = dominantLevel(svcs)
          return (
            <div key={cat}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.18em', color: '#334155', marginBottom: 12, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 1, width: 16, background: '#1e293b' }} />
                  {cat}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {BULK_LABELS.map((label, i) => {
                    const p = PROFICIENCY_LEVELS[i]
                    const isActive = dominant === i
                    return (
                      <button
                        key={i}
                        onClick={() => onBulkSet(svcs, i)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 5,
                          fontSize: 10,
                          fontFamily: "'IBM Plex Mono', monospace",
                          cursor: 'pointer',
                          border: `1px solid ${isActive ? p.border : 'rgba(255,255,255,0.07)'}`,
                          background: isActive ? p.bg : 'transparent',
                          color: isActive ? p.text : '#334155',
                          transition: 'all 0.12s ease',
                          letterSpacing: '0.05em',
                        }}
                        title={`Set all ${cat} services to ${PROFICIENCY_LEVELS[i].label}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {svcs.map(s => {
                  const l = lv(s)
                  const p = PROFICIENCY_LEVELS[l]
                  return (
                    <button key={s} className="chip" onClick={() => onToggle(s)}
                      style={{ padding: '6px 14px', borderRadius: 7, background: p.bg, border: `1px solid ${p.border}`, color: p.text, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      {l > 0 && <span style={{ fontSize: 7, letterSpacing: '0.5px', opacity: 0.9 }}>{p.dot}</span>}
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
