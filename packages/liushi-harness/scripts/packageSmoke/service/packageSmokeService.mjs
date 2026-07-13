import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
  EXPECTED_BIN_NAMES,
  EXPECTED_HELP_COMMANDS,
  PACKAGE_NAME,
  REQUIRED_PACKAGE_FILES,
  TEMP_DIRECTORY_PREFIX,
} from "../constants/index.mjs";
import { resolveNpmCliPath, runProcess } from "../utils/index.mjs";

export async function runPackageSmoke(packageRoot) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), TEMP_DIRECTORY_PREFIX));
  try {
    const packRoot = join(temporaryRoot, "pack");
    const consumerRoot = join(temporaryRoot, "consumer");
    await Promise.all([mkdir(packRoot), mkdir(consumerRoot)]);

    const packed = packPackage(packageRoot, packRoot);
    const tarballPath = join(packRoot, packed.filename);
    await writeConsumerPackage(consumerRoot);
    installPackage(consumerRoot, tarballPath);

    const installedPackageRoot = join(consumerRoot, "node_modules", PACKAGE_NAME);
    await assertRequiredFiles(installedPackageRoot);
    const installedManifest = JSON.parse(
      await readFile(join(installedPackageRoot, "package.json"), "utf8"),
    );
    assertValue(installedManifest.name === PACKAGE_NAME, "安装包名称不匹配。");
    assertValue(installedManifest.version === packed.version, "安装包版本不匹配。");

    const esm = verifyEsmImport(consumerRoot);
    const cjs = verifyCjsRequire(consumerRoot);
    const cli = await verifyCli(
      consumerRoot,
      temporaryRoot,
      installedPackageRoot,
      installedManifest,
    );

    return {
      packageName: packed.name,
      version: packed.version,
      entryCount: packed.entryCount,
      esm,
      cjs,
      cli,
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function packPackage(packageRoot, packRoot) {
  const result = runNpm(["pack", "--json", "--pack-destination", packRoot], packageRoot);
  const parsed = JSON.parse(result.stdout);
  assertValue(Array.isArray(parsed) && parsed.length === 1, "npm pack 未返回单一发布物。");
  return parsed[0];
}

async function writeConsumerPackage(consumerRoot) {
  const manifest = {
    name: "liushi-harness-package-smoke-consumer",
    private: true,
    type: "module",
  };
  await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function installPackage(consumerRoot, tarballPath) {
  runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarballPath],
    consumerRoot,
  );
}

async function assertRequiredFiles(installedPackageRoot) {
  await Promise.all(
    REQUIRED_PACKAGE_FILES.map((relativePath) =>
      access(join(installedPackageRoot, ...relativePath.split("/"))),
    ),
  );
  const license = await readFile(join(installedPackageRoot, "LICENSE"), "utf8");
  assertValue(license.includes("MIT License"), "发布物 LICENSE 内容无效。");
}

function verifyEsmImport(consumerRoot) {
  const script = `
    const pkg = await import(${JSON.stringify(PACKAGE_NAME)});
    const value = pkg.CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION;
    if (typeof value !== "string") throw new Error("ESM export missing");
    process.stdout.write(JSON.stringify({ manifestSchemaVersion: value }));
  `;
  return JSON.parse(
    runProcess(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: consumerRoot,
    }).stdout,
  );
}

function verifyCjsRequire(consumerRoot) {
  const script = `
    const pkg = require(${JSON.stringify(PACKAGE_NAME)});
    const value = pkg.CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION;
    if (typeof value !== "string") throw new Error("CJS export missing");
    process.stdout.write(JSON.stringify({ manifestSchemaVersion: value }));
  `;
  return JSON.parse(runProcess(process.execPath, ["--eval", script], { cwd: consumerRoot }).stdout);
}

async function verifyCli(consumerRoot, temporaryRoot, installedPackageRoot, installedManifest) {
  const executableSuffix = process.platform === "win32" ? ".cmd" : "";
  const binRoot = join(consumerRoot, "node_modules", ".bin");
  for (const binName of EXPECTED_BIN_NAMES) {
    await access(join(binRoot, `${binName}${executableSuffix}`));
    assertValue(typeof installedManifest.bin?.[binName] === "string", `${binName} Bin 缺失。`);
    await access(join(installedPackageRoot, ...installedManifest.bin[binName].split("/")));
    const help = runNpm(["exec", "--offline", "--", binName, "help"], consumerRoot);
    assertValue(help.stderr.length === 0, `${binName} help 写入了 stderr。`);
    for (const command of EXPECTED_HELP_COMMANDS) {
      assertValue(help.stdout.includes(command), `${binName} help 缺少 ${command}。`);
    }
  }

  const storeRoot = join(temporaryRoot, "runtime");
  const doctor = runNpm(
    ["exec", "--offline", "--", EXPECTED_BIN_NAMES[0], "doctor", "--store", storeRoot, "--json"],
    consumerRoot,
  );
  assertValue(doctor.stderr.length === 0, "doctor 写入了 stderr。");
  const envelope = JSON.parse(doctor.stdout);
  assertValue(envelope.status === "success", "doctor 未返回 success。");
  assertValue(envelope.command === "doctor", "doctor 返回了错误命令标识。");
  return { bins: EXPECTED_BIN_NAMES, doctor: envelope.status };
}

function runNpm(args, cwd) {
  return runProcess(process.execPath, [resolveNpmCliPath(), ...args], { cwd });
}

function assertValue(condition, message) {
  if (!condition) throw new Error(message);
}
