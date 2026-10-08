> **Modular Monolith Blueprint — §5.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 5. Host — the composition root

`Program.cs` is the **composition root** of `<App>.Host` and carries **no business logic**. It does exactly: *(optional admin-CLI branch, local-DB auth only)* → build the web app → register infra singletons → discover & register modules → the middleware pipeline → map the hub → migrate every module DbContext → map module endpoints → SPA fallback → run. The Host may also own a **small number of read-only infrastructure endpoints** that belong to no single module (e.g. a liveness or services-state panel): keep those in their own Host files (e.g. `Platform/PlatformEndpoints.cs`), **not** inline in `Program.cs`, and keep them free of domain logic. Once an operator console **stores, alerts or pushes**, it is the `Observability` module (§7.4), because the Host holds no schema and no push (R22). Nothing else lives in the Host.

> The admin-CLI branch below exists **only for the local-DB JWT option** (it provisions users into the `Auth` module). If you chose an external IdP (§4.6), delete every `admin` block, the `Auth` module's `AuthCli` and the `Auth` references with them, and replace `AddJwtAuth` with your IdP's validation wiring.

> **The admin CLI never falls through to the web server.** A verb it does not know, a typo included, prints the verbs and exits 1; a known verb with a missing argument throws; a command that fails exits 1. Otherwise `admin add-usr` boots the server and migrates production, and a script reads a failure as success. The Host only parses the arguments and calls the `Auth` module's CLI functions, which build a small host, migrate Auth's context through the module's own options and do the work (R6). The CLI builds no bus or outbox, so a command can change only Auth's own rows and cannot publish: it sets a new security stamp directly rather than through the rotate function (§7.2), and a change another module must see belongs behind an endpoint instead.

