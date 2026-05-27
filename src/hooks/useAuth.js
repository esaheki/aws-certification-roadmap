import { useState, useEffect } from 'react'
import { exchangeCodeForTokens, decodeIdToken } from '../lib/auth.js'

const TOKEN_KEY = 'certpath-id-token'

export function useAuth() {
  const [idToken, setIdToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => {
    const t = sessionStorage.getItem(TOKEN_KEY)
    return t ? decodeIdToken(t) : null
  })
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')

    if (code) {
      url.searchParams.delete('code')
      url.searchParams.delete('state')
      window.history.replaceState({}, '', url.pathname + url.search)

      exchangeCodeForTokens(code)
        .then(({ id_token }) => {
          sessionStorage.setItem(TOKEN_KEY, id_token)
          setIdToken(id_token)
          setUser(decodeIdToken(id_token))
        })
        .catch(err => console.error('Auth error:', err))
        .finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
  }, [])

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setIdToken(null)
    setUser(null)
  }

  return { idToken, user, authLoading, logout }
}
