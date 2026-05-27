import { useState, useEffect, useRef } from 'react'
import KnowledgeMap    from './components/KnowledgeMap.jsx'
import Certifications  from './components/Certifications.jsx'
import Analysis        from './components/Analysis.jsx'
import { CERTIFICATIONS }            from './config/certifications.js'
import { startAnalysis, pollAnalysis, getProfile, saveProfile } from './lib/analysis.js'
import { useAuth }                      from './hooks/useAuth.js'
import { signIn, signOut }              from './lib/auth.js'

// ── Global styles ─────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #060b18; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }

  .chip { transition: all 0.12s ease; cursor: pointer; user-select: none; border: none; }
  .chip:hover { filter: brightness(1.25); transform: translateY(-1px); }

  .cert-card { transition: transform 0.18s ease, box-shadow 0.18s ease; cursor: pointer; }
  .cert-card:hover { transform: translateY(-3px); }

  .tab-btn { background: none; border: none; cursor: pointer; transition: color 0.15s; font-family: 'IBM Plex Sans', sans-serif; }

  .primary-btn { cursor: pointer; transition: filter 0.18s, transform 0.18s; font-family: 'IBM Plex Sans', sans-serif; border: none; }
  .primary-btn:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-2px); }
  .primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .ghost-btn { cursor: pointer; transition: background 0.15s; font-family: 'IBM Plex Sans', sans-serif; }
  .ghost-btn:hover { background: rgba(255,255,255,0.08) !important; }

  .fade-in { animation: fadeIn 0.28s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid-bg {
    background-image:
      linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .tab-short { display: none; }
  .tab-scroll-wrap { position: relative; }

  @media (max-width: 640px) {
    .nav-label    { display: none; }
    .header-stats { display: none; }
    .auth-label   { display: none; }
    .tab-scroll   { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab-scroll::-webkit-scrollbar { display: none; }
    .reanalyze-btn { display: none; }
    .rec-tips     { grid-template-columns: 1fr !important; }
    .tab-full  { display: none; }
    .tab-short { display: inline; }
    .analysis-tab { padding: 10px 10px !important; }
    .tab-scroll-wrap::after {
      content: '';
      position: absolute;
      right: 0; top: 0; bottom: 0;
      width: 32px;
      background: linear-gradient(to right, transparent, #060b18);
      pointer-events: none;
      z-index: 1;
    }
  }
  @media (max-width: 480px) {
    .header-inner  { padding: 0 12px !important; }
    .main-content  { padding: 20px 14px 120px !important; }
    .action-inner  { padding: 10px 14px !important; }
  }
`

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [step,        setStep]       = useState(0)
  const [kmap,        setKmap]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('certpath-kmap') || '{}') } catch { return {} }
  })
  const [owned,       setOwned]      = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('certpath-owned') || '[]')) } catch { return new Set() }
  })
  const [role,        setRole]       = useState(() => localStorage.getItem('certpath-role') || null)
  const [analysis,    setAnalysis]   = useState(null)
  const [loading,     setLoading]    = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [error,       setError]      = useState(null)
  const [aTab,        setATab]       = useState('rec')
  const { idToken, user, authLoading, logout } = useAuth()
  const saveTimer = useRef(null)

  // ── Persist kmap + owned to localStorage ──

  useEffect(() => { localStorage.setItem('certpath-kmap', JSON.stringify(kmap)) }, [kmap])
  useEffect(() => { localStorage.setItem('certpath-owned', JSON.stringify([...owned])) }, [owned])
  useEffect(() => { role ? localStorage.setItem('certpath-role', role) : localStorage.removeItem('certpath-role') }, [role])

  // ── Load profile from DynamoDB once auth resolves ──

  useEffect(() => {
    if (authLoading || !idToken) return
    getProfile(idToken).then(({ kmap: k, owned: o, role: r }) => {
      if (k && Object.keys(k).length) {
        setKmap(k)
        localStorage.setItem('certpath-kmap', JSON.stringify(k))
      }
      if (o && o.length) {
        setOwned(new Set(o))
        localStorage.setItem('certpath-owned', JSON.stringify(o))
      }
      if (r) {
        setRole(r)
        localStorage.setItem('certpath-role', r)
      }
    }).catch(e => console.warn('Profile load failed:', e.message))
  }, [authLoading, idToken])

  // ── Debounce-save profile to DynamoDB on changes ──

  useEffect(() => {
    if (!idToken) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveProfile({ kmap, owned, role }, idToken).catch(e => console.warn('Profile save failed:', e.message))
    }, 2000)
  }, [kmap, owned, role, idToken])

  // ── Resume polling / restore step on mount once auth resolves ──

  useEffect(() => {
    if (authLoading) return
    const savedExecution = sessionStorage.getItem('executionId')
    const postAuthStep   = sessionStorage.getItem('certpath-post-auth-step')

    if (savedExecution && idToken) {
      setLoading(true)
      setStep(2)
      startPolling(savedExecution, idToken)
    } else if (savedExecution) {
      sessionStorage.removeItem('executionId')
    }

    if (postAuthStep && idToken) {
      sessionStorage.removeItem('certpath-post-auth-step')
      setStep(parseInt(postAuthStep, 10))
    }
  }, [authLoading])

  // ── helpers ──

  const cycleService = (service) =>
    setKmap(prev => ({ ...prev, [service]: ((prev[service] || 0) + 1) % 4 }))

  const setBulk = (services, level) =>
    setKmap(prev => {
      const next = { ...prev }
      services.forEach(s => { next[s] = level })
      return next
    })

  const toggleCert = (id) =>
    setOwned(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const total = Object.values(kmap).filter(v => v > 0).length

  function startPolling(executionId, idToken) {
    const interval = setInterval(async () => {
      try {
        const { status, currentStep: step, result } = await pollAnalysis(executionId, idToken)
        setCurrentStep(step || '')
        if (status === 'SUCCEEDED') {
          clearInterval(interval)
          sessionStorage.removeItem('executionId')
          setAnalysis(result)
          setStep(2)
          setATab('rec')
          setLoading(false)
        } else if (status === 'FAILED') {
          clearInterval(interval)
          sessionStorage.removeItem('executionId')
          setError('Analysis failed. Please try again.')
          setLoading(false)
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
    }, 1000)
  }

  const generate = async () => {
    if (!idToken) { sessionStorage.setItem('certpath-post-auth-step', String(step)); signIn(); return }

    setLoading(true)
    setError(null)
    setAnalysis(null)
    setCurrentStep('Starting...')

    const certNames = CERTIFICATIONS
      .filter(c => owned.has(c.id))
      .map(c => `${c.name} (${c.level})`)

    try {
      const { executionId } = await startAnalysis({ kmap, certNames, total, role }, idToken)
      sessionStorage.setItem('executionId', executionId)
      setStep(2)
      startPolling(executionId, idToken)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Analysis failed. Please try again.')
      setLoading(false)
    }
  }

  // ── render ──

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#060b18', minHeight: '100vh', color: '#e2e8f0' }}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 200, background: 'rgba(6,11,24,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="header-inner" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="34" height="34" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 9, boxShadow: '0 0 18px rgba(255,153,0,0.35)', flexShrink: 0 }}>
                <defs>
                  <linearGradient id="cpGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FF9900"/>
                    <stop offset="1" stopColor="#DD4000"/>
                  </linearGradient>
                </defs>
                <rect width="100" height="100" rx="22" fill="url(#cpGrad)"/>
                <path d="M28 72 C40 72 40 50 50 50 C60 50 60 24 72 24" stroke="white" strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.88"/>
                <circle cx="28" cy="72" r="11" fill="white"/>
                <circle cx="50" cy="50" r="11" fill="white"/>
                <circle cx="72" cy="24" r="11" fill="white"/>
              </svg>
            <div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 15, color: '#ff9900', letterSpacing: '0.1em', lineHeight: 1 }}>CERTPATH</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#334155', letterSpacing: '0.25em', marginTop: 1 }}>AWS · AI-POWERED</div>
            </div>
          </div>

          <nav style={{ display: 'flex' }}>
            {[['Knowledge Map', 0], ['Certifications', 1], ['Your Path', 2]].map(([label, i]) => (
              <button key={i} className="tab-btn" onClick={() => setStep(i)}
                style={{ padding: '0 14px', height: 60, fontSize: 13, color: step === i ? '#ff9900' : '#4b5563', fontWeight: step === i ? 600 : 400, borderBottom: `2px solid ${step === i ? '#ff9900' : 'transparent'}` }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, marginRight: 4, color: step === i ? '#ff9900' : '#1e293b' }}>{i + 1}.</span>
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="header-stats" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#334155' }}>
              {total > 0 && <span>{total} services</span>}
              {total > 0 && owned.size > 0 && <span style={{ color: '#1e293b' }}> · </span>}
              {owned.size > 0 && <span>{owned.size} certs</span>}
            </span>
            {!authLoading && (
              user
                ? <button className="ghost-btn" onClick={() => { logout(); signOut() }}
                    style={{ padding: '4px 10px 4px 4px', background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", display: 'flex', alignItems: 'center', gap: 7 }}>
                    {user.picture
                      ? <img src={user.picture} alt="" referrerPolicy="no-referrer"
                          style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,153,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#ff9900', fontWeight: 700, flexShrink: 0 }}>
                          {(user.name || user.email || '?')[0].toUpperCase()}
                        </div>
                    }
                    <span className="auth-label">{user.name?.split(' ')[0] || user.email?.split('@')[0] || 'Account'}</span>
                    <span style={{ color: '#334155', fontSize: 9 }}>↩</span>
                  </button>
                : <button className="ghost-btn" onClick={signIn}
                    style={{ padding: '5px 12px', background: 'rgba(255,153,0,0.08)', color: '#ff9900', border: '1px solid rgba(255,153,0,0.25)', borderRadius: 6, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
                    Sign in
                  </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="grid-bg main-content" style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 24px 120px' }}>
        {step === 0 && <KnowledgeMap kmap={kmap} onToggle={cycleService} onBulkSet={setBulk} />}
        {step === 1 && <Certifications owned={owned} onToggle={toggleCert} role={role} onRoleChange={setRole} />}
        {step === 2 && (
          <Analysis
            analysis={analysis}
            loading={loading}
            currentStep={currentStep}
            error={error}
            aTab={aTab}
            setATab={setATab}
            onGenerate={generate}
            onReanalyze={generate}
          />
        )}
      </main>

      {/* ── Bottom action bar ── */}
      {(step < 2 || (!analysis && !loading)) && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(6,11,24,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)', zIndex: 150, backdropFilter: 'blur(12px)' }}>
          <div className="action-inner" style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#1e293b' }}>
              {step === 0 && `${total} service${total !== 1 ? 's' : ''} marked`}
              {step === 1 && `${owned.size} certification${owned.size !== 1 ? 's' : ''} selected`}
              {step === 2 && 'Ready to analyze'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && step < 2 && (
                <button className="ghost-btn" onClick={() => setStep(s => s - 1)}
                  style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, whiteSpace: 'nowrap' }}>
                  ← Back
                </button>
              )}
              <button className="primary-btn" disabled={loading}
                onClick={step === 0 ? () => setStep(1) : step === 1 ? generate : generate}
                style={{
                  padding: '10px 26px', borderRadius: 8, fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
                  background: (step === 1 || step === 2) ? 'linear-gradient(135deg,#ff9900,#ff5500)' : 'rgba(255,153,0,0.1)',
                  color: (step === 1 || step === 2) ? '#000' : '#ff9900',
                  border: step === 0 ? '1px solid rgba(255,153,0,0.3)' : 'none',
                  whiteSpace: 'nowrap',
                }}>
                {loading ? 'Analyzing…' : step === 0
                  ? <><span className="tab-full">Next: My Certifications →</span><span className="tab-short">Next →</span></>
                  : <><span className="tab-full">⚡ Generate My Path</span><span className="tab-short">⚡ Generate</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
