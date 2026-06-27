#!/usr/bin/env node
// =====================================================================
// Inntektsportalen MCP — LOKAL (stdio) server.
//
// Kjøres på brukerens egen maskin og legges inn som en lokal kommando i f.eks.
// Claude Desktop. Autentisering skjer via OAuth (PKCE) — første gang åpnes
// nettleseren der du logger inn (Vipps/e-post) og godkjenner hvilke seksjoner
// appen får (se oauth.js). Verktøyene defineres i tools.js (delt med remote-
// serveren), og backend håndhever til slutt all tilgang (default-deny + scopes).
//
// For «lim inn URL i Claude/ChatGPT»-oppkobling, se src/remote.js.
// =====================================================================
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getAccessToken, API } from './oauth.js'
import { makeApi } from './api.js'
import { registerTools } from './tools.js'

const server = new McpServer({ name: 'inntektsportalen', version: '0.1.0' })
registerTools(server, makeApi(getAccessToken, API))

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[Inntektsportalen MCP] klar (lokal/stdio).\n')
