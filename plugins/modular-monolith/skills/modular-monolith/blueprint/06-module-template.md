> **Modular Monolith Blueprint — §6.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 6. Module Template

A module is a self-contained vertical slice: its own data-access context +
schema, its own migrations, its own endpoints, its own event handlers and local
read models. Use this template (reference-stack code — translate per §3) for
every new `<Feature>`.

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
    public Guid UserId { get; set; }                      // scope every read to its access boundary (§6.3)
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
                .Where(t => t.UserId == userId)            // scope to the access boundary — per-user here (see note)
                .OrderBy(t => t.UpdatedAt)
                .Select(t => new ThingResponse(t.Id, t.ExternalKey, t.UpdatedAt))
                .ToListAsync(ct);

            return Results.Ok(things);
        }).RequireAuthorization();
    }
}
```

> **Scope to the access boundary — not always to the individual user.** Per-user
> filtering (`WHERE UserId = @me`) is the **default** and the right call for
> personal data (a user's notifications, settings, private drafts). But many
> domains are **workspace/tenant-shared**: every member sees the same records,
> subject to role (e.g. *reviewer+ sees all; others see published + their own*).
> There the boundary is the workspace (plus a role gate), not the individual. Pick
> the boundary the requirements dictate, apply it **consistently** on every read
> through a shared query helper (e.g. `.VisibleTo(currentUser)`) rather than
> hand-written `Where` clauses that drift, and **record any workspace-shared
> decision in `docs/ROADMAP.md`**. The rule that never bends: **every query is
> scoped to *some* boundary — never return the whole table.**

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

### 6.6 Config-switched external-service seams

Any dependency the app **doesn't own** — cloud storage, a translation/AI provider,
an email sender, a managed search index, a provider-owned reference list — sits
behind a **config-switched seam**, never called directly. This is R28(c) (provider
data) generalised to *every* external service, and in practice it's one of the
most-used patterns in a real app, so treat it as first-class:

- **An interface in the owning module** (or in `Core` only if genuinely shared —
  e.g. a read-only content source, §4.7): `IBlobStore`, `ITranslator`,
  `IEmailSender`, `ISearchIndex`, `ILanguageCatalog`, …
- **A `Fake` (or emulator) implementation that is the default**, so the whole app
  boots and every test runs **offline** with no cloud credentials.
- **A real adapter** behind the same interface for deployed environments; it picks
  its own auth (dev shared-key/emulator vs. managed identity in prod) *inside* the
  seam, so nothing above it knows or cares.
- **One switch per seam**, read from config under a single `Integrations:*`
  namespace, with **named constants** (R27) for both the keys and the mode values
  — never scattered strings. A seam may have more than two modes (e.g.
  `Fake | Postgres | Azure`).
- **Reflected in health** — a Fake seam registers a no-op check; a real one
  registers a live probe, so a services-state view shows what's actually wired.

```csharp
// In <Feature>Module.RegisterServices — one switch, named constants, Fake default.
var mode = config[IntegrationKeys.Translator] ?? IntegrationModes.Fake;      // R27: no bare strings
if (mode == IntegrationModes.Azure) services.AddSingleton<ITranslator, AzureTranslator>();
else                                services.AddSingleton<ITranslator, FakeTranslator>();
```

The **AppHost** resolves each seam's mode once (explicit config wins; else the
provider when its settings are present; else the Fake/local fallback) and injects
it — plus any endpoints/keys — as environment variables, so a single dev config
point drives the whole stack (§9). Keep the seam list, its keys, and its mode
values in **one** constants home in `Core` — don't re-list them per module (R29).
