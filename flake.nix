{
  description = "Typeflake: typed Nix modules written in Effect TypeScript";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    projects-sdk = {
      url = "github:HaukeSchnau/projects-sdk/v0.1.0";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, projects-sdk, ... }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAll (
        pkgs:
        let
          toolchain = import ./nix/toolchain.nix {
            inherit pkgs;
            sdk = projects-sdk;
          };
          shell = pkgs.mkShellNoCC {
            packages = builtins.attrValues toolchain ++ [
              pkgs.nixfmt
              # The tests evaluate rendered Nix.
              pkgs.nix
            ];
          };
        in
        {
          ci = shell;
          default = shell;
        }
      );

      formatter = forAll (pkgs: pkgs.nixfmt);
    };
}
