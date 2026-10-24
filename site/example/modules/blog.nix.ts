import { mkIf, nix, NixOS, Options, path, Types } from "typeflake";

export default NixOS.module({
  options: {
    blog: {
      enable: Options.enable("the blog"),
      domain: Options.make({
        type: Types.str,
        description: "Where the blog answers.",
      }),
    },
  },
  config: ({ config, lib, pkgs }) => {
    const site = pkgs.callPackage(path("./site.nix"), {});
    return mkIf(config.blog.enable, {
      services: {
        nginx: {
          enable: true,
          recommendedTlsSettings: true,
          virtualHosts: {
            blog: {
              serverName: config.blog.domain,
              forceSSL: true,
              enableACME: true,
              root: site,
            },
          },
        },
      },
      security: {
        acme: {
          acceptTerms: true,
          defaults: { email: "alice@example.org" },
        },
      },
      networking: { firewall: { allowedTCPPorts: [80, 443] } },
      systemd: {
        services: {
          "blog-links": {
            description: "Check the blog for broken links",
            startAt: "daily",
            script: nix`
              ${lib.getExe(pkgs.lychee)} https://${config.blog.domain}
            `,
          },
        },
      },
    });
  },
});
