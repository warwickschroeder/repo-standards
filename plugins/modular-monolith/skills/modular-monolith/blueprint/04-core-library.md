> **Modular Monolith Blueprint — §4.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 4. Core Library — the framework everyone shares

`<App>.Core` is the only project modules reference. It contains the module
contract, the event bus, the auth infrastructure, and the **shared event
contracts** — and, as the app grows, the other **cross-cutting infrastructure**
every (or most) modules lean on (§4.7). It must contain **no business logic and
no business service interfaces** (R20).

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
                    // Give up LOUDLY — never silently. The read model this handler builds may now be
                    // stale until a reconciliation/outbox replay (see the durability note below).
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

> **Known limitation — read-model durability (the scaling boundary).** The bus is
> **in-process and at-most-once-with-retry**: `PublishAsync` runs *after* the
> producer has already committed its own write, so a handler that exhausts its
> retries (a **persistent** fault, not a transient one) leaves the consumer's
> local read model **permanently out of sync**, with no recovery path. Retry
> absorbs the transient case; it does **not** close the persistent one. This is
> acceptable while the app is single-host and read models are reconstructable, but
> it is the recognised boundary of this design. When you outgrow it the fix is a
> **transactional outbox** — persist events in the *producer's* transaction and
> have a background relay dispatch them with retry + dead-letter — **not** a
> cross-module reconciliation (that would need a module to read another's schema,
> breaking R3/R8). Treat "a dropped event silently desyncs a read model" as a bug
> to design against, not a surprise.

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

// UserId is the minimum seam. If modules need a few more claims, extend THIS interface in
// Core — infrastructure, R20-permitted (§4.6) — rather than reading HttpContext from a
// module, and keep CurrentUser (below) in step. (This app adds Role and Email.)
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

1. **`ICurrentUser.UserId`** resolves to a stable per-user `Guid` from the
   incoming request principal (e.g. the `sub`/`NameIdentifier` claim, or a claim
   you map to your user id).
2. **`RequireAuthorization()`** on endpoints rejects unauthenticated requests.
3. **The realtime push connection** can authenticate on the socket (reference
   stack: SignalR's `access_token` query-string hook, §4.5) so per-user push
   groups line up with `ICurrentUser.UserId`.

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

`Core` is the shared **infrastructure** kernel, not only the four things above. As
the app grows it accretes cross-cutting homes most modules need — all still
infrastructure, so R20 (no *business* service interfaces) holds. Expect, and keep
in `Core`:

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

If several modules would otherwise duplicate the same infrastructure literal or
wiring, its home is `Core` (R29). If only one module needs it, it stays in that
module (§13 "right home").
