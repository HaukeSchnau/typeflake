{
  description = "A tiny Typeflake-generated NixOS configuration";
  inputs = {
    homeManager = {
      url = "github:nix-community/home-manager";
    };
    nixpkgs = {
      url = "github:NixOS/nixpkgs/nixos-unstable";
    };
  };
  outputs = { self, nixpkgs, homeManager }: {
    devShells = {
      x86_64-linux = {
        default = let pkgs = nixpkgs.legacyPackages.x86_64-linux; in pkgs.mkShell {
          packages = [
            pkgs.git
            pkgs.nodejs
          ];
        };
      };
    };
    nixosConfigurations = {
      framework = nixpkgs.lib.nixosSystem {
        modules = [
            ({ pkgs, ... }: {
              boot = {
                loader = {
                  grub = {
                    devices = [
                      "nodev"
                    ];
                  };
                };
              };
              environment = {
                systemPackages = [
                  pkgs.git
                  pkgs.neovim
                ];
              };
              fileSystems = {
                "/" = {
                  device = "none";
                  fsType = "tmpfs";
                };
              };
              services = {
                openssh = {
                  enable = true;
                };
              };
              system = {
                stateVersion = "25.11";
              };
              users = {
                users = {
                  hauke = {
                    isNormalUser = true;
                  };
                };
              };
            })
            ({ pkgs, ... }: {
              home-manager = {
                users = {
                  hauke = {
                    home = {
                      stateVersion = "25.11";
                    };
                    programs = {
                      git = {
                        enable = true;
                      };
                    };
                  };
                };
              };
              imports = [
                homeManager.nixosModules.home-manager
              ];
            })
          ];
        system = "x86_64-linux";
      };
    };
  };
}
