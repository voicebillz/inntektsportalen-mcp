// Autentisert HTTP-klient mot Inntektsportalen-API-et. Legger på Bearer-token
// og oversetter API-feil til lesbare meldinger for MCP-klienten.
//
// `makeApi` tar en token-leverandør slik at samme klient brukes både av:
//   - lokal stdio-server (token fra lokal OAuth-cache, se oauth.js), og
//   - remote HTTP-server (token = Bearer fra MCP-klientens forespørsel).
// Slik er feilhåndtering/regelstruktur identisk uansett transport.
export function makeApi(getToken, apiBase) {
  const API = (apiBase || process.env.INNTEKTSPORTALEN_API_URL || 'https://api.inntektsportalen.no').replace(/\/$/, '')

  async function api(method, path, body) {
    const token = await getToken()
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
      if (resp.status === 401) {
        throw new Error(`Ikke autentisert (401): ${msg}. Tilkoblingen må fornyes / godkjennes på nytt.`)
      }
      throw new Error(`API-feil ${resp.status}: ${msg}`)
    }
    return data
  }

  return {
    apiGet: (p) => api('GET', p),
    apiPost: (p, b) => api('POST', p, b ?? {}),
    apiPut: (p, b) => api('PUT', p, b ?? {}),
    apiDelete: (p) => api('DELETE', p)
  }
}
