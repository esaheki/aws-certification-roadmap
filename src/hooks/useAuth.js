import { useState, useEffect, createContext, useContext } from 'react'
import { decodeIdToken, refreshTokens } from '../lib/auth.js'

/**
 * In-memory token store — intentionally NOT localStorage (XSS safety).
 * Tokens are lost on page refresh; use the refresh token flow to restore them.
 */
let _idToken     = null
let _accessToken = null
let _refreshToken = null

export function setTokens({ idToken, accessToken, refreshToken }) {
  _idToken      = idToken
  _accessToken  = accessToken
  _refreshToken = refreshToken
}

export function getIdToken()     { return _idToken }
export function getAccessToken() { return _accessToken }

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

/**
 * TODO (Claude Code task): wrap your app with <AuthProvider> in main.jsx,
 * implement the callback route to call exchangeCodeForTokens + setTokens,
 * then use useAuth() anywhere you need user/token data.
 */
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // decoded ID token payload
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // On mount: try to restore session via refresh token
    // TODO: store refresh token in httpOnly cookie (backend sets it) or
    //       accept that a page refresh requires re-login (simpler + safer)
    setLoading(false)
  }, [])

  const login = (tokens) => {
    setTokens(tokens)
    setUser(decodeIdToken(tokens.idToken))
  }

  const logout = () => {
    _idToken = _accessToken = _refreshToken = null
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * @returns {{ user: object|null, loading: boolean, login: Function, logout: Function }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}
