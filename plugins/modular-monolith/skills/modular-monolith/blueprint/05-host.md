> **Modular Monolith Blueprint — §5.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 5. Host — the composition root

`Program.cs` is the **composition root** of `<App>.Host` and carries **no business
logic**. It does exactly: *(optional admin-CLI branch, local-DB auth only)* →
build the web app → register infra singletons → discover & register modules →
migrate every module DbContext → map the hub → map module endpoints → SPA fallback
→ run. The Host may also own a **small number of cross-cutting infrastructure
endpoints** that belong to no single module (e.g. a platform health/diagnostics or
services-state panel) — keep those in their own Host files (e.g.
`Platform/PlatformEndpoints.cs`), **not** inline in `Program.cs`, and keep them
free of domain logic. Nothing else lives in the Host.

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

// Migrate every module DbContext (R10). Always the real provider — tests run it too (R32).
using (var scope = app.Services.CreateScope())
{
    var dbContextTypes = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return []; } })
        .Where(t => t.IsSubclassOf(typeof(DbContext)) && !t.IsAbstract
                 && t.Namespace?.StartsWith("<App>.Modules.") == true);

    foreach (var ctxType in dbContextTypes)
        if (scope.ServiceProvider.GetService(ctxType) is DbContext ctx)
            await ctx.Database.MigrateAsync();
}

foreach (var m in modules) m.MapEndpoints(app);                 // subscriptions wire here (R16)

app.MapFallbackToFile("index.html");                            // SPA fallback
app.Run();

public partial class Program;   // required for WebApplicationFactory<Program> (R24)
```

> **Production hardening lives here too.** The sample above is the dev-minimal
> shape; a real composition root also wires host-level **infrastructure** the
> blueprint doesn't spell out inline (none of it business logic): **fail-fast
> config guards** (refuse to start in Production on a wildcard `AllowedHosts`, or a
> missing/`localhost` SPA origin); a **transport size ceiling** (`Kestrel`
> `MaxRequestBodySize` + `FormOptions.MultipartBodyLengthLimit`) if you accept
> uploads; `.RequireAuthorization()` on the mapped hub; and — for a managed cloud
> database — a data source whose credential comes from the platform identity (e.g.
> an Entra-token password provider via `DefaultAzureCredential`), a no-op in dev.
> These are composition concerns, so they stay in the root.
