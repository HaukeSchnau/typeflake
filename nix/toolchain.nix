{ pkgs }:
let
  # npm stage, which releases use, arrived in npm 11.20; Node 24 ships 11.19.
  nodejs = pkgs.nodejs_26;
in
{
  inherit nodejs;
  pnpm = pkgs.pnpm_11.override { nodejs-slim = pkgs.nodejs-slim_26; };
}
