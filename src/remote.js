#!/usr/bin/env node
// =====================================================================
// Inntektsportalen MCP — REMOTE (HTTP / Streamable HTTP) server.
//
// Dette er «lim inn URL i Claude/ChatGPT»-varianten. Den hostes (f.eks. på
// Railway, domene https://mcp.inntektsportalen.no) og snakker MCP-protokollen
// over HTTP. Den lagrer INGEN data og holder INGEN tokens — den er en tynn
// protokoll-bro som videresender til Inntektsportalen-REST-API-et med det
// Bearer-tokenet klienten sender. Backend håndhever all tilgang (default-deny
// + scopes), nøyaktig som for den lokale stdio-serveren.
//
// OAuth: serveren utgir IKKE tokens selv. Den peker (RFC 9728 protected-
// resource discovery) klienten til Inntektsportalen-backenden som autorisasjons-
// server. Mangler Bearer-token svarer den 401 + WWW-Authenticate, som starter
// OAuth-flyten i klienten (nettleser → Vipps/e-post + samtykke).
//
// Verktøyene defineres i tools.js — delt med stdio-serveren, så regelstrukturen
// er identisk uansett transport.
// =====================================================================
import express from 'express'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { makeApi } from './api.js'
import { registerTools } from './tools.js'
import { SCOPES } from './scopes.js'

// Backend (autorisasjonsserver + REST-API) som verktøyene kaller.
const API_BASE = (process.env.INNTEKTSPORTALEN_API_URL || 'https://api.inntektsportalen.no').replace(/\/$/, '')
// Denne serverens egen offentlige URL (brukes i discovery-metadata).
const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || 'https://mcp.inntektsportalen.no').replace(/\/$/, '')
const PORT = Number(process.env.PORT || 8787)
const MCP_PATH = '/mcp'
const RESOURCE_URL = `${PUBLIC_URL}${MCP_PATH}`

const app = express()
app.use(express.json({ limit: '4mb' }))

// CORS — MCP-klienter (inkl. nettleserbaserte) må kunne lese sesjons-headeren.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, mcp-session-id, mcp-protocol-version, last-event-id')
  res.set('Access-Control-Expose-Headers', 'mcp-session-id, www-authenticate')
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Helse-sjekk for Railway.
app.get('/health', (_req, res) => res.json({ ok: true, service: 'inntektsportalen-mcp', resource: RESOURCE_URL }))

// ---------------------------------------------------------------------
// OAuth discovery (RFC 9728) — forteller klienten hvor den skal autentisere.
// ---------------------------------------------------------------------
const protectedResourceMetadata = {
  resource: RESOURCE_URL,
  authorization_servers: [API_BASE],
  scopes_supported: SCOPES,
  bearer_methods_supported: ['header']
}
app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json(protectedResourceMetadata))
// Noen klienter spør på den ressurs-suffikserte varianten.
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json(protectedResourceMetadata))

// Bekvemmelighet: speil autorisasjonsserver-metadataen fra backend (noen
// klienter prøver denne på MCP-domenet først).
app.get('/.well-known/oauth-authorization-server', async (_req, res) => {
  try {
    const r = await fetch(`${API_BASE}/.well-known/oauth-authorization-server`)
    res.status(r.status).type('application/json').send(await r.text())
  } catch {
    res.status(502).json({ error: 'upstream_unavailable' })
  }
})

// Mangler Bearer-token → 401 som peker klienten til discovery (starter OAuth).
function unauthorized(res) {
  res.set('WWW-Authenticate', `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`)
  return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer-token kreves. Koble til via OAuth.' })
}
const bearerFrom = (req) => {
  const h = req.headers['authorization'] || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

// ---------------------------------------------------------------------
// Streamable HTTP transport med sesjonshåndtering.
// Hver sesjon har en mutbar token-holder som oppdateres per forespørsel,
// slik at fornyede access-tokens fra klienten tas i bruk umiddelbart.
// ---------------------------------------------------------------------
const sessions = Object.create(null) // sessionId -> { transport, tokenHolder }

app.post(MCP_PATH, async (req, res) => {
  const token = bearerFrom(req)
  if (!token) return unauthorized(res)

  const sessionId = req.headers['mcp-session-id']
  let entry = sessionId ? sessions[sessionId] : undefined

  if (entry) {
    entry.tokenHolder.token = token // bruk nyeste token
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const tokenHolder = { token }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { sessions[sid] = { transport, tokenHolder } }
    })
    transport.onclose = () => { if (transport.sessionId) delete sessions[transport.sessionId] }

    const server = new McpServer({ name: 'inntektsportalen', version: '0.1.0' })
    registerTools(server, makeApi(async () => tokenHolder.token, API_BASE))
    await server.connect(transport)
    entry = { transport, tokenHolder }
  } else {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Ugyldig eller manglende sesjon' }, id: null })
  }

  await entry.transport.handleRequest(req, res, req.body)
})

// GET = server→klient-strøm (SSE), DELETE = avslutt sesjon.
async function sessionRequest(req, res) {
  if (!bearerFrom(req)) return unauthorized(res)
  const sessionId = req.headers['mcp-session-id']
  const entry = sessionId ? sessions[sessionId] : undefined
  if (!entry) return res.status(400).json({ error: 'Ugyldig eller manglende sesjon' })
  const token = bearerFrom(req)
  if (token) entry.tokenHolder.token = token
  await entry.transport.handleRequest(req, res)
}
app.get(MCP_PATH, sessionRequest)
app.delete(MCP_PATH, sessionRequest)

app.listen(PORT, () => {
  process.stdout.write(`[Inntektsportalen MCP] remote klar på :${PORT} — ressurs ${RESOURCE_URL} (auth: ${API_BASE})\n`)
})
