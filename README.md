# Inntektsportalen MCP

En [MCP](https://modelcontextprotocol.io)-server som gir en AI-klient (Claude
o.l.) **scope-styrt** tilgang til **din egen** data i Inntektsportalen.

Autentisering skjer via **OAuth 2.0 (PKCE)**: første gang åpnes nettleseren der
du logger inn (Vipps/e-post) og **godkjenner hvilke seksjoner** appen får. Du kan
når som helst trekke tilbake tilgangen i Inntektsportalen under **Profil →
Tilkoblinger**.

> Sikkerheten håndheves av Inntektsportalen-backend (default-deny + scopes).
> MCP-en kan **aldri** gjøre noe du ikke selv kan, og aldri endre 2FA/passord,
> åpne/lukke budsjettperioder eller bruke Assistenten/Simuler.

## Installasjon

```bash
npm install
```

## Kjøring / oppsett i Claude

Legg til i MCP-konfigurasjonen (f.eks. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "inntektsportalen": {
      "command": "node",
      "args": ["/full/sti/til/inntektsportalen-mcp/src/index.js"],
      "env": {
        "INNTEKTSPORTALEN_API_URL": "https://api.inntektsportalen.no"
      }
    }
  }
}
```

Første gang et verktøy brukes, åpnes nettleseren for innlogging + samtykke.
Tokens caches i `~/.inntektsportalen-mcp/` og fornyes automatisk.

### Miljøvariabler

| Variabel | Standard | Forklaring |
|---|---|---|
| `INNTEKTSPORTALEN_API_URL` | `https://api.inntektsportalen.no` | Backend-URL |
| `INNTEKTSPORTALEN_MCP_PORT` | `8123` | Loopback-port for OAuth-callback |
| `INNTEKTSPORTALEN_SCOPES` | alle | Mellomrom-separert liste over scopes det bes om |

## Scopes (tilgang)

| Scope | Tilgang |
|---|---|
| `statistics:read` | Statistikk/nøkkeltall (lese) |
| `profile:read` / `profile:write` | Profil — kun felt du selv kan endre |
| `budget:read` / `budget:write` | Budsjett — innhold (ikke åpne/lukke perioder) |
| `income:read` / `income:write` | Lønn, lønnshistorikk, feriepenger |
| `costs:read` / `costs:write` | Faste kostnader |
| `savings:read` / `savings:write` | Sparing |
| `loans:read` / `loans:write` | Lån + inkasso (sammenlign lån: lese) |
| `tax:read` | Skatteberegning (lese) |
| `sifo:read` | SIFO-referansebudsjett (lese) |

## Verktøy (utvalg)

`get_overview`, `get_profile`/`update_profile`, `list_budget_months`/`get_budget`/
`update_budget`, `get_income`/`add_income`/`update_income`/`delete_income`,
`get_salary_history`/`update_salary_history`, `get_feriepenger`/`update_feriepenger`,
`get_fixed_costs`/`add_fixed_cost`/`update_fixed_cost`/`delete_fixed_cost`,
`get_savings`/`add_savings`/`update_savings`, `get_loans`/`add_loan`/`update_loan`/
`delete_loan`, `get_inkasso`/`add_inkasso`/`update_inkasso`, `calculate_tax`/
`get_tax_rates`, `get_sifo`/`calculate_sifo`.

`*_write`-verktøy tar et `data`-objekt som speiler feltene i appen; backend
validerer alltid.

## Personvern

MCP-en lagrer kun OAuth-tokens lokalt (`~/.inntektsportalen-mcp/`, filrettigheter
`600`). Ingen data sendes andre steder enn til Inntektsportalen-API-et du har
godkjent. Trekk tilbake tilgang når som helst i Inntektsportalen → Profil →
Tilkoblinger.
