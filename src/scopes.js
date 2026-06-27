// Felles scope-katalog for både lokal (stdio) og remote (HTTP) MCP-server.
// Dette er KUN listen over hva klienten ber om; den faktiske håndhevingen skjer
// alltid på Inntektsportalen-backenden (default-deny + scopes). Holdes i synk med
// server/lib/oauthScopes.js i hovedrepoet.
export const SCOPES = [
  'statistics:read',
  'profile:read', 'profile:write',
  'budget:read', 'budget:write',
  'income:read', 'income:write',
  'costs:read', 'costs:write',
  'savings:read', 'savings:write',
  'loans:read', 'loans:write',
  'tax:read', 'sifo:read'
]

export const SCOPES_STRING = SCOPES.join(' ')
