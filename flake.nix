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
          tools = import ./nix/toolchain.nix { inherit pkgs; };
          shell = pkgs.mkShellNoCC {
            packages = [
              tools.nodejs
              tools.pnpm
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
