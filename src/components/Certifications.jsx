import { CERTIFICATIONS, CERT_LEVEL_STYLES, CERT_LEVELS_ORDER } from '../config/certifications.js'

const ROLES = [
  { id: 'cloud-architect',    label: 'Cloud Architect',        icon: '🏗' },
  { id: 'developer',          label: 'Developer',              icon: '💻' },
  { id: 'devops',             label: 'DevOps / CloudOps',      icon: '⚙️' },
  { id: 'data-engineer',      label: 'Data Engineer',          icon: '📊' },
  { id: 'ml-engineer',        label: 'ML / AI Engineer',       icon: '🤖' },
  { id: 'security',           label: 'Security Engineer',      icon: '🔒' },
  { id: 'networking',         label: 'Network Engineer',       icon: '🌐' },
  { id: 'generative-ai',      label: 'GenAI Developer',        icon: '✨' },
  { id: 'cloud-practitioner', label: 'Cloud Generalist',       icon: '☁️' },
]

export default function Certifications({ owned, onToggle, role, onRoleChange }) {
  return (
    <div className="fade-in">
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 30, marginBottom: 10, background: 'linear-gradient(to right,#fff,#94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Your Certifications
        </h1>
        <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
          Select every AWS certification you currently hold — the AI builds around what you already know.
        </p>
      </div>

      {/* ── Role selector ── */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.18em', color: '#ff9900', marginBottom: 14, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ height: 1, width: 16, background: '#ff9900', opacity: 0.4 }} />
          Your Current or Target Role
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ROLES.map(r => {
            const active = role === r.id
            return (
              <button key={r.id} onClick={() => onRoleChange(active ? null : r.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(255,153,0,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? 'rgba(255,153,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#ff9900' : '#64748b',
                  cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 14 }}>{r.icon}</span>
                {r.label}
              </button>
            )
          })}
        </div>
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
