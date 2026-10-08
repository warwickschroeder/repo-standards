> **Modular Monolith Blueprint — §4.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 4. Core Library — the framework everyone shares

`<App>.Core` is the only project modules reference. It contains the module contract, the event bus and its transactional outbox (§4.8), the auth infrastructure, and the **shared event contracts**, and, as the app grows, the other **cross-cutting infrastructure** every (or most) modules lean on (§4.7). It must contain **no business services, no business state and no business service interfaces** (R20); the one kind of domain rule it holds is a pure function several modules must compute the same way (§4.7).

> **Reference-stack code ahead.** The samples in §§4–7 and §9 are written in
> the reference stack (§3.1) so the patterns are concrete. They are the
> *pattern*, not a stack mandate: keep the contracts, lifetimes, guards, and
> the behaviour the comments encode; translate the idioms into the stack the
> user chose in §3.

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
    private const int MaxHandlerAttempts = 3;                       // bounded retry, NOT fire-and-forget
    private static TimeSpan Backoff(int attempt) => TimeSpan.FromMilliseconds(100 * attempt);

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

        // Sequential; one failing subscriber never breaks the publisher or its siblings.
        foreach (var h in snapshot.Cast<Func<TEvent, CancellationToken, Task>>())
            await InvokeWithRetryAsync(h, @event, ct);
    }

    private async Task InvokeWithRetryAsync<TEvent>(
        Func<TEvent, CancellationToken, Task> handler, TEvent @event, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try { await handler(@event, ct); return; }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; } // real shutdown — don't swallow
            catch (Exception ex)
            {
                if (attempt >= MaxHandlerAttempts)
                {
                    // Give up loudly, never silently. Only traffic that is safe to lose comes this way (see the durability note below).
                    log.LogError(ex, "Handler for {Event} failed after {Attempts} attempts; change dropped",
                        typeof(TEvent).Name, attempt);
                    return;
                }
                log.LogWarning(ex, "Handler for {Event} failed (attempt {Attempt}); retrying", typeof(TEvent).Name, attempt);
                await Task.Delay(Backoff(attempt), ct);
            }
        }
    }
}
```

> **Durability: a direct publish is at-most-once, so it carries only what is safe to lose.** `PublishAsync` runs *after* the producer has committed its own write, so a handler that exhausts its retries (a **persistent** fault, not a transient one) drops the change for that subscriber. The consumer's read model then stays wrong with nothing to report it. Retry absorbs the transient case; it does **not** close the persistent one. So **an event that changes another module's stored data goes through the transactional outbox (§4.8) from the start, even on a single host** (R15). A real app that deferred it until "outgrown" built boot snapshots, replay requests and rescans to repair dropped events instead, and that repair machinery produced more defects than the outbox that replaced it. Keep `PublishAsync` for pushes, job progress, sign-in revocations (§7.2), and replay requests and their answers (§4.9), where a lost message is made good by the next one.
>
> **Handler order across modules is an accident.** Handlers run in subscription order, which follows `ModuleDiscovery`'s sort by module name, so renaming a module silently reorders side effects. Never rely on it: a step that must follow another module's write is driven by an event that module raises after its own commit (R15).

### 4.3 Shared event contract (example)

An event carries the **owner** of the data it describes (§4.4), not the person who acted, because every consumer stores and filters its copy by owner. Add the actor's id as a separate field only when a consumer needs it.

```csharp
// Core/Events/IOwnedEvent.cs
namespace <App>.Core.Events;

// Every durable event implements this, because the outbox orders and locks deliveries by owner (§4.8).
public interface IOwnedEvent : IEvent { Guid OwnerId { get; } }
```

```csharp
// Core/Events/Contracts/<Thing>Created.cs
namespace <App>.Core.Events.Contracts;

