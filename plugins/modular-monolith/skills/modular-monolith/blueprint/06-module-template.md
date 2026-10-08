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
using <App>.Core.Outbox;
using <App>.Modules.<Feature>.Data;
using <App>.Modules.<Feature>.Endpoints;
using <App>.Modules.<Feature>.Services;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace <App>.Modules.<Feature>;

public sealed class <Feature>Module : IModule          // R4: sealed, parameterless ctor
{
    public string Name => "<Feature>";
    // R16: subscribe once per bus. A plain static flag would let only the first test host in a process subscribe.
    private static readonly ConditionalWeakTable<IEventBus, object> SubscribedBuses = new();

    public void RegisterServices(IServiceCollection services)
    {
        services.AddDbContext<<Feature>DbContext>((sp, opts) =>
        {
            var cs = sp.GetRequiredService<IConfiguration>().GetConnectionString("<app>");
            // R9: the history table lives in the module's own schema.
            // The interceptors number each added event and write its deliveries in the same save, so without them nothing is delivered (§4.8).
            opts.<UseProvider>(cs, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "<schema>"))
                .AddOutboxInterceptors(sp);
        });

        // R19: scoped, so each event gets its own context.
        services.AddScoped<SomethingSnapshotHandler>();
        // Domain services (Scoped), any background worker (§6.10) and the module's health check are registered here too.
    }

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        <Feature>Endpoint.Map(app);                       // R17: Minimal APIs

        var bus = app.ServiceProvider.GetRequiredService<IEventBus>();
        // R16: this bus already has this module's subscriptions.
        if (!SubscribedBuses.TryAdd(bus, new object())) return;

        // R15: events that change this module's stored data arrive through the outbox (§4.8).
        // The handler is built on the context the outbox hands in, so its writes share the delivery's transaction.
        var durable = app.ServiceProvider.GetRequiredService<IDurableEventSubscriptions>();
        durable.Subscribe<SomethingImported, <Feature>DbContext>("<Feature>.SomethingImported",
            (db, e, sp, ct) => ActivatorUtilities.CreateInstance<SomethingImportedHandler>(sp, db).HandleAsync(e, ct));
        // Every module that owns a schema subscribes to both erasure events (§6.7).
        durable.Subscribe<OwnerDataClearRequested, <Feature>DbContext>("<Feature>.OwnerDataClearRequested",
            (db, e, sp, ct) => new OwnerDataEraser(db).EraseAsync(e.OwnerId, ct));
        durable.Subscribe<OwnerDeleted, <Feature>DbContext>("<Feature>.OwnerDeleted",
            (db, e, sp, ct) => new OwnerDataEraser(db).EraseAsync(e.OwnerId, ct));

        // Traffic that is safe to lose (here a rebuild snapshot, §4.9) stays on the bus, in a fresh scope per event.
        bus.Subscribe<SomethingSnapshot>(async (e, ct) =>
        {
            using var scope = app.ServiceProvider.CreateScope();
            await scope.ServiceProvider.GetRequiredService<SomethingSnapshotHandler>().HandleAsync(e, ct);
        });
    }
}
```

### 6.2 `Data/<Feature>DbContext.cs`

```csharp
using <App>.Core.Outbox;
using Microsoft.EntityFrameworkCore;

namespace <App>.Modules.<Feature>.Data;

public sealed class <Feature>DbContext(DbContextOptions<<Feature>DbContext> options) : DbContext(options)
{
    public DbSet<Thing> Things => Set<Thing>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("<schema>");        // R7: schema-per-module
        // The outbox tables this context writes, and this module's own inbox (§4.8).
        modelBuilder.AddOutbox();
        modelBuilder.AddInbox();
        modelBuilder.Entity<Thing>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.OwnerId, x.ExternalKey }).IsUnique();
        });
    }
}

public sealed class Thing
{
    public Guid Id { get; set; }
    // Every read is scoped to the owner (§6.3, §4.4).
    public Guid OwnerId { get; set; }
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
            if (currentUser.OwnerId is not { } ownerId) return Results.Unauthorized();

            // Scope to the owner, which is the user in a per-user app (see the notes below).
            var things = await db.Things
                .Where(t => t.OwnerId == ownerId)
                .OrderBy(t => t.UpdatedAt)
                .Select(t => new ThingResponse(t.Id, t.ExternalKey, t.UpdatedAt))
                .ToListAsync(ct);

