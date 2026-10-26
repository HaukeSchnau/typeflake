# Vision

Typeflake shouldn't be Nix written with different punctuation. TypeScript gives us three things Nix
lacks, and each part of this plan uses at least one of them:

- **Knowing at edit time.** Nix finds a mistake when it evaluates the whole configuration, often on
  the machine being deployed. `tsc` finds it while you type, in about two seconds.
- **Typed values across boundaries.** Between hosts, between a configuration and the programs it
  runs, and between a flake and the cloud, Nix passes strings: hostnames, ports, secret names. A
  TypeScript value can carry its type across.
- **A real program at render time.** A module's generator can yield Effects, so rendering can read
  files, ask APIs and check the whole fleet before it writes a line of Nix.

The probe already turns a configuration's option graph into types. That generalizes: anything with
a schema at the edge of a configuration can become a type, the way F# type providers turn a database
into types. On top of that sits a typed graph of the fleet, where connecting two things writes the
configuration on both ends.

Rule 1 holds throughout: everything renders to plain Nix that builds without Typeflake.

## 1. Type providers

A provider reads something during the probe's `nix eval`, may look further (the binary cache, a
file, an API), and declares types. `src/Provider.ts` defines them. They write
`.typeflake/providers.ts` and `.typeflake/files/`.

| Provider         | Source                                                                                   | What fails in the editor                                                                | State                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Packages         | `builtins.attrNames pkgs`                                                                | `pkgs.ripgerp`                                                                          | Done                                                                        |
| Binaries         | store or `nix store ls` on cache.nixos.org, for packages the project uses                | `exe(pkgs.ripgrep, "rgg")`                                                              | Done                                                                        |
| Secrets          | the keys of sops-nix's YAML and JSON files, which sops leaves readable                   | `sops.secrets."api-kye"`                                                                | Done                                                                        |
| Files            | `builtins.functionArgs` of each `.nix` file a module imports                             | `pkgs.callPackage(site, { writeTextDri })`, a package in `imports`                      | Done                                                                        |
| Renamed options  | nixpkgs' hidden aliases, described "Alias of {option}\`new.path\`"                       | Nothing fails; the editor strikes them through and `typeflake bump --fix` rewrites them | Done                                                                        |
| Deprecated types | `type.deprecationMessage`                                                                | `@deprecated` on the option                                                             | Done                                                                        |
| Settings schemas | upstream JSON Schemas (SchemaStore and others) for freeform `settings`                   | `programs.starship.settings.charcter`                                                   | Next. It needs a registry mapping options to schemas, like DefinitelyTyped. |
| Evaluated values | `nix eval` of other hosts' option values, as literal types                               | Referring to a port another host doesn't open                                           | With the fleet graph                                                        |
| Live data        | GitHub keys, Tailscale devices, DNS zones, read at render time and pinned in a lock file | A user without keys, a host not on the tailnet                                          | With the fleet graph                                                        |

Providers type what modules reference, not everything: the binaries provider lists the programs of
the packages a project's Nix mentions. Looking up all 28,000 packages would take minutes.

## 2. Changes become type errors

- `typeflake bump` updates the flake's inputs into a separate lock file, probes against it, and
  typechecks every module against the types the update brings. It reports the errors that are new
  and the renamed options in use. `--fix` rewrites renamed options whose last name is all that
  changed, and `--apply` keeps the update when nothing breaks. Done.
- Tests: evaluate a host from vitest and assert on its configuration, or snapshot its `drvPath` so a
  refactor proves it changes nothing. Next.
- `typeflake plan <host>`: a diff in options, not derivations. "Opens 443, adds user alice, new
  virtual host blog." Later; it needs the values of every option the flake defines, on two revisions.

## 3. The fleet as one typed program

[FLEET.md](FLEET.md) has the design. Resources on hosts are values, and connecting a consumer to an
endpoint writes the consumer's URL, the server's firewall and proxy rules, the DNS record and the
secret on both sides, with ports allocated once and kept. infra writes most of these by hand today:
port 3200 appears in seven places, and SSH host keys in four.

## 4. Configuration and code in one language

- A service written in TypeScript, bundled into a derivation, whose configuration crosses from the
  module to the program through one Effect Schema. Change the schema and the module stops
  typechecking, instead of the service failing at start.
- A shell template that knows each package's programs, works out `runtimeInputs` itself and runs
  shellcheck at render time.

## 5. An editor that knows the fleet

- A TypeScript language service plugin: hovering an option shows its value on each host and links
  to the nixpkgs file that declares it. The probe already records declaration positions.
- Find all references answers "who sets `services.openssh.settings` in the fleet?"
- An MCP server for agents: option search, explanations, typechecks. For an agent, the feedback loop
  shrinks from a deploy to a typecheck.

## What we won't do

- Reimplement the module system's merging and priorities in TypeScript types. Nix evaluates, and
  Typeflake reads the results back as types.
- Check uniqueness in the type system. Port collisions and the like belong in the render, where the
  error can name both sides, and `tsc` stays at a few seconds.
- Need a runtime. Bundled services are derivations, cloud resources go through Alchemy, and every
  host's Nix builds on its own.