public sealed record <Thing>Created(
    Guid <Thing>Id,
    Guid OwnerId,
    string Name,
    DateTimeOffset CreatedAt
) : IOwnedEvent;
```

### 4.4 Current-user infrastructure — the stable auth seam

`ICurrentUser` is the **only** thing modules know about authentication. It is the
stable seam that decouples every module from *how* a user is authenticated. The
authentication **mechanism is the implementor's choice** (see §4.6) — modules
never change when you swap it.

**The person acting and the owner of the data are two ids from day one.** The owner is whatever the §3 ownership boundary decided: the user, or a tenant (a team, a workspace, a household) the user belongs to. Every query filters on the owner, every owned row and durable event carries it, push goes to the owner's group, and roles are scoped to it; the actor id is for audit and for the person's own sign-ins. The owner id comes from the signed-in principal, never from the request. Keep both even when they are equal, because an app that starts per-user and later becomes shared otherwise rewrites every table, event contract and push address.

```csharp
// Core/Auth/ICurrentUser.cs
namespace <App>.Core.Auth;

// If modules need more claims, add them to this interface in Core (R20 allows infrastructure, §4.6) rather than reading HttpContext in a module, and keep CurrentUser below in step.
public interface ICurrentUser
{
    // The person acting.
    Guid? UserId { get; }

    // Who owns the data: queries filter on it, and owned rows, durable events and push groups carry it.
    Guid? OwnerId { get; }
}
```

```csharp
// Core/Auth/AuthClaims.cs
namespace <App>.Core.Auth;

// In Core because Auth's token issuer, the Host's policies and the hub all read them, and the Host may not import Auth (R6, R27).
public static class AuthClaims
{
    // Our token issuer writes this claim, or a claims transformation does for an external IdP (§4.6); it holds the user id when the owner is the user.
    public const string Owner = "owner";

    public const string PasswordChangeRequired = "password_change_required";
}