            return Results.Ok(things);
        }).RequireAuthorization();
    }
}
```

> **Scope to the access boundary, which is not always the individual user.** Personal data (a user's notifications, settings, private drafts) is owned by the user, so its owner id is the user's id. But many domains are **workspace/tenant-shared**: every member sees the same records, subject to role (e.g. *reviewer+ sees all; others see published + their own*). There the owner is the workspace, plus a role gate. Pick the boundary the requirements dictate, apply it **consistently** on every read through a shared query helper (e.g. `.VisibleTo(currentUser)`) rather than hand-written `Where` clauses that drift, and **record any workspace-shared decision in `docs/ROADMAP.md`**. The rule that never bends: **every query is scoped to *some* boundary, never the whole table.**

> **The key is the owner of the data, never the person acting.** The ownership boundary is decided in §3, and `ICurrentUser` carries both ids (§4.4). The sample filters on `OwnerId`, which is the user's id in a per-user app and the tenant's id (a household, team or workspace) in a shared one, so the same code stays right if a per-user app later becomes shared. Every row, durable event and push address carries the owner (§7, Notifications); `UserId` is for audit and the person's own sign-ins. Take the owner from the token, never from the request. Switching an app keyed on the user id over to shared data later touches every table, every event contract, push addressing and any stored event payloads, while an owner column that happens to equal the user id costs nothing.

### 6.4 Event handler (local read model)

```csharp
using <App>.Core.Events.Contracts;
using <App>.Modules.<Feature>.Data;

namespace <App>.Modules.<Feature>.Services;

// Consumes another module's event and maintains THIS module's local read model (R3/R8).
// It writes the event's facts onto the row the event names, so running it twice leaves the same row.
public sealed class SomethingImportedHandler(<Feature>DbContext db)
{
    public async Task HandleAsync(SomethingImported e, CancellationToken ct)
    {
        var thing = await db.Things.FindAsync([e.ThingId], ct);
        if (thing is null)
        {
            thing = new Thing { Id = e.ThingId, ExternalKey = e.Key };
            db.Things.Add(thing);
        }
        thing.OwnerId = e.OwnerId;
        thing.ExternalKey = e.Key;
        thing.UpdatedAt = e.OccurredAt;
        await db.SaveChangesAsync(ct);
    }
}
```

**Every handler must be safe to run twice.** A handler can see the same fact more than once: the bus retries a failed handler after a partial success (R15), and a rebuild applies snapshots of rows the handler already wrote (§4.9). Nothing reports the damage when a handler is not safe: a counter or a running total is simply wrong from then on. Two shapes are safe:

- **Idempotent by construction (the default):** insert or overwrite the row the event names, as the sample does. Never `count++`, add an amount to a running total or append a row per event; work such a figure out from the rows it summarises instead. A concurrent repeat collides on the key, and its retry then takes the overwrite path.
- **Deduplicated through an inbox:** a row keyed on (event id, subscriber name) in the module's own inbox table, written in the same transaction as the change, so a repeat is skipped. The outbox does this for every durable delivery (§4.8), which makes a non-overwrite change safe there; it does nothing for a bus retry or a snapshot, so a handler reached that way still has to be idempotent by construction.

### 6.5 Publishing an event

An event that changes another module's stored data is added to the context before the save that commits the change, so the outbox stores it in the same transaction (R15, §4.8):

```csharp
using <App>.Core.Outbox;

