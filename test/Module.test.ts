import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { mkForce, mkIf, nix, NixOS, Options, path, type Package, Types } from "../src/index.ts"

interface TestOptions {
  readonly services: { readonly greeter: { readonly enable: boolean; readonly port: number; readonly users: ReadonlyArray<string> } }
  readonly environment: { readonly systemPackages: ReadonlyArray<Package> }
}

declare module "../src/index.ts" {
  interface Register {
    readonly nixos: TestOptions
  }
}

const greeter = NixOS.module({
  options: {
    greeter: {
      enable: Options.enable("the greeter"),
      greeting: Options.make({ type: Types.str, default: "hello", description: "What it says." }),
    },
  },
  config: ({ config, lib, pkgs }) =>
    mkIf(config.greeter.enable, {
      services: { greeter: { enable: true, port: mkForce(8080) } },
      environment: {
        systemPackages: [
          pkgs.writeShellApplication({
            name: "greet",
            text: nix`
              echo ${config.greeter.greeting}
              exec ${lib.getExe(pkgs.callPackage(path("./greeter.nix"), {}))} "$@"
            `,
          }),
        ],
      },
    }),
})

describe("NixOS.module", () => {
  it("renders the module with the arguments it uses", async () => {
    expect(await Effect.runPromise(greeter.render)).toBe(`{ config, lib, pkgs, ... }:
{
  options.greeter = {
    enable = lib.mkEnableOption "the greeter";
    greeting = lib.mkOption {
      type = lib.types.str;
      default = "hello";
      description = "What it says.";
    };
  };
  config = lib.mkIf config.greeter.enable {
    services.greeter = {
      enable = true;
      port = lib.mkForce 8080;
    };
    environment.systemPackages = [
      (pkgs.writeShellApplication {
        name = "greet";
        text = ''
          echo \${config.greeter.greeting}
          exec \${lib.getExe (pkgs.callPackage ./greeter.nix { })} "$@"
        '';
      })
    ];
  };
}
`)
  })

  it("renders a generator's result, after its effects ran", async () => {
    const port = NixOS.module({
      config: function* () {
        return { services: { greeter: { port: yield* Effect.succeed(9000) } } }
      },
    })
    expect(await Effect.runPromise(port.render)).toBe(`{ ... }:\n{\n  services.greeter.port = 9000;\n}\n`)
  })
})

// Definitions inside `mkIf` are checked against the options they define, like any other.
NixOS.module({
  // @ts-expect-error a misspelled option inside mkIf
  config: ({ config }) => mkIf(config.services.greeter.enable, { services: { greeter: { prot: 1 } } }),
})
NixOS.module({
  // @ts-expect-error a string where a port belongs
  config: () => ({ services: { greeter: { port: "80" } } }),
})
NixOS.module({
  // @ts-expect-error a string where a package belongs
  config: () => ({ environment: { systemPackages: ["git"] } }),
})
NixOS.module({
  options: { greeter: { enable: Options.enable("the greeter") } },
  // @ts-expect-error reading an option no module declares
  config: ({ config }) => mkIf(config.greeter.enabled, {}),
})
