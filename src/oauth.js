// =====================================================================
// OAuth 2.0 (autorisasjonskode + PKCE) mot Inntektsportalen, med loopback-
// redirect. Første gang åpnes nettleseren → du logger inn (Vipps/e-post) og
// godkjenner hvilke seksjoner MCP-en får. Tokens caches lokalt og fornyes
// automatisk via refresh-token.
// =====================================================================
import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { SCOPES_STRING } from './scopes.js'

const API = (process.env.INNTEKTSPORTALEN_API_URL || 'https://api.inntektsportalen.no').replace(/\/$/, '')
const LOOPBACK_PORT = Number(process.env.INNTEKTSPORTALEN_MCP_PORT || 8123)
const REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}/callback`

// Alle scopes MCP-en kan be om. Brukeren huker av/på i samtykke-skjermen.
const DEFAULT_SCOPES = (process.env.INNTEKTSPORTALEN_SCOPES || SCOPES_STRING)

const CONFIG_DIR = path.join(os.homedir(), '.inntektsportalen-mcp')
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json')
const CLIENT_FILE = path.join(CONFIG_DIR, 'client.json')

const b64url = (buf) => buf.toString('base64url')
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const writeJson = (f, obj) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(f, JSON.stringify(obj, null, 2), { mode: 0o600 })
}

function openBrowser(url) {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref() } catch { /* ignore */ }
}

// Sørg for at vi har en registrert klient (dynamisk klientregistrering).
async function ensureClient() {
  const cached = readJson(CLIENT_FILE)
  if (cached?.client_id) return cached
  const resp = await fetch(`${API}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Inntektsportalen MCP',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none'
    })
  })
  if (!resp.ok) throw new Error(`Klientregistrering feilet: ${resp.status} ${await resp.text()}`)
  const data = await resp.json()
  const client = { client_id: data.client_id, client_secret: data.client_secret || null }
  writeJson(CLIENT_FILE, client)
  return client
}

// Interaktiv innlogging via nettleser + loopback-callback.
async function interactiveLogin() {
  const client = await ensureClient()
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))

  const authUrl = `${API}/oauth/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    scope: DEFAULT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString()

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT_URI)
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return }
      const err = u.searchParams.get('error')
      const gotState = u.searchParams.get('state')
      const gotCode = u.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (err) {
        res.end('<h2>Tilgang avslått.</h2><p>Du kan lukke dette vinduet.</p>')
        server.close(); reject(new Error(`Bruker avslo / feil: ${err}`)); return
      }
      if (gotState !== state || !gotCode) {
        res.end('<h2>Ugyldig svar.</h2>')
        server.close(); reject(new Error('Ugyldig state eller manglende kode')); return
      }
      res.end('<h2>Inntektsportalen er koblet til ✔</h2><p>Du kan lukke dette vinduet og gå tilbake.</p>')
      server.close(); resolve(gotCode)
    })
    server.on('error', reject)
    server.listen(LOOPBACK_PORT, '127.0.0.1', () => {
      process.stderr.write(`\n[Inntektsportalen MCP] Åpner nettleseren for innlogging …\nHvis den ikke åpnes, gå til:\n${authUrl}\n\n`)
      openBrowser(authUrl)
    })
  })

  // Bytt kode mot tokens
  const resp = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: verifier
    })
  })
  if (!resp.ok) throw new Error(`Token-utveksling feilet: ${resp.status} ${await resp.text()}`)
  const tok = await resp.json()
  const tokens = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    scope: tok.scope,
    expires_at: Date.now() + (Number(tok.expires_in || 3600) - 60) * 1000
  }
  writeJson(TOKENS_FILE, tokens)
  return tokens
}

async function refresh(tokens) {
  const client = await ensureClient()
  const resp = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id })
  })
  if (!resp.ok) return null // tvinger ny interaktiv innlogging
  const tok = await resp.json()
  const updated = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || tokens.refresh_token,
    scope: tok.scope || tokens.scope,
    expires_at: Date.now() + (Number(tok.expires_in || 3600) - 60) * 1000
  }
  writeJson(TOKENS_FILE, updated)
  return updated
}

let _memo = null
// Returnerer et gyldig access-token (refresher / logger inn ved behov).
export async function getAccessToken() {
  let tokens = _memo || readJson(TOKENS_FILE)
  if (tokens?.access_token && tokens.expires_at > Date.now()) { _memo = tokens; return tokens.access_token }
  if (tokens?.refresh_token) {
    const r = await refresh(tokens)
    if (r) { _memo = r; return r.access_token }
  }
  const fresh = await interactiveLogin()
  _memo = fresh
  return fresh.access_token
}

export { API }