db.Things.Add(thing);
db.AddEvent(new <Thing>Created(thing.Id, ownerId, thing.Name, DateTimeOffset.UtcNow));
await db.SaveChangesAsync(ct);
```

Traffic that is safe to lose (a push, job progress, a replay request or its answer) is published on `IEventBus` with `PublishAsync` after the commit instead (§4.2).

**Chains and bulk writes need three more rules.** §4.8 already requires a handler continuing a chain to add its event before the save, as an endpoint does, and to write only through the context the outbox hands it. Beyond that:

- **Never `PublishAsync` from a handler to a subscriber that stores data.** It runs straight away, before the delivery's transaction commits, so it announces a change that can still roll back. A durable subscriber reached that way writes in its own scope with no transaction, so the rollback cannot undo what it wrote. Add the event with `AddEvent` on the handed context instead. The one exception is answering a replay request, which is a fresh re-sync, not a chain (§4.9).
- **An event that must apply after earlier ones goes in a later save.** When it describes rows an earlier save produced (a link between rows that were just imported, say), save those rows and their events first, then add it in a second save, so it is numbered after every event it depends on.
- **`ExecuteUpdate` and `ExecuteDelete` skip the save, so its interceptors never see them** (reference stack). They run at once in their own statement, outside any transaction unless one is already open. When one is the change an event describes, open a transaction first and make the save that carries the event inside it, so both commit together. A durable handler needs nothing extra, because the outbox's transaction is already open (§6.7 relies on this).

### 6.6 Config-switched external-service seams

Any dependency the app **doesn't own** — cloud storage, a translation/AI provider,
an email sender, a managed search index, a provider-owned reference list — sits
behind a **config-switched seam**, never called directly. This is R28(c) (provider
data) generalised to *every* external service, and in practice it's one of the
most-used patterns in a real app, so treat it as first-class:

- **An interface in the owning module** (or in `Core` only if genuinely shared —
  e.g. a read-only content source, §4.7): `IBlobStore`, `ITranslator`,
  `IEmailSender`, `ISearchIndex`, `ILanguageCatalog`, …
- **A `Fake` (or emulator) implementation for tests and offline dev**, so the whole app boots and every test runs **offline** with no cloud credentials. The test host and the dev AppHost (the paragraph after the sample) select it explicitly; it is never what a missing or mistyped setting falls back to, because a fallback to Fake serves made-up output to real users while health shows green.
- **`Off` for an optional user-facing feature**, and the default when its mode is not set: the feature is absent, its endpoints answer 503 and the client hides it. A seam the app cannot run without has no `Off`, so a missing mode stops startup instead.
- **A real adapter** behind the same interface for deployed environments; it picks
  its own auth (dev shared-key/emulator vs. managed identity in prod) *inside* the
  seam, so nothing above it knows or cares.
- **One switch per seam**, read from config under a single `Integrations:*` namespace, with **named constants** (R27) for both the keys and the mode values, never scattered strings. A seam may have more than two modes (e.g. `Off | Fake | Postgres | Azure`).
- **The mode is checked against the declared set at startup, and anything else fails fast**, naming the key, the value and the accepted values. **Production refuses `Fake`** in the Host's fail-fast config guards (§5), the same way it refuses a wildcard `AllowedHosts`; the guard reads the seam keys from the one constants home, so a new seam is covered without editing it.
- **An LLM or other slow remote model seam needs four more things.** Set a timeout on every call. Turn automatic retries off for batch work, because a dead server otherwise costs every retry's timeout on every item. Tell "could not reach the model" apart from "the model had no answer". Offer an on-demand probe (is the server reachable, is the configured model installed) beside the config-only health check, which says what is wired but not whether it answers.
- **Reflected in health** — a Fake seam registers a no-op check; a real one
  registers a live probe, so a services-state view shows what's actually wired.

```csharp
// In <Feature>Module.RegisterServices: one switch, named constants (R27), Off when unset.
var mode = config[IntegrationKeys.Translator] ?? IntegrationModes.Off;
switch (mode)
{
    // Off reports unavailable, so the endpoints answer 503.
    case IntegrationModes.Off:   services.AddSingleton<ITranslator, OffTranslator>(); break;
    case IntegrationModes.Fake:  services.AddSingleton<ITranslator, FakeTranslator>(); break;
    case IntegrationModes.Azure: services.AddSingleton<ITranslator, AzureTranslator>(); break;
    // A typo such as "azure" stops startup here instead of quietly picking an implementation.
    default: throw new InvalidOperationException(
        $"'{IntegrationKeys.Translator}' is '{mode}'. Expected {IntegrationModes.Off}, {IntegrationModes.Fake} or {IntegrationModes.Azure}.");
}
```

The **AppHost** resolves each seam's mode once (explicit config wins; else the provider when its settings are present; else Fake, which the AppHost sets explicitly in dev only) and injects it, plus any endpoints and keys, as environment variables, so a single dev config point drives the whole stack (§9). Keep the seam list, its keys, and its mode values in **one** constants home in `Core`; don't re-list them per module (R29).

### 6.7 Erasing an owner's data is every module's job

Under R3 every module that copies data keeps its own copy, so clearing an owner's data or deleting an account is an obligation on every module that owns a schema, not only on the module that owns the account. A module that forgets keeps personal data after the owner asked for it to go, and nothing reports it.

- **Two whole-owner erasure events, defined in §4.8, because clearing data and deleting the owner are different requests.** `OwnerDataClearRequested` keeps the identity: `Auth` keeps its accounts so the owner can still sign in, and every other module that owns a schema deletes the owner's rows. `OwnerDeleted` removes everything, `Auth` included. One event for both would make `Auth` delete the accounts of an owner who only asked to start over.
- **Every module that owns a schema subscribes to each event that applies to it** durably, beside its other subscriptions (§6.1). The handler deletes everything the module keeps for that owner, children before parents, through the context the outbox hands it:

```csharp
// Services/OwnerDataEraser.cs. Deleting by owner gives the same result however often it runs.
public sealed class OwnerDataEraser(<Feature>DbContext db)
{
    public async Task EraseAsync(Guid ownerId, CancellationToken ct) =>
        await db.Things.Where(t => t.OwnerId == ownerId).ExecuteDeleteAsync(ct);
}
```

- **Nothing queued may undo it.** A delivery still waiting for a retry would write the cleared data back after the handlers have run, so the producer saves the erasure with the outbox's superseding call (§4.8), which skips that owner's earlier open deliveries in the same transaction.
- **A module whose data expires on its own may be exempt**, such as a log store that deletes every entry after a fixed number of days. It is named, with its retention, in one declared exemption list (an entry such as `Observability`: "captured warnings and errors, rows expire after 14 days (§7.4)"), so leaving it out is a decision someone can read rather than a module that was forgotten.
- **A test proves no module was missed.** A structural test discovers modules the way the Host does and fails for any module that registers a data context, is not on the exemption list, and has no durable subscriber named `<Feature>.OwnerDeleted`, or none named `<Feature>.OwnerDataClearRequested` unless it is `Auth`. It reads the subscriber names from the list `IDurableEventSubscriptions` exposes (§4.8), never a hand list. An integration test writes data for one owner through each module's normal paths, raises each erasure event, and asserts that every subscribing module holds nothing for that owner once delivery completes (and that `Auth` still holds the accounts after a clear), while a second owner's data is untouched.

### 6.8 A new module is listed in places discovery cannot see

Discovery (R5) means the running app needs no hand-wiring, but the build, the container image and CI still list modules. A new module that misses one passes every local gate and then breaks the release image, or is silently skipped by CI. Every new module goes through this list:

1. `src/modules/<App>.Modules.<Feature>/` from this template, with `tests/modules/<App>.Modules.<Feature>.UnitTests/` and `.IntegrationTests/`, all added to the solution.
2. A project reference from the Host (R6), so the build copies the module's assembly to where discovery looks.
3. The container image build: if its restore stage copies project files one by one, add the module's. Copying them by pattern is better, because then there is nothing to list.
4. CI: the integration test project lands in a test shard or matrix entry.
5. The erasure subscriptions (§6.7), a health check, `docs/modules/<feature>.md` and the `docs/ROADMAP.md` entry (§15).
6. Client: routes, navigation and any in-app help for the module's screens.

**A mechanical guard backs the list.** A structural test that needs no database (for example in `<App>.Core.Tests`) reads the repository as text. It fails when a project under `src/modules/` is missing from the Host's references or from the image build's restore stage, or when an integration test project under `tests/modules/` is in no CI shard. A restore stage that copies by pattern passes without listing anything.

### 6.9 Retiring a module takes two releases

Deleting a module's folder is not enough. Its schema still holds personal data that erasure no longer reaches, deliveries addressed to its subscribers retry and then park, and anything that read its contracts, its API or its routes breaks. The teardown migration lives in the module's own assembly, so it has to run in a release that still ships that assembly. Retire a module over two releases:

1. **The last release with its code** removes its endpoints, its subscriptions and anything else that touches its tables, and adds a **teardown migration** to its own context that drops those tables. The migrations history table stays in the schema because the migration run writes to it, so the schema is left holding only its history table, or dropped by hand at deploy. The same teardown migration skips the module's open durable deliveries by subscriber name (§4.8), or each one retries for its whole retry window and then parks.
2. **The same release, outside the module:** remove event fields and events only it consumed, in a coupled change with their producers; remove anything that called its API (an assistant tool, an export); and redirect its old client routes to the nearest surviving screen.
3. **The next release deletes the code:** the project, its tests, the Host reference and every entry from the §6.8 list. It assumes every environment ran the teardown release, so deploy that release everywhere first, or have the deletion release refuse to start where the teardown migration is not recorded in the module's history table. The §6.8 guard and the §6.7 erasure test confirm nothing was left behind. Publish into a clean output folder, because discovery scans that folder (R5) and would load and run a leftover `<App>.Modules.<Feature>` assembly from an earlier build.

### 6.10 A background worker waits on its own queue and reports what it last did

A worker woken by a signal is rightly quiet for hours, so neither "is it busy" nor "when did it last report" says whether it is alive. Each worker reports its state into Core's `IWorkerStatus` (§4.7), and health reads what it last said.

```csharp
using <App>.Core.BackgroundWork;
using <App>.Core.Health;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace <App>.Modules.<Feature>.Jobs;

