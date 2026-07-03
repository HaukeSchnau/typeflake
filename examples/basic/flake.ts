import { Flake, Home, NixOS, pkgs } from "../../src/index.ts";

export default Flake.make({
  description: "A tiny Typeflake-generated NixOS configuration",
  inputs: Flake.inputs({
    nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
    homeManager: Flake.input("homeManager", "github:nix-community/home-manager"),
  }),
  outputs: ({ homeManager }) => ({
    nixosConfigurations: {
      framework: NixOS.configuration({
        system: "x86_64-linux",
        modules: [
          NixOS.module({
            boot: {
              loader: {
                grub: {
                  devices: ["nodev"],
                },
              },
            },
            environment: {
              systemPackages: [pkgs.git, pkgs.neovim],
            },
            fileSystems: {
              "/": {
                device: "none",
                fsType: "tmpfs",
              },
            },
            services: {
              openssh: {
                enable: true,
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
          }),
          Home.nixosModule(homeManager, {
            users: {
              hauke: {
                home: {
                  stateVersion: "25.11",
                },
                programs: {
                  git: {
                    enable: true,
                  },
                },
              },
            },
          }),
        ],
      }),
    },
    devShells: {
      "x86_64-linux": {
        default: {
          packages: [pkgs.git, pkgs.nodejs],
        },
      },
    },
  }),
});
