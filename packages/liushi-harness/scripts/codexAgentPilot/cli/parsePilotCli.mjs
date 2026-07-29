const COMMANDS = Object.freeze({
  prepare: "prepare",
  approve: "approve",
  previewHost: "preview-host",
  approveHost: "approve-host",
  runAgent: "run-agent",
});
const OPTION_NAMES = Object.freeze({
  root: "--root",
  actorId: "--actor-id",
  codex: "--codex",
  codexHome: "--codex-home",
  model: "--model",
  stateDigest: "--state-digest",
  packetDigest: "--packet-digest",
});

export function parsePilotCli(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error("必须指定 prepare、approve、preview-host、approve-host 或 run-agent。");
  }
  const command = argv[0];
  if (!Object.values(COMMANDS).includes(command)) {
    throw new Error("只支持 prepare、approve、preview-host、approve-host 或 run-agent。");
  }
  const values = new Map();
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (!Object.values(OPTION_NAMES).includes(option)) throw new Error(`不支持选项 ${option}。`);
    if (values.has(option)) throw new Error(`选项 ${option} 不能重复。`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || value.length === 0) {
      throw new Error(`选项 ${option} 缺少值。`);
    }
    values.set(option, value);
    index += 1;
  }
  const required = requiredOptions(command);
  for (const option of required)
    if (!values.has(option)) throw new Error(`缺少必需选项 ${option}。`);
  const allowed = new Set(required);
  for (const option of values.keys())
    if (!allowed.has(option)) throw new Error(`选项 ${option} 不适用于 ${command}。`);
  return {
    command,
    root: values.get(OPTION_NAMES.root),
    actorId: values.get(OPTION_NAMES.actorId),
    ...(command === COMMANDS.prepare
      ? {
          codex: values.get(OPTION_NAMES.codex),
          codexHome: values.get(OPTION_NAMES.codexHome),
          model: values.get(OPTION_NAMES.model),
        }
      : {
          stateDigest: values.get(OPTION_NAMES.stateDigest),
          ...([COMMANDS.approveHost, COMMANDS.runAgent].includes(command)
            ? { packetDigest: values.get(OPTION_NAMES.packetDigest) }
            : {}),
        }),
  };
}

export const pilotCliCommands = COMMANDS;

function requiredOptions(command) {
  if (command === COMMANDS.prepare) {
    return [
      OPTION_NAMES.root,
      OPTION_NAMES.actorId,
      OPTION_NAMES.codex,
      OPTION_NAMES.codexHome,
      OPTION_NAMES.model,
    ];
  }
  const options = [OPTION_NAMES.root, OPTION_NAMES.stateDigest, OPTION_NAMES.actorId];
  if ([COMMANDS.approveHost, COMMANDS.runAgent].includes(command)) {
    options.push(OPTION_NAMES.packetDigest);
  }
  return options;
}