```csharp
using <App>.Core.Auth;
using <App>.Core.Logging;
using <App>.Core.Modules;
using <App>.Core.Outbox;
using <App>.Host.Platform;
using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

// --- Admin CLI: run a command and exit without starting the web server. ---
// Each parser returns false for another verb and throws with its usage line when an argument is missing.
if (AdminCliArgs.TryParseAddUser(args, out var email, out var password))
{
    Environment.ExitCode = await <App>.Modules.Auth.Cli.AuthCli.AddUserAsync(args, email, password) ? 0 : 1;
    return;
}

if (AdminCliArgs.TryParseSetPassword(args, out var resetEmail, out var newPassword))
{
    Environment.ExitCode = await <App>.Modules.Auth.Cli.AuthCli.SetPasswordAsync(args, resetEmail, newPassword) ? 0 : 1;
    return;
}

// Any other admin verb stops here, so a typo never starts the server and migrates the database.
if (args is ["admin", ..])
{
    await Console.Error.WriteLineAsync(AdminCliArgs.Help);
    Environment.ExitCode = 1;
    return;
}

// The bundler fingerprints every file under /assets, so a changed file always arrives under a new name and can be cached for good.
static void SetCacheHeaders(StaticFileResponseContext ctx) =>
    ctx.Context.Response.GetTypedHeaders().CacheControl =
        ctx.Context.Request.Path.StartsWithSegments("/assets")
            ? new CacheControlHeaderValue { Public = true, MaxAge = TimeSpan.FromDays(365), Extensions = { new NameValueHeaderValue("immutable") } }
            : new CacheControlHeaderValue { NoCache = true };

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();                                    // Aspire: OTel, health, resilience

// One bus serves as both IEventBus and IDurableEventSubscriptions, and the module contexts write through the outbox registered with it (R12, §4.8).
builder.Services.Add<App>Events();
builder.Services.AddHttpContextAccessor();
// R19: a singleton is safe because it reads each request through the accessor and holds no state.
builder.Services.AddSingleton<ICurrentUser, CurrentUser>();
builder.Services.AddJwtAuth(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddSignalR();
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Trust only the named proxies, or a client can pick its own address and so its own rate-limit key.
    // KnownIPNetworks is .NET 10; on .NET 8 and 9 clear KnownNetworks instead.
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
    foreach (var proxy in builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
        o.KnownProxies.Add(IPAddress.Parse(proxy));
});
// Login is limited per client address (§13.4).
builder.Services.Add<App>RateLimiting(builder.Configuration);
builder.Services.AddCors(opts => opts.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration["Cors:SpaOrigin"] ?? "http://localhost:3000")
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
// A Host class that writes the standard error envelope (§13) for an unhandled exception.
builder.Services.AddExceptionHandler<<App>ExceptionHandler>();

var modules = ModuleDiscovery.DiscoverModules();                 // R5
foreach (var m in modules) m.RegisterServices(builder.Services);

var app = builder.Build();

foreach (var m in modules) app.Logger.LogInformation("Discovered module: {Name}", m.Name);

// Outermost, so it catches a fault from any later step. The empty callback makes it use the registered handler; a bare UseExceptionHandler() also needs AddProblemDetails.
app.UseExceptionHandler(_ => { });
// Before anything that reads the client address, which is the proxy's until this runs.
app.UseForwardedHeaders();
app.MapDefaultEndpoints();
// Sets the headers as each response starts, because the exception handler clears headers set earlier when it rewrites a 500.
app.Use<App>SecurityHeaders();
// Before the SPA fallback, so a real file is served as itself, and with the cache rule above.
app.UseStaticFiles(new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });
app.UseCors();
app.UseAuthentication();
// Straight after authentication, the first point that knows who is acting (§13).
app.UseMiddleware<UserLogScopeMiddleware>();
app.UseAuthorization();
app.UseRateLimiter();

// The one place outside the admin CLI branch (R6) where Host references a module type. Closing on expiry stops a socket outliving the token that opened it.
app.MapHub<<App>.Modules.Notifications.Hubs.NotificationHub>("/hubs/notifications",
        o => o.CloseOnAuthenticationExpiration = true)
    .RequireAuthorization();

// Migrate every module DbContext (R10). Always the real provider — tests run it too (R32).
using (var scope = app.Services.CreateScope())
{
    // The outbox first and by name: module contexts write its tables but leave them out of their own migrations (§4.8).
    await scope.ServiceProvider.GetRequiredService<OutboxDbContext>().Database.MigrateAsync();

    var dbContextTypes = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return []; } })
        .Where(t => t.IsSubclassOf(typeof(DbContext)) && !t.IsAbstract
                 && t.Namespace?.StartsWith("<App>.Modules.") == true);

    foreach (var ctxType in dbContextTypes)
        if (scope.ServiceProvider.GetService(ctxType) is DbContext ctx)
            await ctx.Database.MigrateAsync();
}

foreach (var m in modules) m.MapEndpoints(app);                 // subscriptions wire here (R16)

// The same cache rule, so index.html is revalidated on every load and a release is seen at once.
app.MapFallbackToFile("index.html", new StaticFileOptions { OnPrepareResponse = SetCacheHeaders });
app.Run();

public partial class Program;   // required for WebApplicationFactory<Program> (R24)
```

The CLI functions live in the `Auth` module and share its context options, so the web host and the CLI cannot drift apart:

```csharp
// Modules.Auth/AuthModule.cs (excerpt)
// <UseProvider> is the chosen provider (§8).
internal static DbContextOptionsBuilder ConfigureDb(DbContextOptionsBuilder o, IConfiguration config) =>
    o.<UseProvider>(config.GetConnectionString("<app>") ?? throw new InvalidOperationException("Connection string '<app>' not found."),
        x => x.MigrationsHistoryTable("__EFMigrationsHistory", "auth"));

public void RegisterServices(IServiceCollection services)
{
    services.AddDbContext<AuthDbContext>((sp, o) =>
        ConfigureDb(o, sp.GetRequiredService<IConfiguration>()).AddOutboxInterceptors(sp));
    // Auth's other services follow.
}
```

