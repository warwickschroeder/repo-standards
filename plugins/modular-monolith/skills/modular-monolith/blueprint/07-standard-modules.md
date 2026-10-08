> **Modular Monolith Blueprint — §7.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 7. The standard module set

Every app on this blueprint starts with these foundational modules (the `Auth`
module is included **only** if you own the credential store — §4.6). Add domain
modules beyond them.

1. **`Auth`** (`auth` schema): **optional; present only if you own the credential store** (local-DB JWT, §4.6). When present: `POST /api/auth/login` → signed JWT (`sub` = user id) carrying the owner claim (§4.4) and the user's **security stamp**; an expiry (e.g. 7 days) bounds a stolen token, but it is the stamp check (§7.2) that ends a sign-in early. Argon2id password hashing; **no public registration endpoint**, users are provisioned via the admin CLI (`<App>.Host admin add-user <email> <password>`), and a forgotten password is reset there too (§7.3). Publishes the revocation event (§7.2), saves `OwnerDeleted` when it deletes a tenant (§4.8), and publishes nothing else by default. **With an external IdP (OpenID Connect / Azure Entra ID), omit this module entirely**: identity lives in the IdP and the only auth code is the validation wiring in `Core` (§4.5/4.6).

2. **`Notifications`** (stateless, no DB): the bus→push translator for the transport chosen in §3 (reference stack: SignalR). Owns `Hubs/NotificationHub.cs`, which joins every connection to its **owner's group** in `OnConnectedAsync`, from the token's owner claim (§4.4, §7.1). Pushes go to that group (reference stack: `Clients.Group(...)`), so every member of a tenant sees a change, not only the person who made it; in a per-user app the owner is the user and the group holds that user's own connections, so the same code serves both. Pushing with `Clients.User` to a tenant's data refreshes only the person who acted and leaves every other member's screen stale with no error. Subscribes to push-worthy events and fans them out: domain event → subscriber (fresh scope) → scoped relay holding the push API (reference stack: `IHubContext<NotificationHub>`) → `SendAsync("<message>", payload, ct)` to the owner's group. It also closes a user's open connections when Auth revokes their sign-ins (§7.2). Adding a new push is a ~10-line subscriber. **No other module touches the push transport (R22).**

3. **At least one read-model consumer** — the canonical embodiment of R3: holds
   **local mirrors** of data owned elsewhere, built purely from subscribed events,
   and **never** queries the producer's schema. This can be a dedicated module
   (e.g. a `Dashboard` serving read-only aggregates) **or** — more often in
   practice — the read-model living *inside* whichever module needs it (a search
   index fed by translation events, a roles mirror a notifier uses to resolve
   recipients, a usage ledger fed by consumption events). The pattern is "mirror
   via events + local read model", not "one folder called read-model".

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
        await hub.Clients.Group(PushGroups.Owner(e.OwnerId))
            .SendAsync("<message-name>", new { e.ThingId, e.Status }, ct);
}
```

```csharp
// Modules.Notifications/Hubs/NotificationHub.cs
using <App>.Core.Auth;
using <App>.Modules.Notifications.Services;
using Microsoft.AspNetCore.SignalR;
namespace <App>.Modules.Notifications.Hubs;

