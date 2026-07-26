> **Modular Monolith Blueprint — §7.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

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

2. **`Notifications`** (stateless, no DB) — the bus→push translator for the
   transport chosen in §3 (reference stack: SignalR). Owns
   `Hubs/NotificationHub.cs` (empty hub subclass) and the per-user connection
   mapping (reference stack: a custom `IUserIdProvider` reading the JWT `sub`)
   so push user groups match `ICurrentUser.UserId`. Subscribes to push-worthy
   events and fans them out: domain event → subscriber (fresh scope) → scoped
   relay holding the push API (reference stack: `IHubContext<NotificationHub>`)
   → `Clients.User(userId.ToString()).SendAsync("<message>", payload, ct)`. Adding
   a new push is a ~10-line subscriber. **No other module touches the push
   transport (R22).**

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
