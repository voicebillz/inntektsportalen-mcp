# Inntektsportalen MCP

En [MCP](https://modelcontextprotocol.io)-server som gir en AI-klient (Claude,
ChatGPT o.l.) **scope-styrt** tilgang til **din egen** data i Inntektsportalen.

Autentisering skjer via **OAuth 2.0 (PKCE)**: du logger inn (Vipps/e-post) og
**godkjenner hvilke seksjoner** appen får. Du kan når som helst trekke tilbake
tilgangen i Inntektsportalen under **Profil → Tilkoblinger**.

> Sikkerheten håndheves av Inntektsportalen-backend (default-deny + scopes).
> MCP-en kan **aldri** gjøre noe du ikke selv kan, og aldri endre 2FA/passord,
> åpne/lukke budsjettperioder eller bruke Assistenten/Simuler.

Serveren finnes i to varianter — begge bruker **samme** verktøy- og regelstruktur
(`src/tools.js`):

| Variant | Fil | Bruk |
|---|---|---|
| **Remote** (anbefalt) | `src/remote.js` | Lim inn en URL i Claude/ChatGPT — ingen installasjon |
| **Lokal** (stdio) | `src/index.js` | Kjøres på din egen maskin (Claude Desktop-config) |

---

## 1) Remote — «lim inn URL» (anbefalt)

Ingen installasjon. I klienten din legger du til en **custom connector / MCP-server**
med URL-en:

```
https://mcp.inntektsportalen.no
```

**Claude (web/desktop):** Innstillinger → **Connectors** → **Add custom connector**
→ lim inn URL-en → **Connect**. Et nettleservindu åpnes der du logger inn og
godkjenner hvilke seksjoner Claude får. Ferdig.

**ChatGPT:** Settings → **Connectors** (eller «Add MCP server» i den aktuelle
flaten) → lim inn URL-en → følg innloggingen.

Klienten gjør resten automatisk: den oppdager (via
`/.well-known/oauth-protected-resource`) at Inntektsportalen er
autorisasjonsserver, registrerer seg, og kjører OAuth/PKCE.

### Hoste din egen remote-server

`npm start` kjører remote-serveren (`src/remote.js`). Den er statsløs/uten
datalagring — kun en protokoll-bro mot REST-API-et.

| Miljøvariabel | Standard | Forklaring |
|---|---|---|
| `INNTEKTSPORTALEN_API_URL` | `https://api.inntektsportalen.no` | Backend (REST + OAuth-autorisasjonsserver) |
| `MCP_PUBLIC_URL` | `https://mcp.inntektsportalen.no` | Denne serverens egen offentlige URL (brukes i discovery) |
| `PORT` | `8787` | Lytteport (Railway setter denne automatisk) |

Deployes typisk på Railway (`railway.json` følger med). Healthcheck: `/health`.

---

## 2) Lokal — stdio (Claude Desktop)

```bash
npm install
```

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
Tokens caches i `~/.inntektsportalen-mcp/` (filrettigheter `600`) og fornyes
automatisk.

| Miljøvariabel | Standard | Forklaring |
|---|---|---|
| `INNTEKTSPORTALEN_API_URL` | `https://api.inntektsportalen.no` | Backend-URL |
| `INNTEKTSPORTALEN_MCP_PORT` | `8123` | Loopback-port for OAuth-callback |
| `INNTEKTSPORTALEN_SCOPES` | alle | Mellomrom-separert liste over scopes det bes om |

---

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

- **Remote-serveren** lagrer ingen data og holder ingen tokens — den videresender
  kun klientens Bearer-token til Inntektsportalen-API-et for hver forespørsel.
- **Lokal stdio** lagrer kun OAuth-tokens lokalt (`~/.inntektsportalen-mcp/`,
  filrettigheter `600`).

Ingen data sendes andre steder enn til Inntektsportalen-API-et du har godkjent.
Trekk tilbake tilgang når som helst i Inntektsportalen → Profil → Tilkoblinger.

## Filstruktur

```
src/
  tools.js    — verktøy-/regel-katalog (ÉN kilde til sannhet, delt)
  api.js      — autentisert REST-klient (token injiseres)
  scopes.js   — felles scope-liste
  remote.js   — remote HTTP-server (Streamable HTTP + OAuth-discovery)
  index.js    — lokal stdio-server
  oauth.js    — lokal OAuth/PKCE-innlogging (kun stdio)
```
