> **Modular Monolith Blueprint — §9.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 9. Local-Dev Orchestration

The orchestrator is a §3 stack decision, but the contract is fixed: **one
command boots the whole stack** — database, API, and client — with the
connection string injected (never hand-copied), and **exactly one orchestrator
owns dev**. The reference stack uses **.NET Aspire** (and therefore bans Docker
Compose beside it); a non-.NET stack uses its own equivalent (e.g. a compose
profile, Tilt, or a process manager) — chosen with the user, and still only one.
The sections below show the Aspire reference implementation.

### 9.1 AppHost

> The AppHost provisions **the database engine you chose with the user (§8)**.
> The example below uses Postgres (`AddPostgres` + `WithPgAdmin` +
> `postgres:17-alpine`); for SQL Server swap in `AddSqlServer`, etc. The rest of
> the wiring — `AddDatabase`, `WithReference(db)`, `WaitFor(db)`, and the `api` /
> `web` projects — is identical regardless of engine.
>
> **Let Aspire proxy the API.** Do **not** pin `IsProxied = false` (or a fixed
> port) on the `api` project — that breaks it behind Aspire's dev proxy. A fixed,
> unproxied port is only needed for the **Vite** dev server, which the SPA and
> CORS/redirects must reach at a stable origin.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var pgPassword = builder.AddParameter("pg-password", secret: true);

var postgres = builder
    .AddPostgres("<app>-db", password: pgPassword, port: 5432)
    .WithDataVolume("<app>-pgdata")
    .WithPgAdmin();

var db = postgres.AddDatabase("<app>");

var api = builder
    .AddProject<Projects.<App>_Host>("api")     // API endpoint is Aspire-managed (proxied) —
    .WithReference(db)                           //   do NOT force a fixed port / IsProxied=false here
    .WaitFor(db);

builder.AddViteApp("web", "../<App>.Web")
    .WithEndpoint("http", e => { e.Port = 3000; e.IsProxied = false; })
    .WithReference(api)
    .WaitFor(api);

builder.Build().Run();
```

### 9.2 ServiceDefaults

Provides `AddServiceDefaults()` (OpenTelemetry traces/metrics/logs, service
discovery, standard HTTP resilience) and `MapDefaultEndpoints()` (`/health` +
`/alive`, dev-only). Modules stay **Aspire-agnostic** — they read the connection
string from `IConfiguration.GetConnectionString("<app>")`; only the Host calls
`AddServiceDefaults()`.

**Dev entry point:** `dotnet run --project src/aspire/<App>.AppHost` launches the chosen
database + API + Vite web in one terminal and opens the Aspire dashboard.
