# Modular Monolith App Blueprint

> A complete, agent-ready specification for building a new application as a
> **modular monolith**.
> Everything an autonomous coding agent needs to scaffold, extend, and ship the
> app is here: the architecture, the non-negotiable rules, copy-pasteable code
> skeletons, the design system contract, and the verification discipline that
> keeps every change inside the lines.
>
> **How to use this document.** Replace the placeholders `<App>` (your product /
> solution name, e.g. `Acme`), `<Feature>` (a module name, e.g. `Billing`),
> `<schema>` (the database schema/namespace a module owns, e.g. `billing`), and
> `<UseProvider>` (the EF Core provider call for the database engine you choose
> **with the user** — §8 — e.g. `UseNpgsql` or `UseSqlServer`) consistently
> throughout. Then follow the [Build Order](#14-build-order-phased) top to
> bottom. The [Rules Digest](#1-rules-digest-read-first) is the contract — an
> agent must re-read it before every change and must not violate it.
>
> **This blueprint expects a design-first workflow.** The visual/UX design is
> produced **upstream in Claude Design** (Anthropic's prompt-to-prototype tool)
> **before** the app is built, then **handed off** via *Export → Handoff to
> Claude Code* — which yields a **handoff bundle (zip)** plus a **copied prompt**.
> That bundle (component-structure spec, design tokens, breakpoints, interaction
> states, assets, screenshots, README, and design rationale) is the **design
> input** to construction: an agent commits it under `docs/design-handoff/`,
> lifts its tokens into `globals.css`, and **realises** it on this app's fixed
> stack ([§11](#11-design-system-contract-design-first)). There is **no required
> `DESIGN.md`** — the committed bundle + `globals.css` are the source of truth; a
> `DESIGN.md` is an optional, *derived* summary. The visual specifics quoted in
> §11 are an illustrative example only, shown to convey shape; **your app's
> tokens, type, and components come from your handoff bundle**, while the
> *structural* design rules in §11 (single token home, derive-don't-duplicate,
> realise-don't-reinterpret) hold regardless of the look.

---

## 0. North Star

You are building a **modular monolith**: one ASP.NET Core host process, many
isolated feature modules, one shared relational database, and one React SPA.
Modules never call each other directly — they communicate **only** through
published events on an in-process bus, and each consumer keeps its **own local
read model**. This buys you the development simplicity of a monolith with the
isolation discipline of microservices, and it lets a fleet of agents work on
separate modules without stepping on each other.

The four pillars, each enforced ruthlessly:

1. **Isolation** — modules reference only `Core`; cross-module data flows as
   events + local read models, never direct calls or cross-schema queries.
2. **One process, one database, schema-per-module** — physical co-location,
   logical isolation.
3. **Minimal surface** — Minimal APIs, `record` DTOs, no MVC, no heavyweight
   frameworks (no MediatR/MassTransit/AutoMapper).
4. **Verifiable correctness** — every change ships tests; the build is the
   type-check; integration tests prove behaviour across the event seams.

> **Two decisions are deliberately left open and MUST be confirmed with the user
> before the code that depends on them is written — never assume a default:**
> **(1) the persistence backend** — the database engine + EF Core provider; ask
> **before Phase 1** (§8). **(2) the authentication mechanism** — ask **before
> Phase 3** (§4.6). Record both in `docs/ROADMAP.md`.

---

## 1. Rules Digest (read first)

These are the rules an agent must keep loaded at all times. They override
convenience. `[STRICT]` marks a rule that is stronger than typical guidance and
is the most common source of architecture drift.

### Architecture

- **R1** `[STRICT]` A module references **only** `<App>.Core`. **Never** another
  `<App>.Modules.*`. No exceptions.
- **R2** `<App>.Core` references **nothing** in `<App>.Modules.*`.
- **R3** `[STRICT]` Cross-module communication happens **only** via events on the
  in-process bus. If module B needs data from module A, B subscribes to A's
  event and maintains its **own local read model** in B's schema.
- **R4** Every module implements `IModule` (`Name`, `RegisterServices`,
  `MapEndpoints`), is `sealed`, and has a **parameterless constructor**.
- **R5** Modules are discovered by **reflection** at startup. `Program.cs`
  contains **no hand-wiring** of any specific module — the single permitted
  exception is mapping the SignalR hub (it needs the concrete type).
- **R6** The Host `<ProjectReference>`s every module csproj **only** so MSBuild
  copies the DLLs into `bin/`. **No `using <App>.Modules.*`** in Host code
  except the one SignalR hub line.

### Data

- **R7** `[STRICT]` **One DbContext per module**, **one shared physical
  database**, **logical-isolation-per-module** — a real schema where the provider
  supports it (`<Feature>` → `<schema>`, set with
  `modelBuilder.HasDefaultSchema("<schema>")`), or the chosen provider's nearest
  equivalent. The **persistence engine is the implementor's choice and MUST be
  confirmed with the user before Phase 1** (§8) — never assume one.
- **R8** `[STRICT]` A module **must not** read another module's schema — no
  cross-module `DbSet<T>`, no `SqlQueryRaw` against a foreign schema, no
  cross-schema joins.
- **R9** Each module owns its **own EF Core migrations**; its
  `__EFMigrationsHistory` table lives in its **own schema**.
- **R10** Migrations from day one. `Database.Migrate()` at startup. **No
  `EnsureCreated`** (relational), **no hand-written SQL fix-ups** in `Program.cs`.
- **R11** `[STRICT]` **One relational EF Core provider for the whole app, chosen
  with the user (§8)** — Postgres, SQL Server, or another the user names; never
  mix engines. Wire the matching provider package and Aspire integration. The
  provider-specific snippets in this document (`UseNpgsql`, `postgres:17-alpine`,
  `pg_trgm`, `ILIKE`) are **illustrative** — substitute your chosen provider's
  equivalents.

### Events

- **R12** The bus is a custom `InProcessEventBus : IEventBus`, registered
  **Singleton**. **No** MediatR/MassTransit/Wolverine/Rebus/external broker.
- **R13** Events are `record` types implementing the marker `IEvent`.
- **R14** **Shared** events (consumed across modules) live in
  `Core/Events/Contracts/`. **Private** events live in
  `<App>.Modules.<Feature>/Events/`.
- **R15** Handlers resolve scoped services via a **fresh DI scope per event**.
  The bus catches & logs handler exceptions so one bad subscriber can't break
  the publisher.
- **R16** Subscriptions are wired **inside `MapEndpoints`** (the service provider
  exists by then), guarded by `Interlocked.CompareExchange` so integration-test
  rebuilds don't double-subscribe.

### API & DI

- **R17** **Minimal APIs only.** No MVC controllers, no attribute routing.
  Routes live under `/api/<feature>/...`.
- **R18** Request/response DTOs are `record` types declared per module. **No
  AutoMapper.**
- **R19** DI lifetimes: `IEventBus`, `IUserIdProvider`, `IHttpClientFactory`
  clients → **Singleton**; `DbContext`, domain services, per-event handlers →
  **Scoped**; background workers → `AddHostedService<T>`.
- **R20** `[STRICT]` **No business service interfaces** in `Core` (no
  `ICategoryService`, `IAccountService`). `Core` may define only **infrastructure**
  abstractions every module needs: `IEventBus`, `ICurrentUser`. Cross-module
  business needs go through events.

### Realtime (SignalR)

- **R21** **One hub** for the whole app, owned by the `Notifications` module
  (an empty `Hub` subclass). The Host maps it explicitly — the one place Host
  references a module type.
- **R22** `[STRICT]` **Only** the `Notifications` module injects
  `IHubContext<...>`. Other modules publish domain events; Notifications
  translates the push-worthy ones into SignalR messages.

### Verification

- **R23** Every code change ships test changes (new code → new tests; modified →
  updated; deleted → dead tests removed). **Maximise coverage across all three
  layers** — unit, integration, and **end-to-end (Playwright)** — per the test
  pyramid (§12): push each test as low as it can go, but **every user-facing
  journey gets an e2e test** and every cross-module/data-layer behaviour gets an
  integration test. E2e is first-class, not deferred.
- **R24** `[STRICT]` Any change to a **data layer** (EF entity, migration, local
  read-model/projection, or event handler) ships a real **integration test**
  (`WebApplicationFactory<Program>`) that writes then reads back **every affected
  field by name** and asserts it survives the round-trip.
- **R25** Before claiming done, run **and read the output of**: server
  `dotnet build` then `dotnet test`; web `npm run build` then `npm run test`.
  The build is the project-wide type-check — a green test run alone is not
  enough.

### Design

- **R26** The design input is the **Claude Design → Claude Code handoff bundle**
  (zip + copied prompt), committed under `docs/design-handoff/` (design-first;
  §11). Realise it faithfully — including its interaction states and breakpoints
  — don't reinterpret or "improve" the design while coding. Lift its tokens into
  `globals.css` **once**; every component derives from them (never hard-code a
  hex/size that duplicates a token). Keep this app's fixed stack — translate the
  bundle into Vite/React/Tailwind/shadcn, don't swap the stack to match it. If a
  UI decision isn't covered by the bundle, **ask — don't invent.** `DESIGN.md` is
  optional and, if kept, is a *derived* summary, never the source of truth.

---

## 2. Solution Layout

```
<App>.slnx                          # XML solution file (.NET SDK slnx format)
global.json                         # pins the .NET SDK (rollForward: latestFeature)
Directory.Packages.props            # Central Package Management — all versions here
DESIGN.md                           # OPTIONAL derived design summary (§11); not the source of truth
CLAUDE.md / AGENTS.md               # agent operating instructions (this blueprint distilled)
docs/
  design-handoff/<date>-<surface>/  # committed Claude Design handoff bundle — the design source of truth (§11)
  ROADMAP.md                        # what's shipped / in progress / deferred
  smoke-tests/<date>-<topic>.md     # impact analysis + manual checklist per significant change
src/
  aspire/                           # Aspire orchestration projects, grouped
    <App>.AppHost/                  # .NET Aspire AppHost — orchestrates local dev
    <App>.ServiceDefaults/          # OpenTelemetry, health, resilience, service discovery
  <App>.Core/                       # IModule, IEventBus + InProcessEventBus, IEvent,
                                    #   ICurrentUser, ModuleDiscovery, JWT auth, shared Contracts
  <App>.Host/                       # ASP.NET Core host — Program.cs composition root only
  modules/                          # one class library per feature module, grouped
    <App>.Modules.<Feature>/        # (Microsoft.NET.Sdk)
      <Feature>Module.cs            # sealed IModule implementation
      Data/<Feature>DbContext.cs    # one DbContext per module + entities
      Migrations/                   # per-module EF Core migrations
      Endpoints/                    # Minimal API handlers (static Map methods)
      Events/                       # module-private events
      Services/                     # module-internal services + event handlers
  <App>.Web/                        # Vite + React 19 SPA (PWA-capable)
tests/
  <App>.Core.Tests/
  modules/
    <App>.Modules.<Feature>.Tests/  # one test project per module, mirroring src/modules/
```

> `src/aspire/` and `src/modules/` (and `tests/modules/`) are **physical folders
> that group projects on disk** — and map to matching solution folders in
> `<App>.slnx`. They are purely organisational: they **don't** change the
> dependency rules (the arrows below), namespaces (still `<App>.Modules.<Feature>`),
> or module discovery (DLLs are found by reflection at runtime — §4.1). Only the
> on-disk `--project` paths change (e.g.
> `src/aspire/<App>.AppHost`, `src/modules/<App>.Modules.<Feature>`).

**Dependency direction (the only legal arrows):**

```
Modules.<Feature>  ──►  Core
Host               ──►  Core, ServiceDefaults, (every Module csproj — DLL copy only)
AppHost            ──►  Host (Aspire project ref)
ServiceDefaults    ──►  (nothing app-specific)
Core               ──►  (nothing app-specific)
```

---

## 3. Tech Stack (pin latest stable at install time)

**Server (.NET 10):**
- ASP.NET Core 10 Minimal APIs
- .NET Aspire 13+ for local-dev orchestration (`AppHost` + `ServiceDefaults`)
- EF Core 10 with the provider for the chosen persistence backend
  (**ask the user first — §8**; e.g. `Npgsql.EntityFrameworkCore.PostgreSQL`,
  `Microsoft.EntityFrameworkCore.SqlServer`)
- The chosen database engine, provisioned by Aspire (e.g. `postgres:17-alpine`
  via `AddPostgres`, or SQL Server via `AddSqlServer`) — decided with the user (§8)
- Authentication: **ask the user first — §4.6** (no default mechanism). The
  reference option (Local-DB JWT) uses
  `Microsoft.AspNetCore.Authentication.JwtBearer` +
  `Konscious.Security.Cryptography.Argon2` (Argon2id hashing); an external IdP
  (OpenID Connect / Azure Entra ID) swaps these for IdP token validation
- Built-in SignalR
- Tests: xUnit, FluentAssertions, `Microsoft.AspNetCore.Mvc.Testing`,
  `Microsoft.EntityFrameworkCore.InMemory`; `Aspire.Hosting.Testing` for
  full-stack integration tests
- **Banned:** MediatR, MassTransit, Wolverine, Rebus, AutoMapper, ArchUnitNET,
  Docker Compose (Aspire owns orchestration)

**Client (React SPA / PWA):**
- React 19 + Vite (latest) + TypeScript (strict)
- Tailwind 4
- shadcn/ui (copy-paste into `src/components/ui/`) + Radix primitives
- Lucide React icons
- React Router (latest)
- TanStack Query (server state + sync)
- React Hook Form + Zod (forms + validation)
- Recharts via shadcn `Chart` wrapper (only when a chart is actually needed)
- `vite-plugin-pwa` (installable PWA manifest — later phase)
- Tests: Vitest + React Testing Library (unit/component) **and Playwright
  (`@playwright/test`) for end-to-end UI journeys** — e2e is a first-class layer
  (§12), run on schedule/CI rather than on every edit

**Central Package Management** is mandatory. `Directory.Packages.props` sets
`ManagePackageVersionsCentrally=true` and
`CentralPackageTransitivePinningEnabled=true`. Declare every version there with
`<PackageVersion Include="..." Version="..." />`; csprojs carry a **bare**
`<PackageReference Include="..." />` (no `Version` — a `Version` there is a build
error).

---

## 4. Core Library — the framework everyone shares

`<App>.Core` is the only project modules reference. It contains the module
contract, the event bus, the auth infrastructure, and the **shared event
contracts**. It must contain **no business logic and no business service
interfaces** (R20).

### 4.1 Module contract

```csharp
// Core/Modules/IModule.cs
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace <App>.Core.Modules;

public interface IModule
{
    string Name { get; }
    void RegisterServices(IServiceCollection services);
    void MapEndpoints(IEndpointRouteBuilder app);
}
```

```csharp
// Core/Modules/ModuleDiscovery.cs
using System.Reflection;

namespace <App>.Core.Modules;

public static class ModuleDiscovery
{
    public static IReadOnlyList<IModule> DiscoverModules()
    {
        var baseDir = AppContext.BaseDirectory;
        var assemblies = Directory
            .EnumerateFiles(baseDir, "<App>.Modules.*.dll")
            .Select(Assembly.LoadFrom)
            .ToList();

        return assemblies
            .SelectMany(a => a.GetTypes())
            .Where(t => typeof(IModule).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface)
            .Select(t => (IModule)Activator.CreateInstance(t)!)
            .OrderBy(m => m.Name)
            .ToList();
    }
}
```

### 4.2 Event bus

```csharp
// Core/Events/IEvent.cs
namespace <App>.Core.Events;
public interface IEvent { }   // marker
```

```csharp
// Core/Events/IEventBus.cs
namespace <App>.Core.Events;

public interface IEventBus
{
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IEvent;
    void Subscribe<TEvent>(Func<TEvent, CancellationToken, Task> handler) where TEvent : IEvent;
}
```

```csharp
// Core/Events/InProcessEventBus.cs
using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace <App>.Core.Events;

public sealed class InProcessEventBus(ILogger<InProcessEventBus> log) : IEventBus
{
    private readonly ConcurrentDictionary<Type, List<Delegate>> _subs = new();
    private readonly object _lock = new();

    public void Subscribe<TEvent>(Func<TEvent, CancellationToken, Task> handler) where TEvent : IEvent
    {
        var list = _subs.GetOrAdd(typeof(TEvent), _ => []);
        lock (_lock) { list.Add(handler); }
    }

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IEvent
    {
        if (!_subs.TryGetValue(typeof(TEvent), out var handlers)) return;

        Delegate[] snapshot;
        lock (_lock) { snapshot = [.. handlers]; }

        foreach (var h in snapshot.Cast<Func<TEvent, CancellationToken, Task>>())
        {
            try { await h(@event, ct); }
            catch (Exception ex) { log.LogError(ex, "Event handler for {Event} failed", typeof(TEvent).Name); }
        }
    }
}
```

### 4.3 Shared event contract (example)

```csharp
// Core/Events/Contracts/<Thing>Created.cs
namespace <App>.Core.Events.Contracts;

public sealed record <Thing>Created(
    Guid <Thing>Id,
    Guid UserId,
    string Name,
    DateTimeOffset CreatedAt
) : IEvent;
```

### 4.4 Current-user infrastructure — the stable auth seam

`ICurrentUser` is the **only** thing modules know about authentication. It is the
stable seam that decouples every module from *how* a user is authenticated. The
authentication **mechanism is the implementor's choice** (see §4.6) — modules
never change when you swap it.

```csharp
// Core/Auth/ICurrentUser.cs
namespace <App>.Core.Auth;
public interface ICurrentUser { Guid? UserId { get; } }
```

```csharp
// Core/Auth/CurrentUser.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace <App>.Core.Auth;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public Guid? UserId
    {
        get
        {
            var sub = httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }
}
```

### 4.5 JWT validation extension (the default reference implementation)

`Core` ships **one** `AddAuth(...)`-style extension that the Host calls. The
implementor picks what goes inside it (§4.6). The reference implementation
validates a bearer JWT (issuer/audience/lifetime/signing key, key ≥ 32 chars or
throw). **Regardless of which mechanism you choose,** keep the SignalR
`OnMessageReceived` hook that reads the token from the `access_token` query
string for `/hubs/*` paths (WebSocket connections can't send an `Authorization`
header):

```csharp
opts.Events = new JwtBearerEvents
{
    OnMessageReceived = context =>
    {
        if (context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
        {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken)) context.Token = accessToken;
        }
        return Task.CompletedTask;
    }
};
```

For local-DB JWT, bind options (`Issuer`, `Audience`, `SigningKey`, expiry) from
configuration section `Jwt`. For an external IdP, bind `Authority`/`Audience`
(and let the middleware fetch signing keys from the IdP's metadata) instead of a
local `SigningKey`.

### 4.6 Authentication is the implementor's choice — **ASK FIRST**

> **STOP.** This blueprint ships with **no default authentication mechanism**.
> Before Phase 3 (login wiring, protected routes, the SPA sign-in flow, and — for
> self-hosted credentials — the `Auth` module + admin CLI), the agent **MUST ask
> the user which authentication mechanism to use** and record the answer in
> `docs/ROADMAP.md`. **Never assume one** — the choice decides whether the `Auth`
> module exists at all, what `AddAuth` wires, and how the client signs in.

The architecture fixes the **seam**, not the **provider**. Whatever the user
chooses must satisfy three contracts and nothing more:

1. **`ICurrentUser.UserId`** resolves to a stable per-user `Guid` from the
   incoming request principal (e.g. the `sub`/`NameIdentifier` claim, or a claim
   you map to your user id).
2. **`RequireAuthorization()`** on endpoints rejects unauthenticated requests.
3. **SignalR** can authenticate via the `access_token` query-string hook (§4.5)
   so per-user push groups line up with `ICurrentUser.UserId`.

Valid implementations — pick one, keep the rest of the app unchanged:

| Option | What `AddAuth` wires | User store / provisioning | Notes |
|---|---|---|---|
| **Local-DB JWT** (reference) | `AddJwtBearer` validating a symmetric key you sign | `Auth` module + `admin add-user` CLI; Argon2id hashes | Fully self-hosted, no external dependency. **The code samples in §5/§7 illustrate this option** — treat them as illustrative, not as an assumed default. |
| **OpenID Connect (generic)** | `AddJwtBearer` with `Authority` + `Audience` (validates IdP-issued tokens via discovery) | Users live in the IdP; the app may keep a thin local profile keyed by the IdP `sub` | Auth0, Okta, Keycloak, Google, etc. SPA uses an OIDC client (PKCE). |
| **Azure Entra ID** | `Microsoft.Identity.Web` (`AddMicrosoftIdentityWebApi`) or `AddJwtBearer` against the Entra authority | Users in the tenant directory; map `oid`/`sub` to your `Guid` | Enterprise SSO, conditional access, MSAL on the client. |
| **Mixed / pluggable** | Multiple schemes + a policy selecting between them | Per scheme | E.g. local JWT for service accounts + OIDC for humans. |
| **Other — the user names it** | the matching ASP.NET Core auth handler (e.g. AWS Cognito, Firebase, a custom scheme) | per the provider | **Confirm how the principal maps to a stable `Guid` `ICurrentUser.UserId` before building**, and note it in `docs/ROADMAP.md`. |

Rules that hold across **all** options:

- The **`Auth` module is optional.** It exists only when you own the credential
  store (local-DB JWT). With an external IdP, drop the `Auth` module entirely —
  there is no `auth` schema, no login endpoint, no `add-user` CLI. The Host's
  admin-CLI branch (§5) and the `Auth` references disappear with it.
- Modules still depend on **`ICurrentUser` only** — never on the chosen scheme,
  tokens, or claims directly. If a module needs claims beyond `UserId`, extend
  `ICurrentUser` in `Core` (it's infrastructure, R20-permitted), don't reach
  into `HttpContext` from a module.
- Whatever maps an authenticated principal to your domain `UserId` lives in
  **`Core/Auth`** (the `CurrentUser` implementation), so swapping providers is a
  one-file change.
- When an external IdP owns identity but a module needs to react to user
  lifecycle (e.g. first-login provisioning of a local profile/read-model), do it
  the blueprint way: publish a `UserSignedIn`/`UserProvisioned` **shared event**
  and let interested modules build their own local read model (R3) — don't have
  modules call an IdP SDK directly.

> **Choose before Phase 3** and record it in `docs/ROADMAP.md`, alongside the
> persistence decision (§8). The auth choice shapes the `Auth` module's
> existence, the Host's admin CLI, and the SPA's login flow. If a later need
> exposes a gap in the chosen mechanism, surface it to the user — don't silently
> bolt on a second scheme (beyond a deliberate **Mixed / pluggable** choice).

---

## 5. Host — the composition root

`Program.cs` is the **only** file in `<App>.Host`. It does exactly: *(optional
admin-CLI branch, local-DB auth only)* → build the web app → register infra
singletons → discover & register modules → migrate every module DbContext → map
the hub → map module endpoints → SPA fallback → run. **No business logic** beyond
this list.

> The admin-CLI branch below exists **only for the local-DB JWT option** (it
> provisions users into the `Auth` module). If you chose an external IdP (§4.6),
> delete the entire `if (args… "admin" "add-user")` block and the `Auth`
> references with it, and replace `AddJwtAuth` with your IdP's validation
> wiring.

```csharp
using <App>.Core.Auth;
using <App>.Core.Events;
using <App>.Core.Modules;
using Microsoft.EntityFrameworkCore;

// --- Admin CLI: run a command and exit without starting the web server. ---
// Uses the generic host (not WebApplicationBuilder) so it stays lightweight.
if (args.Length >= 3 && args[0] == "admin" && args[1] == "add-user")
{
    var email = args[2];
    var password = args.Length >= 4 ? args[3]
        : throw new ArgumentException("Usage: admin add-user <email> <password>");

    var cliBuilder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
    {
        Args = args,
        ContentRootPath = AppContext.BaseDirectory,
        EnvironmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? Environments.Development
    });
    var cs = cliBuilder.Configuration.GetConnectionString("<app>")
        ?? throw new InvalidOperationException("Connection string '<app>' not found.");
    cliBuilder.Services.AddDbContext<<App>.Modules.Auth.Data.AuthDbContext>(o =>
        o.<UseProvider>(cs, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "auth"))); // <UseProvider> = chosen provider (§8)

    using var cliApp = cliBuilder.Build();
    await using var scope = cliApp.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<<App>.Modules.Auth.Data.AuthDbContext>();
    await db.Database.MigrateAsync();
    // ... create user (Argon2id hash), save, print id ...
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();                                    // Aspire: OTel, health, resilience

builder.Services.AddSingleton<IEventBus, InProcessEventBus>();   // R12
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddJwtAuth(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddSignalR();
builder.Services.AddCors(opts => opts.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration["Cors:SpaOrigin"] ?? "http://localhost:3000")
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var modules = ModuleDiscovery.DiscoverModules();                 // R5
foreach (var m in modules) m.RegisterServices(builder.Services);

var app = builder.Build();

foreach (var m in modules) app.Logger.LogInformation("Discovered module: {Name}", m.Name);

app.MapDefaultEndpoints();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// The ONE place Host references a module type (R6/R21).
app.MapHub<<App>.Modules.Notifications.Hubs.NotificationHub>("/hubs/notifications");

// Migrate every module DbContext (R10). Relational → Migrate; InMemory test → EnsureCreated.
using (var scope = app.Services.CreateScope())
{
    var dbContextTypes = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return []; } })
        .Where(t => t.IsSubclassOf(typeof(DbContext)) && !t.IsAbstract
                 && t.Namespace?.StartsWith("<App>.Modules.") == true);

    foreach (var ctxType in dbContextTypes)
        if (scope.ServiceProvider.GetService(ctxType) is DbContext ctx)
        {
            if (ctx.Database.IsRelational()) await ctx.Database.MigrateAsync();
            else await ctx.Database.EnsureCreatedAsync();
        }
}

foreach (var m in modules) m.MapEndpoints(app);                 // subscriptions wire here (R16)

app.MapFallbackToFile("index.html");                            // SPA fallback
app.Run();

public partial class Program;   // required for WebApplicationFactory<Program> (R24)
```

---

## 6. Anatomy of a Module

A module is a self-contained vertical slice: its own DbContext + schema, its own
migrations, its own endpoints, its own event handlers and local read models. Use
this template for every new `<Feature>`.

### 6.1 `<Feature>Module.cs`

```csharp
using <App>.Core.Events;
using <App>.Core.Events.Contracts;
using <App>.Core.Modules;
using <App>.Modules.<Feature>.Data;
using <App>.Modules.<Feature>.Endpoints;
using <App>.Modules.<Feature>.Services;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace <App>.Modules.<Feature>;

public sealed class <Feature>Module : IModule          // R4: sealed, parameterless ctor
{
    public string Name => "<Feature>";
    private static int _subscribed;                    // R16: one-time subscription guard

    public void RegisterServices(IServiceCollection services)
    {
        services.AddDbContext<<Feature>DbContext>((sp, opts) =>
        {
            var cs = sp.GetRequiredService<IConfiguration>().GetConnectionString("<app>");
            opts.<UseProvider>(cs, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "<schema>")); // R9; <UseProvider> = chosen provider (§8)
        });

        services.AddScoped<SomethingImportedHandler>();   // R19: handlers are Scoped
        // services.AddScoped<DomainService>();
        // services.AddHostedService<BackgroundWorker>();  // if needed
    }

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        <Feature>Endpoint.Map(app);                       // R17: Minimal APIs

        if (Interlocked.CompareExchange(ref _subscribed, 1, 0) == 0)   // R16
        {
            var bus = app.ServiceProvider.GetRequiredService<IEventBus>();

            bus.Subscribe<SomethingImported>(async (e, ct) =>          // R15: fresh scope per event
            {
                using var scope = app.ServiceProvider.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<SomethingImportedHandler>();
                await handler.HandleAsync(e, ct);
            });
        }
    }
}
```

### 6.2 `Data/<Feature>DbContext.cs`

```csharp
using Microsoft.EntityFrameworkCore;

namespace <App>.Modules.<Feature>.Data;

public sealed class <Feature>DbContext(DbContextOptions<<Feature>DbContext> options) : DbContext(options)
{
    public DbSet<Thing> Things => Set<Thing>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("<schema>");        // R7: schema-per-module
        modelBuilder.Entity<Thing>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.UserId, x.ExternalKey }).IsUnique();
        });
    }
}

public sealed class Thing
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }                      // per-user filtering everywhere
    public required string ExternalKey { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
```

### 6.3 `Endpoints/<Feature>Endpoint.cs`

```csharp
using <App>.Core.Auth;
using <App>.Modules.<Feature>.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace <App>.Modules.<Feature>.Endpoints;

// Request/response DTOs are records, declared per module (R18). No AutoMapper.
public sealed record CreateThingRequest(string Name);
public sealed record ThingResponse(Guid Id, string Name, DateTimeOffset UpdatedAt);

public static class <Feature>Endpoint
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/<feature>/things", async (
            ICurrentUser currentUser, <Feature>DbContext db, CancellationToken ct) =>
        {
            if (currentUser.UserId is not { } userId) return Results.Unauthorized();

            var things = await db.Things
                .Where(t => t.UserId == userId)            // always filter by user
                .OrderBy(t => t.UpdatedAt)
                .Select(t => new ThingResponse(t.Id, t.ExternalKey, t.UpdatedAt))
                .ToListAsync(ct);

            return Results.Ok(things);
        }).RequireAuthorization();
    }
}
```

### 6.4 Event handler (local read model)

```csharp
using <App>.Core.Events.Contracts;
using <App>.Modules.<Feature>.Data;

namespace <App>.Modules.<Feature>.Services;

// Consumes another module's event and maintains THIS module's local read model (R3/R8).
public sealed class SomethingImportedHandler(<Feature>DbContext db)
{
    public async Task HandleAsync(SomethingImported e, CancellationToken ct)
    {
        var existing = await db.Things.FindAsync([e.ThingId], ct);
        if (existing is null)
            db.Things.Add(new Thing { Id = e.ThingId, UserId = e.UserId,
                ExternalKey = e.Key, UpdatedAt = e.OccurredAt });
        else
            existing.UpdatedAt = e.OccurredAt;
        await db.SaveChangesAsync(ct);
    }
}
```

### 6.5 Publishing an event

A producer endpoint/service injects `IEventBus` and publishes after committing
its own write:

```csharp
await db.SaveChangesAsync(ct);
await bus.PublishAsync(new <Thing>Created(thing.Id, userId, thing.Name, DateTimeOffset.UtcNow), ct);
```

---

## 7. The standard module set

Every app on this blueprint starts with these foundational modules (the `Auth`
module is included **only** if you own the credential store — §4.6). Add domain
modules beyond them.

1. **`Auth`** (`auth` schema) — **optional; present only if you own the
   credential store** (local-DB JWT, §4.6). When present: `POST /api/auth/login`
   → signed JWT (`sub` = user id, e.g. 7-day expiry); Argon2id password hashing;
   **no public registration endpoint** — users are provisioned via the admin CLI
   (`<App>.Host admin add-user <email> <password>`). Publishes no events by
   default. **With an external IdP (OpenID Connect / Azure Entra ID), omit this
   module entirely** — identity lives in the IdP and the only auth code is the
   validation wiring in `Core` (§4.5/4.6).

2. **`Notifications`** (stateless, no DB) — the bus→SignalR translator. Owns
   `Hubs/NotificationHub.cs` (empty `Hub` subclass) and a custom
   `IUserIdProvider` reading the JWT `sub` so SignalR user groups match
   `ICurrentUser.UserId` (registered Singleton). Subscribes to push-worthy
   events and fans them out: domain event → subscriber (fresh scope) → scoped
   relay injects `IHubContext<NotificationHub>` →
   `Clients.User(userId.ToString()).SendAsync("<message>", payload, ct)`. Adding
   a new push is a ~10-line subscriber. **No other module touches SignalR (R22).**

3. **A read-model module** (e.g. `Dashboard`, `<schema>` schema) — the
   canonical example of R3: holds **local mirrors** of data owned elsewhere,
   built purely from subscribed events, and serves read-only aggregates. It
   **never** queries the producer's schema.

Add domain modules (`Transactions`, `Billing`, `Catalog`, …) as independent
vertical slices following §6.

### 7.1 Notifications relay skeleton

```csharp
// Modules.Notifications/Services/SomethingHappenedHubRelay.cs
using <App>.Core.Events.Contracts;
using <App>.Modules.Notifications.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace <App>.Modules.Notifications.Services;

public sealed class SomethingHappenedHubRelay(IHubContext<NotificationHub> hub)   // ONLY here (R22)
{
    public async Task HandleAsync(SomethingHappened e, CancellationToken ct) =>
        await hub.Clients.User(e.UserId.ToString())
            .SendAsync("<message-name>", new { e.ThingId, e.Status }, ct);
}
```

```csharp
// Modules.Notifications/Hubs/NotificationHub.cs
using Microsoft.AspNetCore.SignalR;
namespace <App>.Modules.Notifications.Hubs;
public sealed class NotificationHub : Hub { }   // empty by design
```

---

## 8. Persistence & Migrations

### 8.1 The persistence backend is the implementor's choice — **ASK FIRST**

> **STOP.** This blueprint ships with **no default database engine**. Before
> Phase 1 (the server skeleton stands up DbContexts and writes the first
> migrations), the agent **MUST ask the user which persistence backend to use**
> and record the answer in `docs/ROADMAP.md`. **Never assume one** — the choice
> determines the EF Core provider package, the `<UseProvider>` calls, the Aspire
> provisioning integration, and which provider-specific features are available.

The architecture fixes the **persistence seam**, not the **engine**. Whatever the
user picks must satisfy these contracts; everything else in the document holds
unchanged:

1. **Relational, accessed through EF Core**, with **one provider for the whole
   app** — never mix engines.
2. **One physical database**; every module's DbContext uses the **same
   connection string** (Aspire injects it as `<app>` via `WithReference(db)`).
3. **Logical isolation per module** — a real schema where the provider supports
   it (`modelBuilder.HasDefaultSchema("<schema>")`, R7), or the provider's
   nearest equivalent (see the options table).
4. **Per-module EF Core migrations**, each module's `__EFMigrationsHistory` in
   its own schema/namespace (R9).
5. **`Database.Migrate()` at startup; no `EnsureCreated` on relational** (R10).

Options — pick one **with the user**; the rest of the app is unchanged:

| Option | EF Core provider | Aspire integration | Module isolation | Notes |
|---|---|---|---|---|
| **PostgreSQL** | `Npgsql.EntityFrameworkCore.PostgreSQL` (`UseNpgsql`) | `AddPostgres` (`postgres:17-alpine`) + `WithPgAdmin` | real schema per module (`HasDefaultSchema`) | Trigram search (`pg_trgm`), `ILIKE`, Row-Level Security available. **The worked examples and code samples in this document are written for Postgres** — treat `UseNpgsql` / `postgres:17-alpine` / `pg_trgm` as illustrative and substitute your provider's equivalents. |
| **SQL Server** | `Microsoft.EntityFrameworkCore.SqlServer` (`UseSqlServer`) | `AddSqlServer` | real schema per module (`HasDefaultSchema`) | Azure SQL / on-prem SQL Server. Map Postgres-specific features (`ILIKE` → `LIKE` + case-insensitive collation, RLS → SQL Server Row-Level Security, `pg_trgm` → full-text search / `LIKE`). |
| **Other — the user names it** | the matching EF Core provider (e.g. Pomelo MySQL, SQLite) | the matching Aspire integration if one exists | a real schema, or the provider's nearest equivalent | **Confirm how module isolation maps before building.** E.g. MySQL/MariaDB treat a "schema" as a database; SQLite (single-file, single-user) has no schemas, so isolate by table-name prefix and weigh it only for small/single-user deployments. Agree the mapping with the user and note it in `docs/ROADMAP.md`. |

> **Choose before Phase 1** and record it in `docs/ROADMAP.md`, alongside the
> auth decision (§4.6). If a later need exposes a gap in the chosen engine (e.g.
> a feature only Postgres offers), surface it to the user — don't silently switch
> engines or add a second one.

### 8.2 Migrations

Per-module migrations (R9), each owning its own history table:

```bash
dotnet ef migrations add Initial \
  --project src/modules/<App>.Modules.<Feature> \
  --context <Feature>DbContext
```

- `Database.Migrate()` runs at Host startup for every module DbContext (R10).
- Per-user tables always carry `UserId`; every query filters by it.
- **Phase-2 hardening (not v1):** enable provider-level row security where the
  engine supports it (e.g. Postgres Row-Level Security) on per-user tables and
  set `app.user_id` from middleware so the DB refuses queries that forget
  `WHERE UserId = @me`.

---

## 9. Aspire Orchestration

### 9.1 AppHost

> The AppHost provisions **the database engine you chose with the user (§8)**.
> The example below uses Postgres (`AddPostgres` + `WithPgAdmin` +
> `postgres:17-alpine`); for SQL Server swap in `AddSqlServer`, etc. The rest of
> the wiring — `AddDatabase`, `WithReference(db)`, `WaitFor(db)`, and the `api` /
> `web` projects — is identical regardless of engine.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var pgPassword = builder.AddParameter("pg-password", secret: true);

var postgres = builder
    .AddPostgres("<app>-db", password: pgPassword, port: 5432)
    .WithDataVolume("<app>-pgdata")
    .WithPgAdmin();

var db = postgres.AddDatabase("<app>");

var api = builder
    .AddProject<Projects.<App>_Host>("api")
    .WithEndpoint("http", e => { e.Port = 5000; e.IsProxied = false; })
    .WithReference(db)
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

---

## 10. Client SPA

### 10.1 Structure

```
src/<App>.Web/
  package.json  vite.config.ts  components.json  tsconfig*.json
  src/
    components/      # shared components; ui/ holds shadcn copies; charts/ for Recharts wrappers
    hooks/           # TanStack Query hooks (one module per API area)
    layouts/         # app shell (sidebar, header)
    lib/             # api client, pure helpers (e.g. derivations), utils
    pages/           # route screens (+ feature subfolders)
    styles/globals.css   # the ONE home for design tokens (Tailwind v4 @theme inline)
    test/            # test setup
```

Co-locate tests: `Foo.tsx` ↔ `Foo.test.tsx` (or `__tests__/`).

### 10.2 Rules

- Strict TypeScript. There is no separate lint step — `npm run build`
  (`tsc -b && vite build`) is the type-check gate.
- Import via the `@/` alias (mapped to `src/*`), never deep relative paths.
- **Derive client types from real API responses** — don't hand-write both
  sides of the wire (single source of truth).
- Server state through TanStack Query; forms with React Hook Form + Zod.
- SignalR: connect with the JWT in the `access_token` query string; on a push
  message, invalidate the relevant TanStack Query caches and refetch rather than
  trusting the payload as the full truth.
- Charts derive client-side from existing hooks via **pure, tested helpers** and
  **degrade gracefully** — never fabricate series; empty data → honest empty
  state.

### 10.3 Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (normally launched by AppHost) |
| `npm run build` | `tsc -b && vite build` — type-check + production bundle (the gate) |
| `npm run test` | Vitest (unit/component) |
| `npm run test:e2e` | Playwright end-to-end suite (expensive — §12.6) |

---

## 11. Design System Contract (design-first)

**The design comes first, in Claude Design.** Before any UI is built, the
visual/interaction design is produced **upstream in Claude Design** (Anthropic's
prompt-to-prototype tool). When it's ready you **hand it off**: in Claude Design,
*Export → Handoff to Claude Code* gives you (a) a **copied prompt/command** and
(b) a downloadable **handoff bundle (zip)**. That bundle — not a hand-written
spec — is the **design input** to this app. The build does **not** invent a
look; it **realises** the handed-off design from the bundle's structured
metadata (it is *not* reverse-engineering a screenshot).

### 11.1 What the handoff bundle contains

A Claude Design → Claude Code handoff bundle is **machine-readable**, not just
pictures. Expect:

- **Component structure spec** — the components and their hierarchy as a
  structured spec (not pixels).
- **Design tokens actually used on the canvas** — colors, type, spacing, radii,
  elevation as token values.
- **Layout hierarchy + responsive breakpoints + interaction states** (hover,
  focus, active, disabled, empty, loading, error).
- **Referenced assets** — logos, icons, images.
- **Design files** — HTML/CSS/JS the tool produced.
- **Per-state screenshots** — the visual ground truth for each state.
- **A README** — naming the target stack and conventions to follow.
- **Design conversation history / rationale** — *why* decisions were made, so
  intent (not just appearance) carries through.

> Claude Design can also **import this repo** (GitHub or local dir) so it applies
> the app's existing design system and you can reference components by name. Once
> the app exists, prefer this loop: design *with* the codebase's tokens so the
> next handoff stays consistent rather than divergent.

### 11.2 The pipeline (ingest the bundle → build)

```
Claude Design (upstream)  ──Export→Handoff──►  bundle.zip + copied prompt  ──ingest──►  globals.css tokens  ──build──►  React/Tailwind/shadcn UI
  (prototype: screens,        (component spec, tokens,                       (single token home;             (components derive
   states, tokens,             breakpoints, states, assets,                   stack reconciled)               strictly from tokens)
   rationale)                  screenshots, README, rationale)
```

1. **Receive & commit the bundle.** Unzip the handoff under
   `docs/design-handoff/<date>-<surface>/` and commit it — bundle + the copied
   prompt + screenshots are the traceable design source of record.
2. **Reconcile the target stack.** The bundle's README/design files may target a
   different stack (often plain HTML/CSS or Next.js). **This app's stack is
   fixed:** Vite + React 19 + Tailwind 4 + shadcn/ui (§3/§10). Translate, don't
   adopt — map the bundle into this stack; never swap the stack to match the
   bundle. State the mapping you used in the design-handoff folder's notes.
3. **Tokenise → `globals.css`.** Lift the bundle's **design tokens** into
   `src/<App>.Web/src/styles/globals.css` **once** (Tailwind v4 `@theme inline`,
   hex/size direct) and map shadcn's `--color-*` / `--radius` onto them.
   `globals.css` is the canonical machine-readable token home — **never re-list
   hexes in component code or in this blueprint.**
4. **Build from tokens + spec.** Realise the component-structure spec on
   shadcn/Radix primitives, deriving every value from the tokens, and implement
   **every interaction state and breakpoint** the bundle specifies. Use the
   per-state screenshots as the acceptance reference and the rationale to resolve
   judgement calls.
5. **(Optional) `DESIGN.md` as a distilled human contract.** You *may* distill
   the bundle into a short `DESIGN.md` (north star + token map + component
   recipes + Do/Don't) as a readable in-repo summary. It is **not required** and
   it is **not** the source of truth — the committed bundle + `globals.css` are.
   If you keep one, it must be *derived from* the bundle, never a parallel
   hand-maintained truth that can drift.

### 11.3 Structural rules (hold regardless of the visual design)

These are **mechanism**, not aesthetics — they apply to *any* design the
upstream step produces:

- **Single token home.** Tokens live **once** in `globals.css`. A rename/retune
  happens in one place and propagates. The committed handoff bundle is the
  upstream source; `globals.css` is the in-app canonical encoding.
- **Derive, don't duplicate.** Components, the shadcn variable map, any optional
  `DESIGN.md`, and client TS types all derive from the canonical token/spec — no
  parallel hand-kept copies.
- **Realise, don't reinterpret.** Build the handed-off design faithfully,
  including its interaction states and breakpoints. If a state or edge case
  isn't in the bundle (spec, screenshots, or rationale), **ask — don't invent**
  a look (R26).
- **Respect the chosen primitives.** shadcn/ui + Radix are the component
  substrate; retune them to the tokens rather than fighting them or hand-rolling
  parallel widgets. Where a treatment isn't a stock shadcn variant (e.g. a
  signature CTA), add a **named custom variant** wired to a token, not one-off
  inline styles.
- **Theme policy comes from the bundle.** Dark-only, light-only, or themeable —
  and whether there's a switcher — is whatever the handoff specifies; structure
  the token layer to match (single theme vs. light/dark token sets).

### 11.4 Worked example — an illustrative token system

> Illustrative only — one possible resolved design system, to show the *shape* a
> distilled token system takes. **Your tokens come from your Claude Design
> handoff bundle, not from here.**

- **Dark-only, "blueprint at midnight":** deep cool navy, **never pure black or
  pure grey** — cool-tinted surface tokens; no theme switcher.
- **No-Line Rule:** never use 1px solid borders for sectioning;
  `--color-border` is `transparent`. Define boundaries with **surface tonal
  shifts** (higher tone = closer to viewer). Dashed affordances on genuine drop
  targets are the only sanctioned exception.
- **No dividers** in cards/lists — separate with vertical whitespace and tonal
  hover.
- **Surface hierarchy:** overlay base `surface-container-lowest` → `surface`
  (app bg) → `surface-container-low` → `surface-container` (cards) →
  `surface-container-high` (overlays/inputs) → `surface-container-highest`.
- **Radius hierarchy:** `sm` (0.125rem) for data cells; `xl` (0.75rem) for
  dashboard containers. Don't default everything to 0.25rem.
- **Typography:** a display/headline family (Manrope) + a body/label family
  (Inter) + a mono family (JetBrains Mono) for identifiers/numbers/`kbd` hints.
  **Tabular lining for all numbers.**
- **Primary CTAs:** a signature 135° gradient as a custom `variant="gradient"`
  (shadcn's default solid fill doesn't cover it). Cards are transparent-bordered
  surfaces that lift via background color only. Overlays sit on
  `--color-popover` with a deep diffuse shadow.
- **shadcn ↔ tokens:** `background`=surface, `card`=surface-container,
  `popover`=surface-container-high, `primary`=accent,
  `secondary`=surface-container-highest, `muted`=surface-container-low.

---

## 12. Testing & Verification Discipline

**Maximise coverage at every layer.** This blueprint expects comprehensive
automated tests — unit, integration, **and end-to-end** — not a thin happy-path
suite. Every layer of the stack has a test layer that owns it; together they
form a test pyramid. The aim is the **highest coverage that buys real
confidence**: every endpoint, event flow, read-model projection, and critical
user journey is exercised, plus the failure/edge/isolation paths a user could
hit. Coverage is a means, not the target — chase *behaviour* coverage (branches,
error paths, cross-module seams), not a vanity line-percentage from trivial
assertions.

### 12.1 The test pyramid (what each layer owns)

| Layer | Tooling | Owns / proves | Speed |
|---|---|---|---|
| **Unit** | server: xUnit + FluentAssertions · web: Vitest + RTL | Pure logic in isolation: importers/parsers, rule engines, derivations, mappers, reducers, hooks, single components, the event bus, module discovery. Cover branches + edge cases. | Fast — run freely |
| **Integration** | server: `WebApplicationFactory<Program>` + EF Core InMemory | Behaviour across seams: each endpoint end-to-end, **event publish → subscriber → local read-model round-trip**, auth/authorisation, **cross-user isolation**, handler partial-failure. | Fast-ish — run freely |
| **Full-stack integration** | `Aspire.Hosting.Testing` (real app + the real chosen database) | The wiring InMemory can't prove: real provider/EF behaviour, migrations applying, schema-per-module isolation, provider-specific features (e.g. `pg_trgm`, `ILIKE`, RLS on Postgres). | Slow — needs Docker; recommend & stop (§12.6) |
| **End-to-end (UI)** | **Playwright** against the running app | Real user journeys in a real browser: login, navigation, the critical flows of each feature, realtime/SignalR updates, accessibility, and the **interaction states + breakpoints from the design handoff**. | Slow — needs the app running; recommend & stop (§12.6) |

Rule of thumb: **push a test as low as it can go** (a unit test if pure logic can
prove it), but **every user-visible journey gets an e2e test** and **every
cross-module/data-layer behaviour gets an integration test** — don't simulate at
a lower layer what only a higher layer actually proves.

### 12.2 What to run (and read) before claiming done — R25

- Server: `dotnet build` (full type-check) → `dotnet test`.
- Web: `npm run build` (type-check + bundle) → `npm run test`.
- E2e: `npm run test:e2e` (Playwright) for changes that touch a user journey —
  this is **expensive** (§12.6): run it (or recommend the exact command and
  stop) per the cost rules, but the e2e specs themselves still ship with the
  change.
- Evidence before assertions: if something failed or was skipped, **say so with
  the output.** A green test run is not enough — the build catches what the test
  runner skips, and unit/integration green doesn't prove the journey works.

### 12.3 Test layout

- **Server:** one test project per module, mirroring `src/` (xUnit +
  FluentAssertions). Integration tests use `Microsoft.AspNetCore.Mvc.Testing` +
  `WebApplicationFactory<Program>` against the real Host with EF Core InMemory;
  `Program.cs` ends with `public partial class Program;` so WAF can find it.
  Full-stack tests live in their own project using `Aspire.Hosting.Testing`.
- **Web unit:** co-locate with source (`Foo.tsx` ↔ `Foo.test.tsx`, or
  `__tests__/`). Vitest + React Testing Library + jsdom.
- **Web e2e:** Playwright specs in `src/<App>.Web/e2e/` (or `tests/e2e/`),
  `playwright.config.ts` with the dev/preview server as `webServer`. Organise
  specs by user journey, one file per feature flow.

### 12.4 Shape vs behaviour — R24

**Shape tests prove structure; only integration/e2e tests prove behaviour.** Any
change to a data layer — an EF entity, a migration, a local read-model /
projection, or an event handler — **must** ship a real integration test that
writes then reads back **every affected field by name**
and asserts the values survive the round-trip. Don't lean on a generic suite
exercising other entities. Cover cross-user **isolation** (user A can't see
user B's data) and event-handler **partial-failure** paths.

### 12.5 End-to-end with Playwright — first-class, not deferred

E2e is a **required** layer, written alongside the feature (R23), not a
someday-phase. For each user-facing slice ship Playwright specs that:

- **Drive real journeys** through the running app (Aspire-launched or
  `vite preview` against the real API): log in, navigate, perform the feature's
  core actions, and assert the user-visible outcome — not internal state.
- **Cover the design handoff's states + breakpoints** (§11): empty, loading,
  error, success; key viewports the bundle specifies. Use the per-state
  screenshots as the acceptance reference; add visual-regression snapshots for
  signature surfaces where useful.
- **Exercise realtime** where the app uses it: assert a SignalR push updates the
  UI.
- **Assert accessibility** on primary screens (roles/labels/focus order;
  optionally an axe scan) so the design's semantics survive implementation.
- **Select by user-facing locators** (`getByRole`/`getByLabel`/`getByText`),
  not brittle CSS/test-id soup; seed state through the API or a test fixture,
  not by clicking through setup every time. Each spec is independent and
  idempotent (fresh user/data per run).

Keep e2e focused on journeys and cross-cutting behaviour — don't re-test pure
logic the unit layer already covers.

### 12.6 Test-cost discipline

- **Cheap, run freely:** `dotnet build`, `dotnet test` (InMemory), web unit
  tests (Vitest), a single focused filter/spec.
- **Expensive — write them always, but to *run* them recommend the exact command
  and stop, don't run unasked:** `Aspire.Hosting.Testing` full-stack runs (real
  app + the database container) and **Playwright e2e** (needs the app running, a
  browser, often Docker). Authoring/updating these is **not** optional — only
  the *unattended execution* is gated, because they're slow and the user runs
  them on their own schedule (and in CI).

### 12.7 CI gates

CI runs the full suite the same way the local commands do — Release
`dotnet build` + `dotnet test`, web `npm run build` + `npm run test`, and the
**Playwright e2e** job (plus the full-stack Aspire suite where the runner
supports Docker). A change isn't done until the layers it touches are green in
CI. Treat a red CI as a real failure to diagnose (§12.8), never something to
retry blindly.

### 12.8 Diagnose before fixing

Classify a failing test before touching it: **test bug** (wrong
selector/assertion or un-awaited race → fix the test), **app bug** (app violates
a correct expectation → fix the app, not the test), or **flaky** (reproduce
first, then stabilise — e2e flakiness usually means a missing await/auto-wait,
not a reason to add blind sleeps or `retries`). Never rewrite a failing
assertion just to get green — that hides real bugs. When unsure which side is
right, surface it and ask.

---

## 13. Cross-cutting conventions

- **Errors:** return one consistent JSON envelope (e.g. an `ErrorResponse`
  record → `{ "error": "..." }`) with the right status via
  `Results.BadRequest/NotFound/Conflict/Json`. Don't invent a new error shape
  per endpoint.
- **Logging:** inject `ILogger<T>`; **never** `Console.WriteLine` — OpenTelemetry
  and the Aspire dashboard depend on structured logs.
- **Single source of truth:** derive shared definitions from one canonical home;
  a rename there should be a compile/CI break, never a silent runtime drop.
  Never hand-maintain a parallel list that duplicates the canonical.
- **Coupled releases:** when a change alters a contract shared by producer and
  consumer (a `Contracts/` event between modules, or an API response the SPA
  reads), change **both sides together** — don't add a back-compat shim for a
  wire change you control on both ends.
- **Single concern:** every file/class/method does one thing; a module owns one
  feature; a DbContext owns one schema; an endpoint maps request→result and
  delegates the work. Split "manager/helper/utils" grab-bags.
- **Reuse before rewrite — but isolation wins:** extract a shared helper the
  second time logic appears; shared **code** belongs in `Core` only when it's
  genuine infrastructure. When tempted to reuse another module's type directly,
  **subscribe to its events and keep a local read model instead.**
- **Right home:** new code goes in the smallest scope that owns the concern —
  module-internal first, `Core` only when every module truly needs it.
- **Keep it lean:** delete dead code, unused params, speculative abstractions.

### 13.1 Significant-change protocol

A change is **significant** if it touches: a shared event contract, a
schema/migration, JWT/auth or per-user filtering, a new/removed endpoint, the
event-subscription wiring, or anything another module's read model observes. For a significant change, write
`docs/smoke-tests/<YYYY-MM-DD>-<topic>.md` and commit it with the
implementation. Open with an **Impact Analysis** — risk rating
(`low`/`medium`/`high`/`critical`) + one-line why, surface area, data /
migration / sync impact, backwards compatibility, regression risk, rollback
plan — then a human-runnable checklist (request → expected status + body field)
marked PASSED/FAILED/N/A. Focus on cross-module event flows and anything a user
would notice breaking; don't duplicate unit-test coverage.

### 13.2 Anti-patterns to reject on sight

- MediatR / MassTransit / Wolverine / Rebus / any external broker.
- MVC controllers / attribute routing.
- Module → module project references. Ever.
- Shared `DbContext`; cross-module or cross-schema SQL/joins.
- Business service interfaces in `Core/Services`.
- Business logic in `Program.cs` beyond discovery, hub mapping, CORS, health,
  SPA fallback, and `Database.Migrate()`.
- Static state in modules (except `Interlocked` one-time-subscription guards).
- `IHubContext<...>` injected outside the Notifications module.
- `EnsureCreated` on relational; missing migrations.
- Mixing more than one persistence engine in a single app, or standing up a
  DbContext before the backend was confirmed with the user (§8). A `Version` on a
  `PackageReference`.

### 13.3 Git / PR safety

- Develop on the designated feature branch; branch off `main` before committing
  if you're on it.
- **Don't push or open a PR without an explicit ask.** "Do X in a PR" describes
  the shape of the work, not authorisation to publish — stop after the commit
  and wait.

---

## 14. Build Order (phased)

Ship the thinnest bootable slice first, then widen. Each phase ends green
(`dotnet build`/`test`, `npm run build`/`test`, and the e2e suite where a journey
changed) before the next starts. **Test infrastructure is stood up early and
every phase extends all three layers** (unit, integration, e2e) — testing is not
a trailing phase. Track status in `docs/ROADMAP.md`.

**Phase 0 — Ingest the Claude Design handoff (prerequisite, design-first).**
Produce the UI upstream in **Claude Design**, then *Export → Handoff to Claude
Code*. Commit the **handoff bundle** + copied prompt + screenshots under
`docs/design-handoff/<date>-<surface>/`, reconcile its target stack to this
app's fixed Vite/React/Tailwind/shadcn stack (note the mapping), and lift its
tokens into the `globals.css` token layer with the shadcn variable map (§11).
Record the theme policy (dark/light/themeable). Optionally distill a short
derived `DESIGN.md`. This phase is design + docs only — no app code — and it
gates Phase 2. (Server work in Phase 1 can proceed in parallel since it has no
UI.)

**Phase 1 — Server skeleton ("it boots").**
**First, ask the user which persistence backend to use (§8)** and record it in
`docs/ROADMAP.md` — this phase writes the first DbContexts and migrations, so the
engine must be chosen before any code is. Then: solution (`.slnx`, `global.json`,
CPM), Aspire AppHost (the chosen database + API), ServiceDefaults, `Core`
(IModule, ModuleDiscovery, IEventBus + InProcessEventBus, IEvent, ICurrentUser,
JWT), Host composition root, and 3–4 module stubs (`Auth`, `Notifications`, a
domain module, a read-model module) each with a real DbContext + schema + Initial
migration. Tests: event-bus, module-discovery, module smoke.

**Phase 2 — Branded client shell ("it looks right") — realises the Phase 0 handoff.**
Vite + React 19 + TS strict + Tailwind 4 + shadcn, with the Phase 0 tokens
already in `globals.css`; realise the handed-off component-structure spec —
build the app shell (nav, header, logo) and route stubs to match the bundle's
screenshots, retuning shadcn components to the tokens, adding any named custom
variants the design needs, and implementing the specified interaction states +
breakpoints. AppHost adds `AddViteApp`. **Stand up the test harnesses here:**
Vitest + RTL and **Playwright** (`playwright.config.ts` with the dev/preview
server as `webServer`) with a first smoke e2e (app loads, shell renders, key
breakpoints). No API calls yet. Done when the shell matches the handoff
screenshots, uses **only** tokens (no duplicated hexes), and the smoke e2e is
green.

**Phase 3 — Auth end-to-end ("you can log in").**
**First, ask the user which authentication mechanism to use (§4.6)** and record
it in `docs/ROADMAP.md` — never assume one. Then wire the chosen option behind
the `ICurrentUser` seam:
- *Local-DB JWT:* Argon2id hasher, JWT token service, login endpoint,
  `admin add-user` CLI; client login (RHF + Zod) + token storage.
- *OpenID Connect / Azure Entra ID:* configure `Authority`/`Audience` validation
  in `Core`; client uses an OIDC/MSAL flow (PKCE); no `Auth` module.

Common to both: auth-header (or `access_token`) injection, protected routes,
TanStack Query setup, integration tests asserting `RequireAuthorization()`
rejects anonymous requests and `ICurrentUser.UserId` resolves correctly, and a
**Playwright login journey** (sign in → land on a protected route → sign out)
plus an auth-fixture other e2e specs reuse to start authenticated.

**Phase 4 — First domain vertical.**
A real domain module with write + read endpoints, event publishing, a read-model
module subscribing to those events, and a Notifications relay pushing a SignalR
message. Client screens for the slice. Tests across all layers: unit (logic),
integration over the event seam + read-model round-trip + cross-user isolation,
and a **Playwright e2e for the slice's core journey** (incl. the realtime update
landing in the UI).

**Phase 5+ — Widen.**
More domain modules, background jobs (`AddHostedService` + a job runner with
bounded `Parallel.ForEachAsync`), richer Notifications relays, analytics — each
shipping its own unit + integration + e2e coverage.

**Later phases (scope when needed).**
Installable PWA (manifest); provider-level row-security hardening (e.g. Postgres
RLS, §8); any LLM/AI features behind an
interface (e.g. `ISuggester`) so implementations slot into a chain. *(Playwright
e2e is not here — it's established in Phase 2 and extended every phase, §12.)*

---

## 15. Definition of Done (per change)

- [ ] Obeys every applicable rule in the [Rules Digest](#1-rules-digest-read-first).
- [ ] No module→module reference; no cross-schema access; events + local read
      models for any cross-module data.
- [ ] DTOs are records; endpoints are Minimal APIs under `/api/<feature>/...`;
      every query filters by `UserId`.
- [ ] Coverage extended across the layers the change touches (R23, §12): unit
      for logic, integration for data-layer/event seams, **Playwright e2e for any
      user-facing journey** — failure/edge/isolation paths included, not just the
      happy path.
- [ ] Data-layer changes ship a round-trip integration test asserting every
      affected field by name (R24), plus cross-user isolation where relevant.
- [ ] `dotnet build` + `dotnet test` green; `npm run build` + `npm run test`
      green; `npm run test:e2e` green (or run-command recommended per §12.6 for
      this expensive layer) — output **read**, not assumed (R25).
- [ ] UI faithfully realises the committed Claude Design handoff bundle
      (component spec, interaction states, breakpoints, screenshots); styles
      derive from `globals.css` tokens (no duplicated hexes/sizes); the fixed
      Vite/React/Tailwind/shadcn stack was kept; unspecified states were asked
      about, not invented (R26).
- [ ] The persistence backend (§8) and auth mechanism (§4.6) were **confirmed
      with the user**, not assumed, and recorded in `docs/ROADMAP.md`.
- [ ] Significant change → `docs/smoke-tests/<date>-<topic>.md` committed with
      the code; `docs/ROADMAP.md` updated.
- [ ] No push / PR unless explicitly asked.

---

*This blueprint is the architecture contract; the committed Claude Design
handoff bundle (§11) is the design contract. When a decision isn't covered by
either, ask before inventing — and when you extend the architecture, update this
document so it stays the single source of truth.*
