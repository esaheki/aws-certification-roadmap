const COGNITO_DOMAIN = 'auth.esaheki.com'
const CLIENT_ID = '5te63com7b0g3342ec287o6tvk'

function getRedirectUri() {
  return window.location.hostname === 'localhost'
    ? 'http://localhost:5173/callback'
    : 'https://esaheki.com/aws'
}

export function signIn() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: getRedirectUri(),
    identity_provider: 'Google',
  })
  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`
}

export function signOut() {
  const redirectUri = getRedirectUri()
  const logoutUri = redirectUri.replace('/callback', '')
  const params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: logoutUri })
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`
}

export async function exchangeCodeForTokens(code) {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: getRedirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

export function decodeIdToken(idToken) {
  try {
    const payload = idToken.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}
