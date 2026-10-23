{
  description = "Typeflake: typed Nix modules written in Effect TypeScript";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
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
          # npm stage, which releases use, arrived in npm 11.20; Node 24 ships 11.19.
          nodejs = pkgs.nodejs_26;
          shell = pkgs.mkShellNoCC {
            packages = [
              nodejs
              (pkgs.pnpm_11.override { nodejs-slim = pkgs.nodejs-slim_26; })
              pkgs.bun
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