public sealed class NotificationHub(HubConnectionRegistry connections) : Hub
{
    // The claims are only available on the connection, so the hub picks the push group once, here.
    public override async Task OnConnectedAsync()
    {
        var owner = Guid.TryParse(Context.User?.FindFirst(AuthClaims.Owner)?.Value, out var id) ? id
            : throw new InvalidOperationException("A hub connection was authorised without an owner claim.");
        // Registered after the check, because a connection that fails it never reaches OnDisconnectedAsync to be removed.
        connections.Add(Context);
        await Groups.AddToGroupAsync(Context.ConnectionId, PushGroups.Owner(owner));
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        connections.Remove(Context);
        return base.OnDisconnectedAsync(exception);
    }
}
```

`PushGroups.Owner` names the group in one place, so the hub and every relay agree on it. `HubConnectionRegistry` is a singleton map from each user id to that user's open connection contexts, kept so a revocation can close them (§7.2). The hub holds no other state and no business logic.

Notifications subscribes with `IEventBus.Subscribe` for every push, whichever way the event travels: a direct publish reaches the relay at once, and an event saved through the outbox reaches it once the change commits (§4.8). Either way it arrives at most once, which is all a push needs: a lost one leaves a screen stale until the next push or reload and loses no data.

### 7.2 A security stamp ends sign-ins before the token expires

A signed token stays valid until it expires. On expiry alone, a disabled user, a changed password or a demoted admin keeps full access until then, and an open push connection keeps receiving after its token has run out. When `Auth` is present, four pieces close that:

- **A security stamp per user.** Each user row holds a random stamp, and every token Auth issues carries it as a claim.
- **The stamp is checked on every request, through a short cache.** Auth chains the check onto the token-validated hook and fails the request when the user is gone, disabled or holds a different stamp, so Core's auth extension (§4.5) never learns about Auth. Reference stack: `PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, ...)` keeps the existing `Events.OnTokenValidated`, then sets a new one that awaits it and checks the stamp. Name the scheme: the overload without a name configures options the bearer handler never reads, so the check silently never runs. `Events` must already exist, as §4.5's extension sets it. An integration test proves a token carrying an old stamp gets 401, because a check that never runs fails no other test. A cache of a few seconds keeps it to one read per user per window, and its length is the longest a revoked token keeps working.
- **One rotate function is the only way to end sign-ins.** It saves a new stamp, then evicts that user's cache entry (after the save, so a request already in flight that re-caches the old stamp keeps it for one cache window at most), then publishes `UserAccessRevoked(UserId)`, a shared contract (R14), with `PublishAsync` (R15): losing it only leaves the user's open sockets up until their token expires, since the stamp check already refuses their requests. Disabling or removing a user, setting a password and changing a role all call it; nothing sets a stamp by hand except the admin CLI, which has no bus to publish on (§5).
- **Notifications closes the user's open connections** when it sees that event, and the Host maps the hub with `CloseOnAuthenticationExpiration` (§5), so a connection also ends when its token expires.

```csharp
// Modules.Notifications/Services/UserAccessRevokedRelay.cs
// A connection is authorised once, when it opens, so a revoked user's open sockets are closed here.
public sealed class UserAccessRevokedRelay(HubConnectionRegistry connections)
{
    public Task HandleAsync(UserAccessRevoked e, CancellationToken ct)
    {
        connections.AbortAll(e.UserId);
        return Task.CompletedTask;
    }
}
```

With an external IdP, revocation belongs to the IdP (short-lived access tokens, refresh revoked there), but the hub mapping still closes on expiry.

### 7.3 A forgotten password and an admin-set one both have a way out

When `Auth` is present, two pieces stop a password problem from needing someone to hand-write a hash:

- **An operator reset verb.** `<App>.Host admin set-password <email> <password>` saves a new hash and a new stamp, so requests on the user's old tokens are refused within one cache window (§7.2). The CLI cannot publish, so their open push connections last until they reconnect or their token expires (§5). Both CLI verbs set an ordinary password, not a temporary one, and `set-password` clears any temporary flag, because whoever runs the CLI already holds the server and its database, so a forced change would hide the password from no one.
- **A temporary password opens nothing but the password change.** A password someone sets for another person (a new member, a reset by an admin) is stored as temporary, with an expiry after which login refuses it, so it does not stay known to the admin who set it. A token issued on it carries a `password_change_required` claim and no role claims, and the **default authorization policy refuses that claim**, so the token reaches the endpoints that name a password-change policy (changing the password and reading the signed-in user) and none that rely on the default. A named policy replaces the default rather than adding to it, so a named policy that checks neither this claim nor a role lets the token through, while a group's bare `RequireAuthorization()` adds the default and refuses it. Change the default policy rather than adding a check to each endpoint, so a new endpoint refuses the token without anyone remembering to. The claim and policy names are `AuthClaims` and `AuthPolicies` in `<App>.Core.Auth` (§4.4), so the Host names them without importing Auth (R6). The Host registers it in place of §5's bare `AddAuthorization()`:

```csharp
builder.Services.AddAuthorization(o =>
{
    // Every endpoint that relies on the default policy refuses a temporary-password token.
    o.DefaultPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireAssertion(c => !c.User.HasClaim(AuthClaims.PasswordChangeRequired, "true"))
        .Build();
    o.AddPolicy(AuthPolicies.PasswordChange, p => p.RequireAuthenticatedUser());
});
```

Choosing a new password clears the temporary flag and rotates the stamp (§7.2), so the restricted token stops working and the user signs in again.

### 7.4 An operator console is a module once it stores or alerts

A read-only health panel can sit in the Host (§5). Once the console **stores** anything, **alerts** anyone or **pushes** to admins, it is an optional standard `Observability` module with its own schema, because the Host holds no schema and no push (R22). Its usual shape:

- **Captured warnings and errors in its own schema, pruned on a schedule** (a fixed retention such as 14 days; a daily prune is a genuine schedule under R31). A logger provider writes Warning and above into a bounded in-process queue that one worker drains, so logging never waits on the database. What may be logged at those levels is §13's rule, because everything stored here is shown to admins.
- **Health from what each part last reported.** It reads a health check per module context (can it connect, are its migrations applied), the worker-status registry (§4.7) and the outbox's lanes and parked deliveries through the Core inspector seam (§4.8), never another module's schema (R8). A worker is down only by what it reported (R31).
- **Alerts go to an admins push group.** A health monitor and an error alert publish events that Notifications relays (R22) to an admins group. The §7.1 hub joins only owner groups until this module exists; then it also joins a connection to the admins group when its token carries a system-admin claim, a constant beside the others in `AuthClaims` (§4.4). The monitor wakes on a one-shot timer and on a parked delivery, not by polling.
- **It is declared on §6.7's erasure exemption list**, because its rows expire on their own: an erased owner's captured entries age out with the retention window rather than being deleted by a subscriber.
- **It is off in other modules' test hosts.** Its monitor and log writer open connections of their own, so the shared test-host defaults switch them off and only its own suite turns them on (§12.3).

### 7.5 A module that reads across every other one goes through the app's own API

An assistant, a search across the whole app or an export needs most modules' data. A read model of all of it would copy half the app and could disagree with the screens, and reading the schemas breaks R8. R3's one exception covers it, on four conditions: it **stores nothing**, **never writes**, reads **only through the app's own HTTP API as the calling user** (it forwards that request's `Authorization` header, so it sees exactly that owner's data and every endpoint's own checks apply), and is **recorded as a deliberate deviation** in `docs/ROADMAP.md`. A module that stores anything subscribes and keeps a read model like any other. Calling the app over loopback has five traps:

- **The listening address exists only after the server binds.** Read it on first use from the server's own address list (reference stack: `IServerAddressesFeature` on `IServer`), never at registration, when it is still empty.
- **A wildcard binding is not an address you can call.** Rewrite `+`, `*`, `0.0.0.0` or `[::]` to `localhost`, and prefer the plain http binding where both are bound.
- **Host filtering refuses `localhost` unless it is listed.** Production names explicit hosts (§5), so add `localhost` to that list or every inner call is refused (reference stack: `AllowedHosts`).
- **Inner calls are ordinary requests.** They pass authentication, the stamp check (§7.2) and any rate limiter, all from the loopback address, so a limiter keyed on client address puts every inner call in one bucket. A refused inner call surfaces its status and the server's error to the caller, never an empty answer.
- **The test host has no socket.** The in-memory test server binds no address, so the server's address list is empty and the first trap's lookup finds nothing; the test host points the aggregator's HTTP client at the test server instead (reference stack: under `WebApplicationFactory`, the `TestServer`'s `CreateHandler()` as the primary handler and its `BaseAddress` as the base address).
