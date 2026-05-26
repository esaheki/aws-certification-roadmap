import { useState, useEffect } from 'react'
import KnowledgeMap    from './components/KnowledgeMap.jsx'
import Certifications  from './components/Certifications.jsx'
import Analysis        from './components/Analysis.jsx'
import { CERTIFICATIONS }            from './config/certifications.js'
import { startAnalysis, pollAnalysis } from './lib/analysis.js'

// ── Global styles ─────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@700;800;900&display=swap');
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
`

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [step,        setStep]       = useState(0)
  const [kmap,        setKmap]       = useState({})
  const [owned,       setOwned]      = useState(new Set())
  const [analysis,    setAnalysis]   = useState(null)
  const [loading,     setLoading]    = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [error,       setError]      = useState(null)
  const [aTab,        setATab]       = useState('rec')

  // ── Resume polling on mount if an execution was in-flight ──

  useEffect(() => {
    const saved = sessionStorage.getItem('executionId')
    if (saved) {
      setLoading(true)
      setStep(2)
      startPolling(saved)
    }
  }, [])

  // ── helpers ──

  const cycleService = (service) =>
    setKmap(prev => ({ ...prev, [service]: ((prev[service] || 0) + 1) % 4 }))

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
    }, 2000)
  }

  const generate = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    setCurrentStep('Starting...')

    const certNames = CERTIFICATIONS
      .filter(c => owned.has(c.id))
      .map(c => `${c.name} (${c.level})`)

    try {
      // TODO: pass Cognito idToken once auth is implemented
      const { executionId } = await startAnalysis({ kmap, certNames, total } /*, idToken */)
      sessionStorage.setItem('executionId', executionId)
      setStep(2)
      startPolling(executionId /*, idToken */)
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
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#ff9900 0%,#ff5500 100%)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, boxShadow: '0 0 18px rgba(255,153,0,0.35)' }}>☁</div>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 900, fontSize: 15, color: '#ff9900', letterSpacing: '0.1em', lineHeight: 1 }}>CERTPATH</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#334155', letterSpacing: '0.25em', marginTop: 1 }}>AWS · AI-POWERED</div>
            </div>
          </div>

          <nav style={{ display: 'flex' }}>
            {[['Knowledge Map', 0], ['Certifications', 1], ['Your Path', 2]].map(([label, i]) => (
              <button key={i} className="tab-btn" onClick={() => setStep(i)}
                style={{ padding: '0 20px', height: 60, fontSize: 13, color: step === i ? '#ff9900' : '#4b5563', fontWeight: step === i ? 600 : 400, borderBottom: `2px solid ${step === i ? '#ff9900' : 'transparent'}` }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, marginRight: 6, color: step === i ? '#ff9900' : '#1e293b' }}>{i + 1}.</span>
                {label}
              </button>
            ))}
          </nav>

          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#334155', textAlign: 'right' }}>
            {total > 0 && <span>{total} services</span>}
            {total > 0 && owned.size > 0 && <span style={{ color: '#1e293b' }}> · </span>}
            {owned.size > 0 && <span>{owned.size} certs</span>}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="grid-bg" style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 24px 120px' }}>
        {step === 0 && <KnowledgeMap kmap={kmap} onToggle={cycleService} />}
        {step === 1 && <Certifications owned={owned} onToggle={toggleCert} />}
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
          <div style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#1e293b' }}>
              {step === 0 && `${total} service${total !== 1 ? 's' : ''} marked`}
              {step === 1 && `${owned.size} certification${owned.size !== 1 ? 's' : ''} selected`}
              {step === 2 && 'Ready to analyze'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && step < 2 && (
                <button className="ghost-btn" onClick={() => setStep(s => s - 1)}
                  style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13 }}>
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
                }}>
                {loading ? 'Analyzing…' : step === 0 ? 'Next: My Certifications →' : '⚡ Generate My Path'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
