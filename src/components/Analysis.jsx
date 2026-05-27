import { useState, useEffect } from 'react'

const STEPS = [
  'Analyzing your AWS knowledge map...',
  'Certification path identified...',
  'Loading official exam guide...',
  'Generating your personalized roadmap...',
  'Almost there...',
]

export default function Analysis({ analysis, loading, currentStep, error, aTab, setATab, onGenerate, onReanalyze }) {
  const [autoIdx, setAutoIdx] = useState(-1)

  useEffect(() => {
    if (!loading) { setAutoIdx(-1); return }
    setAutoIdx(0)
    const t = setInterval(() => setAutoIdx(i => i < STEPS.length - 1 ? i + 1 : i), 4000)
    return () => clearInterval(t)
  }, [loading])

  const actualIdx  = STEPS.indexOf(currentStep)
  const displayIdx = Math.max(autoIdx, actualIdx)
  const tabs = [
    ['rec',        '🎯 Recommendation', '🎯 Rec'  ],
    ['gaps',       '⚠️ Gaps',           '⚠️ Gaps' ],
    ['roadmap',    '🗺 Roadmap',        '🗺 Map'  ],
    ['projects',   '🔨 Projects',       '🔨 Build'],
  ]
  if (analysis?.examDomains?.length) tabs.push(['examDomains', '📋 Exam Guide', '📋 Exam'])

  return (
    <div className="fade-in">

      {/* ── Empty / Error state ── */}
      {!analysis && !loading && (
        <div style={{ textAlign: 'center', padding: '72px 0' }}>
          <div style={{ fontSize: 52, marginBottom: 18 }}>🎯</div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 26, marginBottom: 10 }}>Ready to Analyze</h2>
          <p style={{ color: '#475569', fontSize: 14, maxWidth: 420, margin: '0 auto 28px', lineHeight: 1.7 }}>
            The AI will review your knowledge map and certifications, then recommend your optimal next step.
          </p>
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button className="primary-btn" onClick={onGenerate}
            style={{ padding: '14px 36px', background: 'linear-gradient(135deg,#ff9900,#ff5500)', color: '#000', border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 700, letterSpacing: '0.03em' }}>
            ⚡ Generate My Certification Path
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ maxWidth: 480, margin: '80px auto 0', padding: '0 24px' }}>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 20, color: '#fff', marginBottom: 36, textAlign: 'center', letterSpacing: '-0.01em' }}>
            Building your certification path…
          </div>
          {STEPS.map((step, i) => {
            const isDone    = displayIdx > i
            const isActive  = displayIdx === i
            const isPending = displayIdx < i
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, opacity: isPending ? 0.3 : 1, transition: 'opacity 0.4s ease' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  background: isDone ? 'rgba(45,212,191,0.15)' : isActive ? 'rgba(255,153,0,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${isDone ? '#2dd4bf' : isActive ? '#ff9900' : 'rgba(255,255,255,0.1)'}`,
                  transition: 'all 0.4s ease',
                }}>
                  {isDone
                    ? <span style={{ color: '#2dd4bf' }}>✓</span>
                    : isActive
                      ? <div className="spin" style={{ width: 10, height: 10, border: '2px solid rgba(255,153,0,0.25)', borderTop: '2px solid #ff9900', borderRadius: '50%' }} />
                      : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8 }}>●</span>
                  }
                </div>
                <span style={{ fontSize: 13, color: isDone ? '#2dd4bf' : isActive ? '#f1f5f9' : '#475569', fontWeight: isActive ? 600 : 400, transition: 'color 0.4s ease' }}>
                  {step.replace('...', '')}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Results ── */}
      {analysis && !loading && (
        <>
          {/* Tab bar */}
          <div className="tab-scroll-wrap" style={{ marginBottom: 36 }}>
            <div className="tab-scroll" style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {tabs.map(([id, label, short]) => (
                <button key={id} className="tab-btn analysis-tab" onClick={() => setATab(id)}
                  style={{ padding: '10px 16px', fontSize: 13, fontWeight: aTab === id ? 600 : 400, color: aTab === id ? '#ff9900' : '#4b5563', marginBottom: -1, background: 'none', border: 'none', borderBottom: `2px solid ${aTab === id ? '#ff9900' : 'transparent'}`, cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span className="tab-full">{label}</span>
                  <span className="tab-short">{short}</span>
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button className="ghost-btn reanalyze-btn" onClick={onReanalyze}
                style={{ padding: '8px 16px', fontSize: 12, color: '#334155', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, margin: '6px 0', background: 'transparent', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif", flexShrink: 0 }}>
                ↺ Re-analyze
              </button>
            </div>
          </div>

          {/* ── Recommendation tab ── */}
          {aTab === 'rec' && (
            <div className="fade-in">
              <div style={{ background: 'rgba(255,153,0,0.05)', border: '1px solid rgba(255,153,0,0.22)', borderRadius: 14, padding: 'clamp(20px,4vw,36px)', marginBottom: 24, boxShadow: '0 0 0 1px rgba(255,153,0,0.25), 0 4px 24px rgba(255,153,0,0.12)' }}>
                <div className="rec-inner" style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#ff9900', letterSpacing: '0.18em', marginBottom: 10 }}>RECOMMENDED NEXT CERTIFICATION</div>
                    <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 28, color: '#fff', marginBottom: 5, lineHeight: 1.2 }}>AWS {analysis.rec.cert}</h2>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#334155', marginBottom: 18 }}>{analysis.rec.code} &nbsp;·&nbsp; {analysis.rec.level}</div>
                    <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.8 }}>{analysis.rec.why}</p>
                    {analysis.metadata?.enriched && (
                      <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '5px 12px' }}>
                        <span style={{ fontSize: 11 }}>✓</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#4ade80', letterSpacing: '0.1em' }}>Based on official AWS exam guide</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 130, padding: '8px 0' }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 52, color: '#ff9900', lineHeight: 1 }}>{analysis.rec.readiness}%</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#334155', letterSpacing: '0.18em', marginBottom: 8 }}>READINESS</div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden', width: 120, margin: '0 auto' }}>
                      <div style={{ height: '100%', width: `${analysis.rec.readiness}%`, background: 'linear-gradient(to right,#ff9900,#ff5500)', borderRadius: 4, transition: 'width 1s cubic-bezier(.16,1,.3,1)' }} />
                    </div>
                    <div style={{ marginTop: 14, fontSize: 13, color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <span>⏱</span><span>{analysis.rec.timeline}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rec-tips" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[['📚','Study smart','Focus on the gaps tab — those are your highest-leverage topics.'],['🏗️','Build to learn','Hands-on projects beat flashcards. Check the Projects tab.'],['✅','Track progress','Re-analyze as you learn to watch your readiness score climb.']].map(([icon, title, body], i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Gaps tab ── */}
          {aTab === 'gaps' && (
            <div className="fade-in">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Knowledge Gaps</h2>
              <p style={{ color: '#475569', fontSize: 13, marginBottom: 24 }}>Services to focus on for your recommended certification:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
                {(analysis.gaps || []).map((g, i) => {
                  const hi = g.priority === 'High'
                  return (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${hi ? 'rgba(239,68,68,0.28)' : 'rgba(245,158,11,0.22)'}`, borderRadius: 10, padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{g.name}</span>
                        <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, background: hi ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: hi ? '#f87171' : '#fcd34d', fontFamily: "'IBM Plex Mono', monospace" }}>{g.priority}</span>
                      </div>
                      <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.65 }}>{g.why}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Roadmap tab ── */}
          {aTab === 'roadmap' && (
            <div className="fade-in">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Study Roadmap</h2>
              <p style={{ color: '#475569', fontSize: 13, marginBottom: 32 }}>Your phased plan to reach AWS {analysis.rec?.cert}:</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(analysis.roadmap || []).map((ph, i) => (
                  <div key={i} style={{ display: 'flex', gap: 20, paddingBottom: i < analysis.roadmap.length - 1 ? 36 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,153,0,0.12)', border: '2px solid #ff9900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 14, color: '#ff9900', flexShrink: 0 }}>{ph.phase}</div>
                      {i < (analysis.roadmap || []).length - 1 && <div style={{ width: 2, flex: 1, marginTop: 4, background: 'linear-gradient(to bottom,rgba(255,153,0,0.35),rgba(255,153,0,0.04))', minHeight: 30 }} />}
                    </div>
                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: 22, marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>{ph.title}</h3>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#334155', background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: 5 }}>{ph.weeks}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                        {(ph.topics || []).map((t, j) => (
                          <span key={j} style={{ padding: '3px 11px', borderRadius: 5, background: 'rgba(255,255,255,0.05)', fontSize: 12, color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>{t}</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#fbbf24' }}>
                        <span>✓</span><span>{ph.goal}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Projects tab ── */}
          {aTab === 'projects' && (
            <div className="fade-in">
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Hands-On Projects</h2>
              <p style={{ color: '#475569', fontSize: 13, marginBottom: 24 }}>Build these to cement your skills and prepare for the exam:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
                {(analysis.projects || []).map((proj, i) => {
                  const dc = proj.diff === 'Beginner' ? '#4ade80' : proj.diff === 'Intermediate' ? '#fcd34d' : '#f87171'
                  const bc = proj.diff === 'Beginner' ? '34,197,94' : proj.diff === 'Intermediate' ? '252,211,77' : '248,113,113'
                  return (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.4 }}>{proj.name}</h3>
                        <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 5, background: `rgba(${bc},0.1)`, color: dc, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0, border: `1px solid rgba(${bc},0.25)` }}>{proj.diff}</span>
                      </div>
                      <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.7, flex: 1 }}>{proj.desc}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(proj.svcs || []).map((s, j) => (
                          <span key={j} style={{ padding: '3px 9px', borderRadius: 5, background: 'rgba(255,153,0,0.1)', color: '#ff9900', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", border: '1px solid rgba(255,153,0,0.2)' }}>{s}</span>
                        ))}
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#334155' }}>⏱ {proj.time} estimated</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Exam Guide tab ── */}
          {aTab === 'examDomains' && (
            <div className="fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 22 }}>Official Exam Domains</h2>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '4px 10px' }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#4ade80', letterSpacing: '0.1em' }}>From official AWS exam guide</span>
                </div>
              </div>
              <p style={{ color: '#475569', fontSize: 13, marginBottom: 24 }}>Domain weights from the official {analysis.metadata?.certCode} exam guide:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(analysis.examDomains || []).map((d, i) => {
                  const pct = parseFloat(d.weight) || 0
                  return (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '18px 22px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{d.domain}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#ff9900', fontWeight: 600 }}>{d.weight}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(to right,#ff9900,#ff5500)', borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
