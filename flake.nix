{
  description = "Typeflake: typed Nix modules written in Effect TypeScript";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nix-infra-modules = {
      url = "github:HaukeSchnau/nix-infra-modules/b365d13637b9dc83c397df542b5112a50ac8cbb9";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, nix-infra-modules, ... }:
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
            sdk = nix-infra-modules;
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
