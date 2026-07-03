{
  description = "Typeflake development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nub.url = "github:nubjs/nub";
  };

  outputs =
    {
      self,
      home-manager,
      nixpkgs,
      nub,
    }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              nub.packages.${system}.default
              pkgs.git
              pkgs.jq
              pkgs.nix
              pkgs.nixfmt
              pkgs.nodejs_24
              pkgs.pnpm
            ];

            shellHook = ''
              export TYPEFLAKE_REPO_ROOT="$PWD"
              echo "Typeflake dev shell: use 'nub install', 'nub run check', and 'nub run typeflake'."
            '';
          };
        }
      );

      formatter = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.nixfmt
      );
    };
}