```csharp
// Modules.Auth/Cli/AuthCli.cs
namespace <App>.Modules.Auth.Cli;

public static class AuthCli
{
    public static Task<bool> AddUserAsync(string[] args, string email, string password) =>
        RunAsync(args, db => UserProvisioning.AddUserAsync(db, email, password, Console.Out, Console.Error));

    public static Task<bool> SetPasswordAsync(string[] args, string email, string password) =>
        RunAsync(args, db => UserProvisioning.SetPasswordAsync(db, email, password, Console.Out, Console.Error));

    // The generic host rather than WebApplicationBuilder, so a command starts no web server.
    private static async Task<bool> RunAsync(string[] args, Func<AuthDbContext, Task<bool>> run)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            Args = args,
            ContentRootPath = AppContext.BaseDirectory,
            EnvironmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
                ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
                ?? Environments.Development
        });
        // No outbox interceptors, because the CLI builds no outbox and so its commands add no events.
        builder.Services.AddDbContext<AuthDbContext>(o => AuthModule.ConfigureDb(o, builder.Configuration));

        using var host = builder.Build();
        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
        await db.Database.MigrateAsync();
        return await run(db);
    }
}
```

> **Production hardening lives here too.** The sample above is the minimal shape; a real composition root also wires host-level **infrastructure** the blueprint doesn't spell out inline (none of it business logic): **fail-fast config guards** (refuse to start in Production on a wildcard `AllowedHosts`, a missing or `localhost` SPA origin, or any `Integrations:*` seam set to `Fake`, §6.6); a **transport size ceiling** (`Kestrel` `MaxRequestBodySize` + `FormOptions.MultipartBodyLengthLimit`) if you accept uploads; and, for a managed cloud database, a data source whose credential comes from the platform identity (e.g. an Entra-token password provider via `DefaultAzureCredential`), a no-op in dev. These are composition concerns, so they stay in the root.

> **Behind a reverse proxy, the client address is only as true as the proxy list.** Without `UseForwardedHeaders` every request appears to come from the proxy, so a limiter keyed on the client address puts every user in one bucket and one attacker locks everyone out. Trusting forwarded headers from any sender is the opposite failure: a client writes its own address and dodges the limit. Name the proxies in config, run the middleware before anything reads the address, and put `UseRateLimiter` after authentication so a policy can key on the user where that suits better. Clearing the lists removes their loopback defaults, so with no proxies configured nothing is trusted, a sidecar proxy that reaches the app over loopback included; name `IPAddress.Loopback` and `IPAddress.IPv6Loopback` in that case.

> **Security headers survive an error response only when they are set as the response starts.** The exception handler clears the response before it writes the error envelope, so headers a middleware set on the way in are gone from every 500. Register them with `OnStarting` instead, which runs just before the headers are sent, whatever wrote the response:

```csharp
// Host/Platform/SecurityHeaders.cs
public static WebApplication Use<App>SecurityHeaders(this WebApplication app)
{
    // HSTS can stay outside OnStarting, because a browser keeps the header from any earlier HTTPS response, so a 500 that loses it costs little.
    if (!app.Environment.IsDevelopment()) app.UseHsts();

    app.Use(async (context, next) =>
    {
        context.Response.OnStarting(static state =>
        {
            var headers = ((HttpContext)state).Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["Content-Security-Policy"] = "frame-ancestors 'none'";
            headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        }, context);
        await next();
    });
    return app;
}
```

> **Static files: hashed assets are cached for good, everything else is revalidated.** The bundler gives each built file a content hash in its name, so it can carry `immutable` and a year's `max-age`. `index.html` and anything else without a hash carries `no-cache`, both from `UseStaticFiles` and from the SPA fallback, or a browser keeps the old `index.html` after a release and asks for asset names that no longer exist. Service-worker caching is decided separately (§10).
