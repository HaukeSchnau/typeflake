import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const effectTsgoCommand = (): string =>
  resolvePackageBin("@effect/tsgo/package.json", "dist/effect-tsgo.js");

export const tsgoCommand = (): string =>
  resolvePackageBin("@typescript/native-preview/package.json", "bin/tsgo");

const resolvePackageBin = (packageJsonSpecifier: string, binPath: string): string => {
  const packageJsonPath = fileURLToPath(import.meta.resolve(packageJsonSpecifier));
  return join(dirname(packageJsonPath), binPath);
};
