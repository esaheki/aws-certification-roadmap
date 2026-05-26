const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export async function startAnalysis({ kmap, certNames, total }, idToken) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken && { Authorization: idToken }),
    },
    body: JSON.stringify({ kmap, certNames, total }),
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
