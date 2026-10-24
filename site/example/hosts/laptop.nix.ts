import { define, Darwin } from "typeflake";

export default Darwin.module({
  config: ({ pkgs }) =>
    define({
      nixpkgs: { hostPlatform: "aarch64-darwin" },
      system: {
        primaryUser: "alice",
        defaults: {
          dock: { autohide: true, orientation: "left" },
          finder: { AppleShowAllExtensions: true },
        },
        stateVersion: 6,
      },
      environment: { systemPackages: [pkgs.git, pkgs.ripgrep] },
    }),
});