public static class AuthPolicies
{
    public const string PasswordChange = "PasswordChange";
}
```

```csharp
// Core/Auth/CurrentUser.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace <App>.Core.Auth;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public Guid? UserId => ReadGuid(ClaimTypes.NameIdentifier);

    public Guid? OwnerId => ReadGuid(AuthClaims.Owner);

    private Guid? ReadGuid(string claimType) =>
        Guid.TryParse(httpContextAccessor.HttpContext?.User.FindFirstValue(claimType), out var id) ? id : null;
}
```

### 4.5 JWT validation extension (the default reference implementation)

`Core` ships **one** `AddAuth(...)`-style extension that the Host calls. The
implementor picks what goes inside it (§4.6). The reference implementation
validates a bearer JWT (issuer/audience/lifetime/signing key, key ≥ 32 chars or
throw). **Regardless of which mechanism you choose,** keep the hook that
authenticates the realtime push connection from the `access_token` query
string for `/hubs/*` paths — WebSocket connections can't send an
`Authorization` header, so this principle holds for any push transport
(reference stack: SignalR's `OnMessageReceived`):

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

1. **`ICurrentUser.UserId`** resolves to a stable per-user `Guid` from the incoming request principal (e.g. the `sub`/`NameIdentifier` claim, or a claim you map to your user id), and **`ICurrentUser.OwnerId`** to the owner's `Guid` (the same value when the owner is the user, a tenant claim otherwise; §4.4). An external IdP does not issue the owner claim, so that option maps it in a claims transformation (reference stack: `IClaimsTransformation`), from the IdP's tenant or group claim, or from the user id in a per-user app; without it `OwnerId` is null and owned endpoints have no owner to filter on.
2. **`RequireAuthorization()`** on endpoints rejects unauthenticated requests.
3. **The realtime push connection** can authenticate on the socket (reference stack: SignalR's `access_token` query-string hook, §4.5) so each connection joins the push group of its `ICurrentUser.OwnerId`.

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

### 4.7 What else legitimately lives in Core

`Core` is the shared **infrastructure** kernel, not only the things above. As the app grows it gathers shared infrastructure most modules need, so R20 (no *business* service interfaces) still holds. Expect, and keep in `Core`:

- **Shared database wiring** — the connection name, the migrations-history table
  name, and the data-source / managed-identity setup as named constants + an
  extension the Host and modules call, so the persistence engine is configured in
  **one** place.
- **CHECK-constraint helpers** — the small builder that turns a `Roles` / `Status`
  constant set into a column CHECK predicate (the mechanism behind R28(a)).
- **Cross-cutting constants & value types** — paging caps + a `PagedResult<T>`
  (§13), shared sort options, health-check tag/name constants, and the
  integration-seam keys + mode values (§6.6).
- **Read-only infrastructure seams** — e.g. an `IDocumentContentSource` that hands
  a consumer the *bytes* of a blob another module owns **without** exposing that
  module's schema (R8). This is the line R20 draws: a **read-only infrastructure**
  accessor may live in `Core`; a **business** service interface (`IOrderService`,
  `IApprovalService`) may not — those needs go through events (R3).
- **Rules several modules must compute the same way.** When two modules show the same figure (how an account type signs its balance, say), the rule lives once in `Core` as a **pure function over shared contract types**: no state, no I/O and no interface, so it cannot grow into a service. A module that re-derives it from its own copy is how two screens come to disagree about the same number. A rule that needs one module's data or decision is not this; it stays in that module and travels by event (R3).
- **Background-work primitives** (R31): the queue a worker waits on and the registry it reports to. Concurrency limits (how many jobs run at once) are module policy and stay in the module.

```csharp
// Core/BackgroundWork/IBackgroundWorkQueue.cs
// A queue rather than a bare signal, so the worker is handed the work instead of searching a store for it.
public interface IBackgroundWorkQueue<TWork>
{
    ValueTask EnqueueAsync(TWork work, CancellationToken ct = default);

    // Waits between items and ends only on cancellation, so a worker never spins on an empty result.
    IAsyncEnumerable<TWork> DequeueAllAsync(CancellationToken ct);
}
```

Core also ships the standard implementation, `BackgroundWorkQueue<TWork>`: an unbounded in-process channel, unbounded because the producers are request handlers and a full bounded queue would make a request wait. A module wraps it in a named seam of its own (§6.10) rather than owning a channel, so every worker wakes the same way.

```csharp
// Core/Health/IWorkerStatus.cs
public enum WorkerKind { Loop, RunOnce }

public sealed record WorkerState(string Name, WorkerKind Kind, string Status, DateTimeOffset? LastActivityAt, string? LastError);

// Health reads what each worker last said, because a worker woken by a signal is rightly quiet for hours.
public interface IWorkerStatus
{
    // Called before anything that can fail, so a worker that dies early is still listed.
    void Started(string worker, WorkerKind kind);

    // A loop calls these after a good pass, after a bad one, and when it exits for any reason.
    void Iterated(string worker);
    void Failed(string worker, Exception ex);
    void Stopped(string worker);

    // A run-once worker calls this after its one good pass, or Failed after a bad one.
    void Completed(string worker);

    IReadOnlyList<WorkerState> Snapshot();
}
```

A loop is down when it last reported Stopped or Failed (until its next good pass); a run-once worker is down only when it reported Failed, and Completed stays healthy for good. The registry is an in-memory singleton, so it describes this process only. Name each worker `<Module>.<Worker>` so a console can show it against its module (§7.4).

If several modules would otherwise duplicate the same infrastructure literal or
wiring, its home is `Core` (R29). If only one module needs it, it stays in that
module (§13 "right home").

### 4.8 Transactional outbox: how a data-changing event survives a failure

The outbox saves an event **in the same database transaction as the change it describes**, so both commit or neither does, and then delivers it to each subscriber until the subscriber succeeds or a person decides what to do with it. It is the default for every event that changes another module's stored data (R15). It is Core infrastructure, not a broker: it lives in the app's one database and runs in process, so R12 still holds.

**Storage.** Core owns an `outbox` schema with its own data context and migrations: a message row per event (its stored type name, its payload, its owner id and a sequence number) and a delivery row per durable subscriber per message (state, attempts, next due time). The Host migrates the outbox context **first, and by name**, before the module contexts, because every module context maps those tables in order to write them but leaves them out of its own migrations; a migration loop that only picks up `<App>.Modules.*` contexts skips it. Writing outbox rows through a module's own context is the one sanctioned write outside its schema: it is infrastructure, like the bus, and it is what lets the event commit with the change. Each consuming module keeps an `inbox` table in its own schema. Reference stack: the outbox context is `OutboxDbContext` in `<App>.Core.Outbox`; a module context maps the outbox tables with `modelBuilder.AddOutbox()` and its inbox with `modelBuilder.AddInbox()`, and registers the save interceptors with `AddOutboxInterceptors(sp)` on its options, passing the service provider `AddDbContext` hands its options callback. Because `AddOutbox()` changes every module's model, adding it means a migration in every module, even an empty one.

**Registering.** The Host registers the bus and the outbox with one Core extension, `Add<App>Events()`, before any module registers its services (§5). It registers **one** bus instance as both `IEventBus` and `IDurableEventSubscriptions`, so a durable subscription and a plain one land on the same bus, plus the outbox context, the outbox writer, the save interceptors, the dispatcher and the background pass. Registering the bus on its own leaves the outbox context and the durable subscriptions unresolvable, and the Host fails at startup.

**Seams.** Beyond `AddEvent` and the mapping extensions on their own context, modules reach the outbox only through these Core interfaces (R20):

- **`IDurableEventSubscriptions`** registers a durable subscriber (Subscribing, below).
- **`IOutboxWriter`** saves an event for code with no data context of its own, and saves a superseding event (Superseding, below).
- **`IOutboxAdmin`** lists one owner's parked deliveries and retries or skips them, for the screen where someone allowed to sees them (Delivering, below).
- **`IOutboxInspector`** shows an operator console (§7.4) every owner's lanes and parked deliveries, and lets an operator retry or skip any of them.

**Producing.** Add the event to the context **before** the save that commits the change; a save interceptor writes the message and its deliveries in that same transaction. This holds whether an endpoint, a job or a handler continuing a chain makes the change. Code with no data context of its own saves through a Core outbox writer.

```csharp
db.<Things>.Add(thing);
db.AddEvent(new <Thing>Created(thing.Id, ownerId, thing.Name, now));
await db.SaveChangesAsync(ct);
```

**Subscribing.** A durable subscriber registers under a stable name, with the context it writes through:

```csharp
// Core/Events/IDurableEventSubscriptions.cs
public interface IDurableEventSubscriptions
{
    // The subscriber name ("<Module>.<Event>") is stored on every delivery and inbox row, so renaming it strands that subscriber's open rows.
    void Subscribe<TEvent, TDbContext>(
        string subscriber,
        Func<TDbContext, TEvent, IServiceProvider, CancellationToken, Task> handler)
        where TEvent : IOwnedEvent
        where TDbContext : DbContext;

    // Every registered subscriber name, so a structural test can check who handles erasure (§6.7).
    IReadOnlyCollection<string> Subscribers { get; }
}
```

The outbox opens one transaction on that context, inserts the inbox row (message, subscriber), runs the handler, marks the delivery delivered and commits once, so a repeated delivery finds its inbox row and is skipped. The handler writes **only through the context it is handed**; anything else commits outside that transaction and is applied twice on a retry.

**Delivering.** Straight after the commit, inside the request, so the normal case is as quick as a direct publish. A failed delivery gets a due time on a backoff schedule, and a background pass retries it, woken by a signal and by a one-shot timer set to the earliest stored due time (a genuine schedule under R31, not polling). After a bounded time (about an hour rides out a restart or a deploy and still surfaces a real bug the same hour) the delivery **parks**: it stops retrying, it is logged, and it **shows in the UI**, where someone allowed to can retry or skip it. Delivered rows are pruned on a schedule.

**Plain bus subscribers get the event too.** A subscriber registered with `IEventBus.Subscribe`, such as a push relay (§7.1), also receives an event saved through the outbox, once the transaction commits. One delivery row stands for all of an event's plain subscribers; whichever path claims it first (the request, or the background pass if the request died first) runs them with the bus's bounded retries, and nothing retries or parks them after that. So they get it at most once, which suits a push and nothing that stores data.

**Ordering.** Events are keyed by owner, and each owner's events apply in the order they committed:

- A message is numbered **under a per-owner transaction lock** held until the commit, because a sequence drawn by two concurrent transactions does not give commit order. The save interceptor runs before the data layer opens its own transaction, so when none is open it begins one and only then takes the lock; otherwise the lock would be released before the insert commits. The lock key is a 64-bit value taken from the owner id (reference stack: `pg_advisory_xact_lock` takes a `bigint`), a save holding events for several owners takes their locks in ascending key order to avoid deadlocks, and the numbers are drawn from **one** shared database sequence after the locks are held, not from a per-owner counter.
- Each consuming module's deliveries for one owner form a **lane**, and a later delivery **waits behind an earlier open or parked one** in its lane, so an older balance never overwrites a newer one. The cost is deliberate: a parked delivery holds back that module's later deliveries for that owner until someone retries or skips it.

**Superseding.** A destructive whole-owner event is saved by a call that **skips every earlier open delivery for that owner in the same transaction**, so no queued retry can write the cleared data back. There are two such events, because Auth treats them differently: `OwnerDataClearRequested` clears the owner's data and keeps its identity (Auth keeps the accounts, so people can still sign in), and `OwnerDeleted` removes everything, Auth's accounts included. `Auth` saves `OwnerDeleted` when it deletes a tenant, and whichever module offers the clear saves `OwnerDataClearRequested`, through the outbox writer when it has no data context of its own (a stateless settings module, say). **Every module that owns a schema subscribes to `OwnerDeleted`, and every one except Auth to `OwnerDataClearRequested`** (§6.7 has the exemptions), and an integration test checks that each one is empty for that owner afterwards; a module that forgot to subscribe otherwise keeps personal data with no error. A delivery transaction first locks its own delivery row and checks it is still pending, before it writes the inbox row or runs the handler, so the skip waits for a delivery already running instead of passing it by and letting it commit stale data afterwards.

**Retiring a subscriber.** Open deliveries for a subscriber that no longer exists retry, park and stay parked. So the release that removes a durable subscriber also marks every open (pending or parked) delivery under its name Skipped, in a migration that runs before the app serves (reference stack: the retiring module's teardown migration updates the outbox delivery table by subscriber name, the same sanctioned write outside its schema as `AddEvent`). §6.9 relies on this.

**Stored names are a schema.** An event's type name, its payload field names and each subscriber name are stored on open rows, so renaming any of them strands or parks those rows. A rename ships a migration that rewrites the open outbox rows.

### 4.9 A read model that missed history is rebuilt through events

The outbox delivers what happens from now on; it never replays history to a new subscriber. So a module added after the data exists, a new read-model column, or a read model found to be wrong starts empty or stays wrong until it is rebuilt. The rebuild goes **through events**, never through the owning module's schema (R8):

1. **The consumer asks.** It publishes a replay request for one owner with `PublishAsync`, on demand (a rescan action) and at startup when it may have missed history. Replay traffic is safe to lose, because step 3 notices when it was.
2. **The owning module answers from its own schema** with snapshot events, then a **receipt** saying how much it sent. When a rebuild needs several owning modules, state the order of the requests (parents before children), because each answer attaches to rows the one before created.
3. **The consumer applies snapshots as idempotent upserts** (they arrive without an inbox row) and **checks the receipt before trusting the result**. Until it matches, the read model reports itself unready (reference stack: a 503) rather than serving a short answer.

Three races, each found as a defect in a real app:

- **Observe before reading.** The owning module takes the snapshot's observed-at time *before* it reads, so a snapshot never claims to be newer than the data it holds.
- **Live wins.** A live event stamps the read-model row with the time of its decision, and a snapshot older than that stamp leaves the row alone, so a replay never overwrites a newer live change. A timestamp leaves one window: a live change decided before the snapshot's observed-at time but committed after its read looks older than the snapshot, so the snapshot writes back the value from before that change. Where that matters, compare by the outbox sequence the snapshot's read transaction saw for the owner instead of by time.
- **Children can arrive first.** An event about a child can land before its parent's. Write a **stub** row (the child's fields set, the parent's null, a CHECK constraint holding that shape) that the parent's event completes, and count nothing from a stub.

A count in the receipt proves rows arrived, not that they are current: a dropped update to an existing row is invisible to it. Where that matters, compare a per-row version or recency stamp as well.
