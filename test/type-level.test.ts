import * as Effect from "effect/Effect";
import { assert, describe, it } from "@effect/vitest";
import { attest } from "@arktype/attest";
import {
  Flake,
  NixOS,
  pkgs,
  rawNix,
  unsupportedNixOption,
  type Home,
  type TypeflakeFlake,
  type UnsupportedNixOption,
} from "../src/index.ts";

const inputs = Flake.inputs({
  nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
});

const pure = Flake.make({
  inputs,
  outputs: ({ nixpkgs }) => ({
    nixosConfigurations: {
      demo: nixpkgs,
    },
  }),
});

const effectful = Flake.effect(
  Effect.succeed({
    inputs,
    outputs: () => ({}),
  }),
);

const impure = Flake.impure(
  Effect.succeed({
    inputs,
    outputs: () => ({}),
  }),
);

const typedNixOSConfig: NixOS.Config = NixOS.config({
  boot: {
    loader: {
      grub: {
        devices: ["nodev"],
      },
    },
  },
  environment: {
    systemPackages: [pkgs.git],
  },
  fileSystems: {
    "/": {
      device: "none",
      fsType: "tmpfs",
    },
  },
  networking: {
    firewall: {
      allowedTCPPorts: [22, 443],
    },
    hostName: "framework",
  },
  services: {
    nginx: {
      enable: false,
    },
    openssh: {
      enable: true,
      ports: [22],
    },
  },
  system: {
    stateVersion: "25.11",
  },
  users: {
    users: {
      hauke: {
        isNormalUser: true,
      },
    },
  },
});

const typedHomeConfig: Home.Config = {
  home: {
    packages: [pkgs.git],
    stateVersion: "25.11",
  },
  programs: {
    git: {
      enable: true,
    },
  },
};

describe("type-level contracts", () => {
  it("keeps compile-time flake taint and input guarantees", () => {
    attest<"pure", typeof pure.taint>();
    attest<"effect", typeof effectful.taint>();
    attest<"impure", typeof impure.taint>();
    attest<TypeflakeFlake<typeof inputs>, typeof pure>();
    attest<NixOS.Config, typeof typedNixOSConfig>();
    attest<Home.Config, typeof typedHomeConfig>();
    attest<
      UnsupportedNixOption<"mystery: mystery value">,
      ReturnType<typeof unsupportedNixOption<"mystery: mystery value">>
    >();

    assert.equal(pure.taint, "pure");
    assert.equal(effectful.taint, "effect");
    assert.equal(impure.taint, "impure");
  });
});

Flake.inputs({
  // @ts-expect-error Input object keys must match the explicit Nix input name.
  nixpkgs: Flake.input("notNixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
});

Flake.make({
  inputs: {
    // @ts-expect-error Constructors must also reject input keys that do not match input names.
    nixpkgs: Flake.input("notNixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
  },
  outputs: () => ({}),
});

NixOS.config({
  services: {
    openssh: {
      // @ts-expect-error NixOS OpenSSH enable is generated as boolean.
      enable: "yes",
    },
  },
});

NixOS.config({
  services: {
    // @ts-expect-error Unknown generated NixOS options require an explicit escape hatch.
    definitelyNotAService: {
      enable: true,
    },
  },
});

NixOS.config({
  services: {
    openssh: {
      // @ts-expect-error NixOS OpenSSH ports are generated as a readonly number list.
      ports: ["22"],
    },
  },
});

NixOS.config({
  networking: {
    // @ts-expect-error NixOS hostName is generated as a string.
    hostName: 1234,
  },
});

interface UnsupportedFixtureConfig {
  readonly services?: {
    readonly mystery?: {
      readonly enable?: UnsupportedNixOption<"mystery: mystery value">;
    };
  };
}

const typedUnsupportedConfig: UnsupportedFixtureConfig = {
  services: {
    mystery: {
      enable: unsupportedNixOption("mystery: mystery value", "config.services.mystery.enable"),
    },
  },
};

typedUnsupportedConfig satisfies UnsupportedFixtureConfig;

const unsupportedWithRawNix: UnsupportedFixtureConfig = {
  services: {
    mystery: {
      // @ts-expect-error Unsupported options must use unsupportedNixOption, not plain rawNix.
      enable: rawNix("config.services.mystery.enable"),
    },
  },
};

void unsupportedWithRawNix;
