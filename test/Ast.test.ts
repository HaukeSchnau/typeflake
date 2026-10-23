import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import * as Ast from "../src/Ast.ts"

const v = Ast.variable("v")

/** Strings as parts, and what they must evaluate to with `v = "@"`. */
const strings: ReadonlyArray<readonly [ReadonlyArray<string | Ast.Expr>, string]> = [
  [["plain"], "plain"],
  [["two\nlines\n"], "two\nlines\n"],
  [["no\ntrailing newline"], "no\ntrailing newline"],
  [["  indented\nnext"], "  indented\nnext"],
  [["a\n\nb\n"], "a\n\nb\n"],
  [["\nstarts empty\n"], "\nstarts empty\n"],
  [["literal ${x} and '' quotes\n"], "literal ${x} and '' quotes\n"],
  [["ends\nwith quote'"], "ends\nwith quote'"],
  [["cost $", v, "\nnext\n"], "cost $@\nnext\n"],
  [["cost $", v], "cost $@"],
  [["back\\slash $", v], "back\\slash $@"],
  [["tab\tinside\nok\n"], "tab\tinside\nok\n"],
  [["line\n", v, " at a line's start\n"], "line\n@ at a line's start\n"],
  [["trailing spaces   \nok\n"], "trailing spaces   \nok\n"],
  [["x\n   \ny"], "x\n   \ny"],
]

describe("print", () => {
  it("renders strings that evaluate to their value", () => {
    const list = Ast.print(Ast.list(strings.map(([parts]) => Ast.string(parts))))
    const evaluated = execFileSync("nix-instantiate", ["--eval", "--strict", "--json", "-E", `let v = "@"; in ${list}`], {
      encoding: "utf8",
    })
    expect(JSON.parse(evaluated)).toEqual(strings.map(([, value]) => value))
  })

  it("collapses single-attribute sets and parenthesizes by precedence", () => {
    const lib = Ast.variable("lib")
    const expr = Ast.attrs([
      ["services", Ast.attrs([["openssh", Ast.attrs([["enable", Ast.bool(true)]])]])],
      ["environment", Ast.attrs([["systemPackages", Ast.list([Ast.apply(Ast.select(Ast.variable("pkgs"), "callPackage"), Ast.path("./a.nix"), Ast.attrs([]))])]])],
      ["config", Ast.apply(Ast.select(lib, "mkIf"), Ast.select(Ast.variable("config"), "enable"), Ast.list([Ast.number(-1), Ast.number(1.5)]))],
    ])

    expect(Ast.print(expr)).toBe(`{
  services.openssh.enable = true;
  environment.systemPackages = [ (pkgs.callPackage ./a.nix { }) ];
  config = lib.mkIf config.enable [ (-1) 1.5 ];
}
`)
  })
})
