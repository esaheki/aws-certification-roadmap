const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://vd6qepmrlb.execute-api.us-east-1.amazonaws.com/prod').replace(/\/$/, '')

export async function startAnalysis({ kmap, certNames, total, role }, idToken) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken && { Authorization: idToken }),
    },
    body: JSON.stringify({ kmap, certNames, total, role }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function pollAnalysis(executionId, idToken) {
  const res = await fetch(`${API_BASE}/analyze/${executionId}`, {
    headers: { ...(idToken && { Authorization: idToken }) },
  })
  if (!res.ok) throw new Error(`Poll error ${res.status}`)
  return res.json()
}

export async function getProfile(idToken) {
  const res = await fetch(`${API_BASE}/profile`, {
    headers: { ...(idToken && { Authorization: idToken }) },
  })
  if (!res.ok) throw new Error(`Profile fetch error ${res.status}`)
  return res.json()
}

export async function saveProfile({ kmap, owned, role }, idToken) {
  const res = await fetch(`${API_BASE}/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken && { Authorization: idToken }),
    },
    body: JSON.stringify({ kmap, owned: [...owned], role }),
  })
  if (!res.ok) throw new Error(`Profile save error ${res.status}`)
}
