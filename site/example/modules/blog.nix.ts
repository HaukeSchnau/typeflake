import { exe, mkIf, nix, NixOS, Options, Types } from "typeflake";
import site from "./site.nix";

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
  config: ({ config, pkgs }) =>
    mkIf(config.blog.enable, {
      services: {
        nginx: {
          enable: true,
          recommendedTlsSettings: true,
          virtualHosts: {
            blog: {
              serverName: config.blog.domain,
              forceSSL: true,
              enableACME: true,
              root: pkgs.callPackage(site, {}),
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
              ${exe(pkgs.lychee, "lychee")} https://${config.blog.domain}
            `,
          },
        },
      },
    }),
});
