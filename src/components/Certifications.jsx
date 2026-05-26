import { CERTIFICATIONS, CERT_LEVEL_STYLES, CERT_LEVELS_ORDER } from '../config/certifications.js'

export default function Certifications({ owned, onToggle }) {
  return (
    <div className="fade-in">
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 900, fontSize: 30, marginBottom: 10, background: 'linear-gradient(to right,#fff,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Your Certifications
        </h1>
        <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
          Select every AWS certification you currently hold — the AI builds around what you already know.
        </p>
      </div>

      {CERT_LEVELS_ORDER.map(lvl => {
        const h = CERT_LEVEL_STYLES[lvl]
        return (
          <div key={lvl} style={{ marginBottom: 36 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.18em', color: h.ring, marginBottom: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ height: 1, width: 16, background: h.ring, opacity: 0.4 }} />
              {lvl}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {CERTIFICATIONS.filter(c => c.level === lvl).map(c => {
                const isOwned = owned.has(c.id)
                return (
                  <button key={c.id} className="cert-card" onClick={() => onToggle(c.id)}
                    style={{
                      padding: '18px 20px', borderRadius: 12, minWidth: 178, textAlign: 'left',
                      background: isOwned ? `rgba(${h.glow},0.1)` : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${isOwned ? h.ring : 'rgba(255,255,255,0.07)'}`,
                      boxShadow: isOwned ? `0 0 22px rgba(${h.glow},0.18)` : 'none',
                      position: 'relative', cursor: 'pointer',
                    }}>
                    {/* Checkmark */}
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 5, background: isOwned ? h.ring : 'rgba(255,255,255,0.05)', border: `1px solid ${isOwned ? h.ring : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: isOwned ? '#000' : 'transparent', fontWeight: 700 }}>✓</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: isOwned ? h.ring : '#334155', letterSpacing: '0.14em', marginBottom: 7 }}>{c.code}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isOwned ? '#f1f5f9' : '#475569', paddingRight: 24, lineHeight: 1.4 }}>AWS {c.name}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: '#1e293b' }}>{lvl}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
