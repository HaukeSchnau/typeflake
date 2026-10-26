# Turns an evaluated module system's `options` into plain data for Typeflake's type generator.
# Builtins only, so it applies to any configuration:
#   nix eval .#nixosConfigurations.<host>.options --apply 'import ./probe.nix { class = "nixos"; }'
#
# Like the NixOS manual, it reads a type's description only where one is known to be finite: leaf types
# and the types of visible options. A recursive type such as `boot.kernel.sysfs`'s freeform type
# describes itself without end, and `tryEval` can't catch infinite recursion.
#
# Types carry no identity, so the walk detects recursion through what does:
# - an option's declaration position and its location within its submodule. disko's `content` options
#   nest inside themselves, and the walk records a reference when it meets an option it is already
#   inside. Position alone isn't enough: options a helper declares in a loop, like strongswan's, share it.
# - a submodule's module class. `home-manager.users.<name>` enters class `homeManager` once; a nested
#   configuration of a class the walk is already inside becomes a reference.
# Recursive types without either, such as `pkgs.formats.json { }`, end at a depth. `oneOf` nests an
# `either` per alternative, so unions are flattened and don't count towards it.
{ class }:
options:
let
  maxTypeDepth = 6;
  maxSubmoduleDepth = 12;

  isOption = value: builtins.isAttrs value && (value._type or null) == "option";

  # Some options throw when the walk reads them. Home Manager's `pkgs` needs `home.stateVersion`, which
  # a submodule's options have no value for, so an option whose type, visibility or defaults use
  # `pkgs` throws unless `useGlobalPkgs` is on. Such an option becomes unknown instead of failing the
  # probe. Probe records are plain data, so forcing them whole is safe; types may be infinite.
  orElse =
    fallback: value:
    let
      result = builtins.tryEval (builtins.deepSeq value value);
    in
    if result.success then result.value else fallback;

  throws = value: !(builtins.tryEval value).success;

  unknown = {
    id = null;
    visible = true;
    type = {
      name = "unknown";
      truncated = true;
    };
    description = null;
    default = null;
    readOnly = false;
    internal = false;
  };

  # Descriptions and defaultText are strings or `literalExpression`/`literalMD` wrappers.
  text =
    value:
    if builtins.isString value then
      value
    else if builtins.isAttrs value && value ? text then
      value.text
    else
      null;

  # A submodule's description reads its freeform type, which throws like the options above. The
  # submodule's options still have types, so only the description goes.
  description = type: orElse null (text (type.description or null));

  optionId =
    opt:
    let
      positions = opt.declarationPositions or [ ];
      first = builtins.head positions;
    in
    if positions == [ ] then
      null
    else
      "${first.file}:${toString first.line}:${toString first.column}#${builtins.concatStringsSep "." opt.loc}";

  # `_module` holds the module system's own options; `_freeformOptions` repeats `nestedTypes.freeformType`.
  walk =
    scope: attrs:
    builtins.mapAttrs
      (
        _: node:
        if throws node then
          unknown
        else if isOption node then
          orElse unknown (option scope node)
        else
          { group = walk scope node; }
      )
      (
        builtins.removeAttrs
          (builtins.listToAttrs (
            builtins.filter (entry: throws entry.value || builtins.isAttrs entry.value) (
              map (name: {
                inherit name;
                value = attrs.${name};
              }) (builtins.attrNames attrs)
            )
          ))
          [
            "_module"
            "_freeformOptions"
          ]
      );

  alternatives =
    type:
    if (type.name or null) == "either" then
      alternatives type.nestedTypes.left ++ alternatives type.nestedTypes.right
    else
      [ type ];

  # `scope.classes` and `scope.options` hold the module classes and option ids the walk is inside.
  # `visible = "shallow"` only keeps sub-options out of the manual; `home-manager.users` uses it.
  option =
    scope: opt:
    let
      visible = opt.visible or true;
      id = optionId opt;
      inner = scope // {
        options = scope.options ++ [ id ];
      };
    in
    {
      inherit id visible;
      type =
        if visible == false then
          { name = opt.type.name or "unknown"; }
        else if id != null && builtins.elem id scope.options then
          {
            name = opt.type.name or "unknown";
            optionRef = id;
          }
        else
          typeOf inner 0 opt.type // { description = description opt.type; };
      description = text (opt.description or null);
      default = text (opt.defaultText or null);
      readOnly = opt.readOnly or false;
      internal = opt.internal or false;
      deprecated = if visible == false then null else opt.type.deprecationMessage or null;
    };

  typeOf =
    scope: typeDepth: type:
    let
      name = type.name or "unknown";
      # A submodule's `nestedTypes` reads its freeform type, which throws like the options above.
      # `attrTag` lists options rather than types.
      nested =
        if throws (type.nestedTypes or { }) then
          { }
        else
          builtins.mapAttrs (_: t: if isOption t then t.type else t) (type.nestedTypes or { });
      # Read `functor` only where needed: some modules' custom types define a broken one.
      submoduleClass = if name == "submodule" then type.functor.payload.class or null else null;
    in
    if typeDepth > maxTypeDepth || builtins.length scope.classes > maxSubmoduleDepth then
      {
        inherit name;
        truncated = true;
      }
    else if submoduleClass != null && builtins.elem submoduleClass scope.classes then
      {
        inherit name;
        classRef = submoduleClass;
      }
    else if name == "either" then
      {
        name = "oneOf";
        alternatives = map (typeOf scope typeDepth) (alternatives type);
      }
    else
      {
        inherit name;
      }
      // (if name == "enum" then { values = type.functor.payload.values; } else { })
      # `pathWith { inStore = false; }` takes strings only; other paths also take derivations.
      // (
        if name == "path" then { inStore = orElse null (type.functor.payload.inStore or null); } else { }
      )
      // (if submoduleClass != null then { class = submoduleClass; } else { })
      // (
        if nested == { } then
          { description = description type; }
        else
          { nested = builtins.mapAttrs (_: typeOf scope (typeDepth + 1)) nested; }
      )
      // (
        if name == "submodule" then
          {
            options = walk (scope // { classes = scope.classes ++ [ submoduleClass ]; }) (
              type.getSubOptions [ ]
            );
          }
        else
          { }
      );
in
walk {
  classes = [ class ];
  options = [ ];
} options
