{ config, lib, pkgs, ... }:
{
  options.appStores.enable = lib.mkEnableOption "asc and gplay with the Urbs UG store credentials";
  config = lib.mkIf config.appStores.enable {
    sops.secrets."app-store-connect/api-key" = {
      owner = config.identity.primaryUser;
      mode = "0400";
    };
    environment.systemPackages = [
      (pkgs.writeShellApplication {
        name = "asc";
        text = ''
          ASC_PRIVATE_KEY=$(cat ${config.sops.secrets."app-store-connect/api-key".path})
          exec ${lib.getExe (pkgs.callPackage ./asc-package.nix { })} "$@"
        '';
      })
    ];
  };
}
