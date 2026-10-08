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

> The AppHost provisions **the database engine you chose with the user (§8)**. The example below uses Postgres (`AddPostgres` + `WithPgAdmin`) on an exact image tag with a named data volume and an app-specific host port, following §8.1's image rules; for SQL Server swap in `AddSqlServer`, etc. The rest of the wiring (`AddDatabase`, `WithReference(db)`, `WaitFor(db)`, and the `api` and `web` projects) is identical regardless of engine.
>
> **Let Aspire proxy the API.** Do **not** pin `IsProxied = false` (or a fixed
> port) on the `api` project — that breaks it behind Aspire's dev proxy. A fixed,
> unproxied port is only needed for the **Vite** dev server, which the SPA and
> CORS/redirects must reach at a stable origin.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var pgPassword = builder.AddParameter("pg-password", secret: true);

var postgres = builder
    // Any port but 5432, so another project's Postgres cannot stop this stack starting.
    .AddPostgres("<app>-db", password: pgPassword, port: <dev-port>)
    // An exact tag (17.6 is an example): a new major version will not start on this volume's data.
    .WithImageTag("17.6")
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

Provides `AddServiceDefaults()` (OpenTelemetry traces/metrics/logs, service discovery, standard HTTP resilience) and `MapDefaultEndpoints()` (`/health` and `/alive`). The template maps both in Development only; change it so the liveness endpoint (`/alive`) answers in **every** environment, because a container healthcheck or load balancer calls it in production (§14, Release and operate). The detailed `/health` report can stay Development-only. Modules stay **Aspire-agnostic**: they read the connection string from `IConfiguration.GetConnectionString("<app>")`, and only the Host calls `AddServiceDefaults()`.

**Dev entry point:** `dotnet run --project src/aspire/<App>.AppHost` launches the chosen
database + API + Vite web in one terminal and opens the Aspire dashboard.
