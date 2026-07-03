import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { InitWriteFailed } from "./errors.ts";

export type InitPackageManager = "bun" | "npm" | "pnpm";

export interface InitOptions {
  readonly directory: string;
  readonly force?: boolean;
  readonly packageManager: InitPackageManager;
}

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

interface InitFile {
  readonly content: string;
  readonly path: string;
}

export const initProject = (options: InitOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.resolve(options.directory);
    const files = initFiles(options.packageManager);
    const created: string[] = [];
    const skipped: string[] = [];

    yield* fs.makeDirectory(directory, { recursive: true });

    for (const file of files) {
      const filePath = path.join(directory, file.path);
      const exists = yield* fs.exists(filePath);

      if (exists && options.force !== true) {
        skipped.push(file.path);
      } else {
        yield* writeInitFile(filePath, file.content);
        created.push(file.path);
      }
    }

    return { created, skipped } satisfies InitResult;
  });

export const renderInitSummary = (result: InitResult, directory: string): string => {
  const lines = [`Initialized Typeflake project in ${directory}`];

  if (result.created.length > 0) {
    lines.push(`Created: ${result.created.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    lines.push(`Skipped existing files: ${result.skipped.join(", ")}`);
  }

  lines.push(
    "Next steps:",
    "  typeflake doctor",
    "  typeflake options probe --scope nixos",
    "  typeflake options generate",
    "  typeflake check",
  );

  return lines.join("\n");
};

const writeInitFile = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fs
      .writeFileString(filePath, content)
      .pipe(Effect.mapError((cause) => new InitWriteFailed({ cause, path: filePath })));
  });

const initFiles = (packageManager: InitPackageManager): readonly InitFile[] => [
  {
    path: "package.json",
    content: `${JSON.stringify(packageJson(packageManager), null, 2)}\n`,
  },
  {
    path: "tsconfig.json",
    content: `${JSON.stringify(tsconfigJson, null, 2)}\n`,
  },
  {
    path: "flake.ts",
    content: flakeTs,
  },
  {
    path: ".typeflake/options.ts",
    content: placeholderOptionsTs,
  },
];

const packageJson = (packageManager: InitPackageManager) => ({
  private: true,
  scripts: {
    "typeflake:check": "typeflake check",
    "typeflake:doctor": "typeflake doctor",
    "typeflake:options": "typeflake options probe --scope nixos && typeflake options generate",
    "typeflake:sync": "typeflake sync",
  },
  type: "module",
  devDependencies: {
    typeflake: "next",
  },
  packageManager: packageManagerName(packageManager),
});

const packageManagerName = (packageManager: InitPackageManager): string => {
  switch (packageManager) {
    case "bun":
      return "bun@1";
    case "npm":
      return "npm@11";
    case "pnpm":
      return "pnpm@11";
    default:
      packageManager satisfies never;
      return "npm@11";
  }
};

const tsconfigJson = {
  compilerOptions: {
    allowImportingTsExtensions: true,
    exactOptionalPropertyTypes: true,
    lib: ["ES2024", "DOM"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: "ES2024",
    types: ["node"],
    verbatimModuleSyntax: true,
  },
  include: ["flake.ts", ".typeflake/**/*.ts"],
};

const flakeTs = `import { Flake, NixOS, pkgs } from "typeflake";
import type { NixOSOptions } from "./.typeflake/options.ts";

const systemConfig = NixOS.config({
  environment: {
    systemPackages: [pkgs.git],
  },
  services: {
    openssh: {
      enable: true,
      ports: [22],
    },
  },
  system: {
    stateVersion: "25.11",
  },
} satisfies NixOSOptions.Config);

export default Flake.make({
  inputs: Flake.inputs({
    nixpkgs: Flake.input("nixpkgs", "github:NixOS/nixpkgs/nixos-unstable"),
  }),
  outputs: ({ nixpkgs }) => ({
    devShells: {
      "x86_64-linux": {
        default: {
          packages: [pkgs.git],
        },
      },
    },
    nixosConfigurations: {
      demo: NixOS.configuration({
        modules: [NixOS.module(systemConfig)],
        system: "x86_64-linux",
      }),
    },
  }),
});
`;

const placeholderOptionsTs = `// Placeholder project-local option types.
// Run "typeflake options probe" and "typeflake options generate" to replace this file.
import type {
  HomeManagerGeneratedConfig,
  NixOptionValue,
  NixOSGeneratedConfig,
  UnsupportedNixOption,
} from "typeflake";

export type { NixOptionValue, UnsupportedNixOption };

export namespace NixOSOptions {
  export type Config = NixOSGeneratedConfig;
}

export namespace HomeManagerOptions {
  export type Config = HomeManagerGeneratedConfig;
}
`;
