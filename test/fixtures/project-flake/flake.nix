{
  description = "Typeflake option generation fixture";

  inputs = {
    fixture-nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    fixture-home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "fixture-nixpkgs";
    };
  };

  outputs =
    {
      self,
      fixture-home-manager,
      fixture-nixpkgs,
    }:
    {
      checks.x86_64-linux.inputNames = fixture-nixpkgs.legacyPackages.x86_64-linux.runCommand
        "typeflake-fixture-input-names"
        { }
        ''
          mkdir -p "$out"
          echo "${fixture-home-manager.outPath}" > "$out/home-manager-source"
        '';
    };
}
