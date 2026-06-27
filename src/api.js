// Autentisert HTTP-klient mot Inntektsportalen-API-et. Legger på Bearer-token
// (OAuth), og oversetter API-feil til lesbare meldinger for MCP-klienten.
import { getAccessToken, API } from './oauth.js'

export async function api(method, path, body) {
  const token = await getAccessToken()
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  const text = await resp.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!resp.ok) {
    const msg = (data && (data.error || data.message)) || text || `HTTP ${resp.status}`
    if (resp.status === 403 && data?.code) {
      // Default-deny / manglende scope fra mcpGuard.
      throw new Error(`Ikke tilgang (${data.code}): ${msg}. Denne handlingen er enten utenfor det MCP-en kan gjøre, eller du har ikke gitt nødvendig scope.`)
    }
    throw new Error(`API-feil ${resp.status}: ${msg}`)
  }
  return data
}

export const apiGet = (p) => api('GET', p)
export const apiPost = (p, b) => api('POST', p, b ?? {})
export const apiPut = (p, b) => api('PUT', p, b ?? {})
export const apiDelete = (p) => api('DELETE', p)
