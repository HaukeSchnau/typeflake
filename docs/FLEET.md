# The fleet graph

A design sketch for describing a whole fleet in one TypeScript program. It starts from what infra
needs, not from how infra does it today. The current mechanisms (`lib/managed-hosts.nix`, port
literals, flake checks that pin other hosts' configurations) are what this replaces.

## What infra actually needs

Twelve wiring cases account for nearly all the cross-host configuration in `~/infra`:

1. Gitea on srv-1 calls Calder's webhook on srv-2 with an HMAC secret. The URL, port 18110, the
   secret and srv-1's allowlist for srv-2's address are written in four files.
2. Calder promotes releases to app-deployments on srv-1 and srv-2 (port 18100, a bearer token).
3. Repository Alchemy stacks place releases on srv-2 through its placement API (hostname, secrets,
   an HMAC token).
4. Calder dispatches jobs to agents on m1 and a Linux VM, with an agent token.
5. srv-2 publishes to srv-1's Nix cache over SSH. Every host substitutes from it, and the public keys
   are literals in several places.
6. Every host, m1 and Calder send metrics, logs and traces to srv-1 (8428, 9428, 14318, 3200). srv-2
   reads them back and must be allowed to.
7. Every Caddy virtual host, runtime route and host domain becomes a Cloudflare DNS record.
8. Remote builders: m1 for Apple, srv-2 and dev-hauke for Linux, each with SSH ports and host keys
   written inline.
9. Backups: every NixOS host to B2, m1 through srv-2 to a storage box. srv-1's alerts mirror a flag
   by hand.
10. A residential SOCKS proxy on srv-2:18080 with five consumers.
11. Studienbuch on srv-2 and its PostgreSQL; srv-1 monitors it.
12. dev-hauke rsyncs into srv-2's file share.

Underneath, there are five needs:

- **Endpoints.** Something listens on a host, at a port, for a protocol, reachable from somewhere:
  loopback, the tailnet, the internet. Port 3200 is written in seven places, 18080 in seven.
- **Connections.** A consumer needs the endpoint's address, and the endpoint's host must let exactly
  that consumer in, through the firewall, Caddy's `remote_ip`, Gitea's webhook allowlist. Today the
  two ends are written separately, and nothing notices when only one changes.
- **Names.** A domain routes to an endpoint through an ingress host, which needs a certificate and a
  DNS record. srv-1's domains are written twice and kept in step by a flake check.
- **Credentials with two ends.** A keypair whose public half goes into another host's
  `authorized_keys` or `trusted-public-keys`. A token both sides hold. A token from a provider, such as
  Cloudflare. Copies of `cloudflare/alchemy-env` are synced by hand.
- **Order and facts.** srv-1 deploys first because it serves the cache. Tailnet addresses and SSH
  host keys are facts about hosts, written by hand in up to four places each.

## Principles

1. **A reference is the binding.** A consumer gets an endpoint by holding the value, never by
   spelling its hostname and port. Whatever needs both ends happens because of the reference.
2. **Connecting writes both ends.** `connect` gives the consumer a URL and adds the allow rule on
   the server: firewall, proxy matcher, application allowlist. Remove the connection and both go.
3. **Each host renders on its own.** The fleet program computes every cross-host fact at render
   time and writes it into each host's Nix as a literal. No host's evaluation reads another host's
   configuration, which today makes evaluation slow and ties hosts together.
4. **State that must not move is pinned.** Allocated ports, fetched host keys and tailnet addresses
   go into `fleet.lock`. Adding a service never renumbers another. infra's releases are numbered by
   their position in a sorted list today, so adding one shifts every port after it.
5. **Types per host.** A host value carries the option types of its own probe, so a module written
   for srv-2 is checked against srv-2's options and secrets, not the first NixOS host's. That also
   lifts today's limit of one `Register` type per module class.

## Sketch

```ts
// fleet.ts
import { Fleet, Host, Http, Secret, Tailnet } from "typeflake/fleet";

export default Fleet.make("schnau", function* () {
  const tailnet = yield* Tailnet.make({ zone: "schnau.dev" }); // addresses come from the Tailscale API, pinned

  const srv1 = yield* Host.nixos("srv-1", { tailnet, configuration: "nixosConfigurations.srv-1" });
  const srv2 = yield* Host.nixos("srv-2", { tailnet, public: { ipv4: "37.120.187.196" } });
  const m1 = yield* Host.darwin("m1", { tailnet });

  // An endpoint is a value; its port comes from fleet.lock unless given.
  const tempo = yield* Http.endpoint(srv1, "tempo", { reach: "tailnet", port: 3200 });

  // Connecting returns the address for the consumer and lets srv-2 in on srv-1.
  const calder = yield* srv2.module("calder", function* () {
    const traces = yield* Http.connect(tempo);
    return define({ services: { calder: { telemetry: { tempo: traces.url } } } });
  });

  // A shared secret: one generated value, delivered to both hosts by sops.
  const webhook = yield* Secret.shared("calder/webhook-secret", { to: [srv1, srv2] });
  const hooks = yield* Http.endpoint(srv2, "calder-hooks", { reach: "tailnet" });
  yield* srv1.module("gitea-webhook", function* () {
    const target = yield* Http.connect(hooks);
    return define({
      services: { gitea: { settings: { webhook: { ALLOWED_HOST_LIST: target.allowList } } } },
    });
  });

  // A keypair: the private half on the publisher, the public half where the cache trusts it.
  const publisher = yield* Secret.keypair("nix-cache/publish", { on: srv2 });
  const cache = yield* NixCache.server(srv1, { domain: "nix.schnau.dev", publishers: [publisher] });
  for (const host of [srv1, srv2, m1]) yield* NixCache.substitute(host, cache);

  // A route: Caddy on the ingress host, a certificate, and a DNS record through Alchemy.
  yield* Http.route("calder.schnau.dev", hooks, { via: srv2, visibility: "public" });
});
```

What renders:

- `hosts/<host>/fleet.nix` for each host: its endpoints' firewall openings and proxy matchers, its
  connections' addresses, the public keys it trusts and the known_hosts entries it needs, all as
  literals. The host's configuration imports it like any module.
- The sops entries each host gets, checked against the secrets provider.
- An Alchemy stack for DNS records and other cloud resources, from the routes.
- A deploy order: a host serving the cache or an endpoint that others need at activation goes first.

What the types check:

- **Protocol.** `Http.connect` takes an `Endpoint<"http">`; an OTLP exporter wants an
  `Endpoint<"otlp-http">`, so pointing it at Tempo's query port fails.
- **Reach.** A tailnet endpoint has no address a public consumer can hold.
- **Host.** `srv2.module` is typed by srv-2's probe, its sops keys and its packages.

What the render checks, naming both sides: two endpoints on one port of one host, a range overlap,
a route whose domain no certificate covers, a secret a host is given but that its file lacks.

## How it fits Typeflake's modules

The fleet is a layer over modules, not a replacement. `NixOS.module` stays for modules that need no
other host. A host's `module(name, body)` is a module whose generator can yield fleet operations
(`connect`, `endpoint`, secrets), which run when the fleet renders. That is the Effect `R` channel
the design notes already reserve for render-time services.

## Open questions

- **Alchemy or our own state.** Alchemy already has resources, state, plans and Cloudflare. Making
  the fleet an Alchemy stack, with hosts as resources, gives `plan` and DNS for free, and fits how
  repositories deploy today. The cost is that rendering Nix would depend on Alchemy's state. The
  alternative is `fleet.lock` for allocations and facts, and Alchemy only for cloud resources. I lean
  towards the second: Nix rendering stays offline and reproducible.
- **Where host types come from.** Per-host types need one probe per host (about 11 s for srv-2).
  `typeflake types` could probe hosts in parallel and skip ones whose lock and modules didn't change.
- **The project system.** project.nix and placements describe the same endpoints, secrets and
  databases. Whether a project becomes a fleet resource (`Project.release(srv2, studienbuch)`) or
  keeps its own contract decides how much of nix-infra-modules this replaces.
- **Facts from outside.** The Tailscale API for addresses, `ssh-keyscan` for host keys, B2 for
  buckets. Each would be a provider that pins its result, refreshed explicitly.

## First steps

1. `Host` and `Endpoint` with `fleet.lock`, rendering `fleet.nix` per host. Port observability
   (case 6) onto it: it has the most duplicated literals and a read-back that needs both ends.
2. `Secret.keypair` and `Secret.shared`, with the Nix cache (case 5) and the Calder webhook (case 1).
3. Routes with the DNS stack (case 7), replacing `web.names` and the ownership check.
4. Per-host types.
