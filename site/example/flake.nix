{
  description = "A made-up flake with a NixOS server and a Mac, configured with Typeflake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nix-darwin = {
      url = "github:nix-darwin/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      home-manager,
      nix-darwin,
      ...
    }:
    {
      nixosConfigurations.server = nixpkgs.lib.nixosSystem {
        modules = [
          home-manager.nixosModules.home-manager
          ./modules/blog.nix
          ./hosts/server.nix
        ];
      };
      darwinConfigurations.laptop = nix-darwin.lib.darwinSystem {
        modules = [ ./hosts/laptop.nix ];
      };
    };
}
