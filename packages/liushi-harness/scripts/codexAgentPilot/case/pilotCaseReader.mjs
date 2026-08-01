import { readFile } from "node:fs/promises";

import { requireExistingFile } from "../validation/index.mjs";
import { validateCodexAgentPilotCase } from "./pilotCaseValidation.mjs";

/** 读取并规范化一个本地企业 Pilot Case。 */
export async function readCodexAgentPilotCase(file) {
  const caseFile = await requireExistingFile(file, "--case");
  let input;
  try {
    input = JSON.parse(await readFile(caseFile, "utf8"));
  } catch (error) {
    throw new Error("Pilot Case 必须是合法 UTF-8 JSON。", { cause: error });
  }
  return validateCodexAgentPilotCase(input);
}
