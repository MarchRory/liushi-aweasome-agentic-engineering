import { z } from "zod";

import { isCanonicalRepositoryRelativePath, ResultStatus } from "#common/index.js";

import {
  MAX_ARTIFACT_LIST_ITEMS,
  MAX_ARTIFACT_PATH_LENGTH,
  MAX_ARTIFACT_TEXT_LENGTH,
} from "../constants/index.js";
import { parseArtifactDigest, type ArtifactDigest } from "../digest/index.js";

export const nonBlank = (maxLength: number): z.ZodString =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value === value.trim());

export const textArraySchema = z
  .array(nonBlank(MAX_ARTIFACT_TEXT_LENGTH))
  .max(MAX_ARTIFACT_LIST_ITEMS);

export const pathArraySchema = z
  .array(
    nonBlank(MAX_ARTIFACT_PATH_LENGTH).refine(
      isCanonicalRepositoryRelativePath,
      "必须是规范的仓库相对 POSIX 路径。",
    ),
  )
  .max(MAX_ARTIFACT_LIST_ITEMS);

export const artifactDigestSchema = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ArtifactDigest);