// A named seam over Core's queue, so this worker's queue is a service of its own. The work item rides on the signal, so the worker never goes looking for it.
public interface I<Feature>JobQueue : IBackgroundWorkQueue<<Feature>JobRequest>;

public sealed class <Feature>JobQueue : I<Feature>JobQueue
{
    private readonly BackgroundWorkQueue<<Feature>JobRequest> _queue = new();
    public ValueTask EnqueueAsync(<Feature>JobRequest work, CancellationToken ct = default) => _queue.EnqueueAsync(work, ct);
    public IAsyncEnumerable<<Feature>JobRequest> DequeueAllAsync(CancellationToken ct) => _queue.DequeueAllAsync(ct);
}

public sealed class <Feature>JobRunner(
    I<Feature>JobQueue queue, IServiceScopeFactory scopes, IWorkerStatus status, ILogger<<Feature>JobRunner> log)
    : BackgroundService
{
    // "<Module>.<Worker>", so a health view can show the worker under its module.
    internal const string WorkerName = "<Feature>.Jobs";
    // How many jobs run at once is this module's policy, so the limit lives here and not in Core.
    private const int Concurrency = 2;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        status.Started(WorkerName, WorkerKind.Loop);
        using var slots = new SemaphoreSlim(Concurrency);
        var running = new List<Task>();
        try
        {
            // Parks here until a producer enqueues, so an idle worker costs nothing (R31).
            await foreach (var job in queue.DequeueAllAsync(stoppingToken))
            {
                await slots.WaitAsync(stoppingToken);
                running.RemoveAll(t => t.IsCompleted);
                running.Add(RunAsync(job, slots, stoppingToken));
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // The host is shutting down, which is not a failure; the finally block reports the stop.
        }
        finally
        {
            await Task.WhenAll(running);
            status.Stopped(WorkerName);
        }
    }

    private async Task RunAsync(<Feature>JobRequest job, SemaphoreSlim slots, CancellationToken ct)
    {
        // The job is for an owner and no one person, so its log lines carry the owner (§13). It opens outside the try so the failure logged below carries it too.
        using var ownerScope = log.BeginScope(new Dictionary<string, object> { ["OwnerId"] = job.OwnerId });
        try
        {
            using var scope = scopes.CreateScope();
            await scope.ServiceProvider.GetRequiredService<<Feature>JobHandler>().HandleAsync(job, ct);
            status.Iterated(WorkerName);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // A job cut short by shutdown did not fail, so it is neither logged nor reported.
        }
        catch (Exception ex)
        {
            log.LogError(ex, "<Feature> job {JobId} failed", job.JobId);
            status.Failed(WorkerName, ex);
        }
        finally
        {
            slots.Release();
        }
    }
}
```

Register the queue as a singleton, the runner with `AddHostedService` and the handler as scoped, in `RegisterServices` (§6.1). The rules the sample carries:

- **The queue carries the work.** A bare "something changed" signal sends the worker to search a store for what, which is polling by another name. Producers enqueue a request; the worker never scans.
- **Concurrency limits are the module's policy**, held in the runner. When long jobs and quick interactive ones share a worker, give each its own limit, so a burst of long jobs cannot hold up a click.
- **Report by kind.** A loop calls `Started` with `WorkerKind.Loop`, then `Iterated` or `Failed` after each job and `Stopped` when it exits for any reason. A startup pass calls `Started` with `WorkerKind.RunOnce`, then `Completed` or `Failed` once. Health counts a loop as down when it has stopped or its last job failed, and a run-once pass when it failed. An idle loop is up however long it has been quiet.
- **A timer only wakes the worker at a time already decided**: a due time stored with the work, or a genuine schedule such as a nightly prune (R31). It enqueues the work that is due; it never wakes to look for some.
- **The queue lives in memory, so a restart loses what was queued.** Work that must survive a restart is a row first, enqueued after it commits. At startup, fail or re-enqueue rows a previous process left running, or they show as in progress for ever.
- **Each module registers one health check of its own**: it can open its schema and has no pending migrations. Tag it so a health view lists every module's check together, and give it a short timeout so one stuck database call cannot hold up the whole report.
