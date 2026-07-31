import { calculateCanonicalJsonSha256 } from "../audit/index.js";
import {
  CodexAppServerApprovalState,
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS,
  CODEX_APP_SERVER_JSON_RPC_ERRORS,
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../enums/index.js";
import { CodexAppServerError, type CodexAppServerWireRecord } from "../contracts/index.js";
import {
  cancelAuthorization,
  deniedAuthorizationEvidence,
  readOwnDataField,
  reasonEvidence,
  sendDecision,
  sendProtocolError,
} from "./protocolActions.js";
import type {
  CodexAppServerFileChangeRecord,
  CodexAppServerProtocolContext,
} from "./protocolState.js";
import {
  assertContext,
  assertGrantRootIsEmpty,
  createProtocolError,
  isPlainRecord,
  isRpcId,
  requireIdentifier,
  requireRecord,
} from "./protocolWire.js";
import { createFileChangeProposal } from "../validation/index.js";

/** 处理服务端发来的 JSON-RPC 请求。 */
export async function handleServerRequest(
  context: CodexAppServerProtocolContext,
  message: CodexAppServerWireRecord,
): Promise<void> {
  if (!isRpcId(message.id)) throw createProtocolError("server request id is invalid");
  if (message.method !== CODEX_APP_SERVER_METHODS.FileChangeRequestApproval) {
    sendProtocolError(context, message.id, CODEX_APP_SERVER_JSON_RPC_ERRORS.MethodNotFound);
    throw createProtocolError("unknown server request");
  }
  await handleFileChangeApproval(context, message, message.id);
}

/** 处理唯一的文件变更 Human Gate 审批请求。 */
export async function handleFileChangeApproval(
  context: CodexAppServerProtocolContext,
  message: CodexAppServerWireRecord,
  requestId: string | number,
): Promise<void> {
  let itemId: string | null = null;
  let item: CodexAppServerFileChangeRecord | null = null;
  let rejectionReason = CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.ProtocolRejected;

  try {
    if (context.state.respondedServerRequestIds.has(requestId)) {
      throw createProtocolError("server approval request id was repeated");
    }
    const params = requireRecord(message.params, "file change approval params");
    const threadId = requireIdentifier(params.threadId, "approval threadId");
    const turnId = requireIdentifier(params.turnId, "approval turnId");
    itemId = requireIdentifier(params.itemId, "approval itemId");
    assertContext(context, threadId, turnId, "file change approval");
    assertGrantRootIsEmpty(params);

    item = context.state.fileChangeItems.get(itemId) ?? null;
    if (item === null) {
      throw createProtocolError("file change approval arrived without a prior item/started");
    }
    if (item.approval !== null || context.state.approvalInFlight) {
      throw createProtocolError("file change approval was repeated or concurrent");
    }
    if (!context.state.approvalWaitActive) {
      throw createProtocolError("file change approval arrived outside the approval wait state");
    }
    if (item.invalidError !== null) {
      rejectionReason = CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.ProposalRejected;
      throw new CodexAppServerError("file change item failed validation", {
        cause: item.invalidError,
      });
    }
    if (item.normalized === null) {
      throw createProtocolError("file change item was missing normalized changes");
    }

    context.state.approvalInFlight = true;
    const proposal = createFileChangeProposal(threadId, turnId, item.normalized);
    let authorization: unknown;
    try {
      authorization = await context.config.authorizeFileChange({
        ...proposal,
        changes: proposal.changes.map((change) => ({ ...change })),
      });
    } catch {
      cancelAuthorization(
        context,
        requestId,
        item,
        itemId,
        reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.CallbackError),
      );
      context.state.approvalInFlight = false;
      context.fail(
        new CodexAppServerError("authorizeFileChange failed"),
        CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
      );
      return;
    }
    if (context.state.failure !== null) {
      context.state.approvalInFlight = false;
      return;
    }

    if (!isPlainRecord(authorization)) {
      cancelAuthorization(
        context,
        requestId,
        item,
        itemId,
        reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidAuthorization),
      );
      context.state.approvalInFlight = false;
      context.fail(
        new CodexAppServerError("authorizeFileChange returned an invalid result"),
        CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
      );
      return;
    }

    const approvedField = readOwnDataField(authorization, "approved");
    if (!approvedField.present || approvedField.value !== true) {
      const explicitlyDenied = approvedField.present && approvedField.value === false;
      const evidence = explicitlyDenied
        ? deniedAuthorizationEvidence(readOwnDataField(authorization, "evidence"))
        : reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidAuthorization);
      cancelAuthorization(context, requestId, item, itemId, evidence);
      context.state.approvalInFlight = false;
      if (explicitlyDenied) {
        context.state.policyDenied = true;
        context.fail(null, CODEX_APP_SERVER_TERMINATION_REASONS.PolicyDenied);
      } else {
        context.fail(
          new CodexAppServerError("authorizeFileChange result must explicitly set approved"),
          CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
        );
      }
      return;
    }

    const evidenceField = readOwnDataField(authorization, "evidence");
    if (
      !evidenceField.present ||
      evidenceField.value === undefined ||
      evidenceField.value === null
    ) {
      cancelAuthorization(
        context,
        requestId,
        item,
        itemId,
        reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.MissingEvidence),
      );
      context.state.approvalInFlight = false;
      context.fail(
        new CodexAppServerError("authorizeFileChange must return evidence when approved"),
        CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
      );
      return;
    }

    let evidenceDigest: string;
    try {
      evidenceDigest = calculateCanonicalJsonSha256(evidenceField.value);
    } catch {
      cancelAuthorization(
        context,
        requestId,
        item,
        itemId,
        reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidEvidence),
      );
      context.state.approvalInFlight = false;
      context.fail(
        new CodexAppServerError("authorizeFileChange returned invalid evidence"),
        CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
      );
      return;
    }

    sendDecision(context, requestId, CODEX_APP_SERVER_APPROVAL_DECISIONS.Accept);
    item.approval = CodexAppServerApprovalState.Accepted;
    context.state.authorizations.push({
      itemId,
      decision: CODEX_APP_SERVER_APPROVAL_DECISIONS.Accept,
      evidenceDigest,
    });
    context.state.approvedCount += 1;
    context.state.approvalInFlight = false;
  } catch (error) {
    if (!context.state.respondedServerRequestIds.has(requestId)) {
      try {
        if (itemId === null) {
          sendDecision(context, requestId, CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel);
        } else {
          cancelAuthorization(context, requestId, item, itemId, reasonEvidence(rejectionReason));
        }
      } catch (sendError) {
        context.fail(sendError, CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError);
        return;
      }
    }
    context.state.approvalInFlight = false;
    context.fail(error, CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError);
  }
}
