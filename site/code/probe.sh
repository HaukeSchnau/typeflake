nix eval --impure --json .#nixosConfigurations.srv-2.options \
  --apply 'import ./src/probe.nix { class = "nixos"; }'
