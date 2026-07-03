#!/usr/bin/env nub

import { version } from "./index.ts";

const command = process.argv[2] ?? "help";

switch (command) {
  case "help": {
    console.log(`typeflake ${version}

Usage:
  typeflake help

The first implementation spike is in progress.`);
    break;
  }
  default: {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
}
