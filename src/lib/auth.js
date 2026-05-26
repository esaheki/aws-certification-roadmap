/**
 * AWS Cognito authentication helpers
 *
 * TODO (Claude Code task): implement the functions below.
 *
 * Setup checklist:
 *  1. Create Cognito User Pool in CDK stack (infrastructure/lib/certpath-stack.ts)
 *  2. Add Google as a federated IdP in the User Pool
 *  3. Configure Google OAuth consent screen + credentials in Google Cloud Console
 *  4. Set allowed callback URLs in Cognito App Client
 *  5. Fill in env vars (see .env.example)
 *
 * Useful docs:
 *   https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-userpools-server-app.html
 *   https://docs.amplify.aws/javascript/build-a-backend/auth/
 */

const COGNITO_DOMAIN  = import.meta.env.VITE_COGNITO_DOMAIN
const CLIENT_ID       = import.meta.env.VITE_COGNITO_CLIENT_ID
const REDIRECT_URI    = import.meta.env.VITE_COGNITO_REDIRECT_URI
const REGION          = import.meta.env.VITE_COGNITO_REGION

/**
 * Redirect the user to Cognito hosted UI for Google sign-in.
 */
export function signInWithGoogle() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    identity_provider: 'Google',
    scope: 'openid email profile',
  })
  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`
}

/**
 * Exchange the authorization code (from ?code= query param) for tokens.
 * Call this on the /callback route.
 *
 * @param {string} code  The code from Cognito redirect
 * @returns {Promise<{ idToken: string, accessToken: string, refreshToken: string }>}
 */
export async function exchangeCodeForTokens(code) {
  // TODO: implement
  // POST to https://${COGNITO_DOMAIN}/oauth2/token
  // with grant_type=authorization_code, client_id, redirect_uri, code
  throw new Error('exchangeCodeForTokens() not yet implemented')
}

/**
 * Decode the ID token payload (no verification — trust Cognito).
 * For server-side verification use the Cognito JWKS endpoint.
 *
 * @param {string} idToken
 * @returns {{ sub: string, email: string, name: string, picture: string }}
 */
export function decodeIdToken(idToken) {
  const payload = idToken.split('.')[1]
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
}

/**
 * Sign out — clear local token state and redirect to Cognito logout.
 */
export function signOut() {
  const params = new URLSearchParams({
    client_id:  CLIENT_ID,
    logout_uri: REDIRECT_URI.replace('/callback', ''),
  })
  // TODO: clear token from in-memory store / context first
  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`
}

/**
 * Refresh an access token using a refresh token.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ idToken: string, accessToken: string }>}
 */
export async function refreshTokens(refreshToken) {
  // TODO: implement
  throw new Error('refreshTokens() not yet implemented')
}
