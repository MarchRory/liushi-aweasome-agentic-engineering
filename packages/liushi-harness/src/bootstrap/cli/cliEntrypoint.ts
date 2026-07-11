#!/usr/bin/env node

import { runCliBootstrap } from "./cliBootstrap.js";

void runCliBootstrap(process.argv.slice(2)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  () => {
    process.stderr.write("ERROR [io_failure] Unhandled CLI bootstrap failure.\n");
    process.exitCode = 1;
  },
);
