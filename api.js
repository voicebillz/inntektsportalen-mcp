#!/usr/bin/env node
// =====================================================================
// Inntektsportalen MCP-server.
//
// Gir en MCP-klient (Claude o.l.) scope-styrt tilgang til DIN EGEN data i
// Inntektsportalen. Autentisering skjer via OAuth (PKCE) — første gang åpnes
// nettleseren der du logger inn (Vipps/e-post) og godkjenner hvilke seksjoner
// appen får. Backend håndhever til slutt all tilgang (default-deny + scopes);
// MCP-en kan aldri gjøre noe du ikke selv kan, og aldri 2FA/sikkerhet,
// budsjett åpne/lukke, eller bruke Assistenten.
// =====================================================================
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { apiGet, apiPost, apiPut, apiDelete } from './api.js'

const server = new McpServer({ name: 'inntektsportalen', version: '0.1.0' })

// Hjelper: pakk resultat som MCP text-content (JSON).
const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Feil: ${e?.message || e}` }], isError: true })
const tool = (name, desc, shape, handler) =>
  server.tool(name, desc, shape, async (args) => { try { return ok(await handler(args || {})) } catch (e) { return fail(e) } })

// ---------------- Statistikk / oversikt (lesing) ----------------
tool('get_overview', 'Hent en samlet oversikt (budsjett-måneder, inntekt, kostnader, sparing, lån) — nyttig som statistikk-utgangspunkt.', {}, async () => {
  const [income, costs, savings, loans, locks] = await Promise.all([
    apiGet('/api/income').catch(() => null),
    apiGet('/api/fixed-costs').catch(() => null),
    apiGet('/api/savings').catch(() => null),
    apiGet('/api/loans').catch(() => null),
    apiGet('/api/budgets/locks').catch(() => null)
  ])
  return { income, fixedCosts: costs, savings, loans, budgetMonths: locks }
})

// ---------------- Profil ----------------
tool('get_profile', 'Hent profilen din.', {}, () => apiGet('/api/profile'))
tool('update_profile', 'Oppdater profilfelt du selv kan endre (aldri 2FA/passord/sikkerhet). `data` speiler profil-feltene i appen.',
  { data: z.record(z.any()).describe('Objekt med profilfelt som skal oppdateres') },
  ({ data }) => apiPut('/api/profile', data))

// ---------------- Budsjett (IKKE åpne/lukke perioder) ----------------
tool('list_budget_months', 'List budsjett-måneder og om de er låst.', {}, () => apiGet('/api/budgets/locks'))
tool('get_budget', 'Hent budsjett for en måned (format YYYY-MM).',
  { month: z.string().regex(/^\d{4}-\d{2}$/).describe('Måned, f.eks. 2026-06') },
  ({ month }) => apiGet(`/api/budgets/${month}`))
tool('update_budget', 'Oppdater budsjett-innhold for en måned. Kan IKKE åpne eller lukke/låse perioder. `data` speiler budsjett-objektet.',
  { month: z.string().regex(/^\d{4}-\d{2}$/), data: z.record(z.any()) },
  ({ month, data }) => apiPut(`/api/budgets/${month}`, data))

// ---------------- Lønn / lønnshistorikk / feriepenger ----------------
tool('get_income', 'Hent inntekt/lønn.', {}, () => apiGet('/api/income'))
tool('add_income', 'Legg til en inntektslinje. `data` speiler inntekts-feltene.',
  { data: z.record(z.any()) }, ({ data }) => apiPost('/api/income', data))
tool('update_income', 'Oppdater en inntektslinje.',
  { id: z.string(), data: z.record(z.any()) }, ({ id, data }) => apiPut(`/api/income/${id}`, data))
tool('delete_income', 'Slett en inntektslinje.', { id: z.string() }, ({ id }) => apiDelete(`/api/income/${id}`))
tool('get_salary_history', 'Hent lønnshistorikk.', {}, () => apiGet('/api/salary-history'))
tool('update_salary_history', 'Oppdater lønnshistorikk for et år.',
  { year: z.string(), data: z.record(z.any()) }, ({ year, data }) => apiPut(`/api/salary-history/${year}`, data))
tool('get_feriepenger', 'Hent feriepenge-innstilling.', {}, () => apiGet('/api/feriepenger'))
tool('update_feriepenger', 'Oppdater feriepenge-innstilling (f.eks. skru kalkulatoren av/på).',
  { data: z.record(z.any()) }, ({ data }) => apiPut('/api/feriepenger', data))

// ---------------- Faste kostnader ----------------
tool('get_fixed_costs', 'Hent faste kostnader.', {}, () => apiGet('/api/fixed-costs'))
tool('add_fixed_cost', 'Legg til en fast kostnad.', { data: z.record(z.any()) }, ({ data }) => apiPost('/api/fixed-costs', data))
tool('update_fixed_cost', 'Oppdater en fast kostnad.', { id: z.string(), data: z.record(z.any()) }, ({ id, data }) => apiPut(`/api/fixed-costs/${id}`, data))
tool('delete_fixed_cost', 'Slett en fast kostnad.', { id: z.string() }, ({ id }) => apiDelete(`/api/fixed-costs/${id}`))

// ---------------- Sparing ----------------
tool('get_savings', 'Hent sparing (oversikt/prognose-data).', {}, () => apiGet('/api/savings'))
tool('add_savings', 'Legg til en sparekonto/-post.', { data: z.record(z.any()) }, ({ data }) => apiPost('/api/savings', data))
tool('update_savings', 'Oppdater en sparepost.', { id: z.string(), data: z.record(z.any()) }, ({ id, data }) => apiPut(`/api/savings/${id}`, data))

// ---------------- Lån + inkasso ----------------
tool('get_loans', 'Hent lån.', {}, () => apiGet('/api/loans'))
tool('add_loan', 'Legg til et lån.', { data: z.record(z.any()) }, ({ data }) => apiPost('/api/loans', data))
tool('update_loan', 'Oppdater et lån.', { id: z.string(), data: z.record(z.any()) }, ({ id, data }) => apiPut(`/api/loans/${id}`, data))
tool('delete_loan', 'Slett et lån.', { id: z.string() }, ({ id }) => apiDelete(`/api/loans/${id}`))
tool('get_inkasso', 'Hent inkassokrav.', {}, () => apiGet('/api/inkasso'))
tool('add_inkasso', 'Legg til et inkassokrav.', { data: z.record(z.any()) }, ({ data }) => apiPost('/api/inkasso', data))
tool('update_inkasso', 'Oppdater et inkassokrav.', { id: z.string(), data: z.record(z.any()) }, ({ id, data }) => apiPut(`/api/inkasso/${id}`, data))

// ---------------- Skatt + SIFO (kun lesing) ----------------
tool('calculate_tax', 'Beregn skatt. `data` speiler input-feltene til skatteberegningen i appen.',
  { data: z.record(z.any()) }, ({ data }) => apiPost('/api/tax/calculate', data))
tool('get_tax_rates', 'Hent gjeldende skattesatser.', {}, () => apiGet('/api/tax/rates'))
tool('get_sifo', 'Hent SIFO-referansebudsjett.', {}, () => apiGet('/api/sifo'))
tool('calculate_sifo', 'Beregn SIFO-referansebudsjett for husholdningen din.', {}, () => apiGet('/api/sifo/calculate'))

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write('[Inntektsportalen MCP] klar.\n')
