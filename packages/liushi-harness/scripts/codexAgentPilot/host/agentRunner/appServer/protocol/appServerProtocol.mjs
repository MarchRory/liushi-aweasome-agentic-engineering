import { createHash } from "node:crypto";

import {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_APPROVAL_POLICY,
  CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS,
  CODEX_APP_SERVER_GRANT_ROOT_FIELDS,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_INPUT_TYPES,
  CODEX_APP_SERVER_JSON_RPC_ERRORS,
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_PERMISSIONS,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_REQUEST_IDS,
  CODEX_APP_SERVER_REMOTE_CONTROL_STATUS,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_TERMINATION_REASONS,
  CODEX_APP_SERVER_THREAD_STATUS,
  CODEX_APP_SERVER_TURN_STATUSES,
} from "../codexAppServerConstants.mjs";
import { calculateCanonicalJsonSha256 } from "../audit/index.mjs";
import {
  changesEqual,
  createFileChangeProposal,
  normalizeChanges,
  normalizeFileChangeItem,
} from "../validation/index.mjs";
import { pathIdentity } from "../platform/index.mjs";

const FILE_ITEM_STATE = Object.freeze({ FileChange: "file-change", Other: "other" });
const APPROVAL_STATE = Object.freeze({ Accepted: "accepted", Denied: "denied" });
const SAFE_ITEM_TYPES = new Set([
  CODEX_APP_SERVER_ITEM_TYPES.AgentMessage,
  CODEX_APP_SERVER_ITEM_TYPES.ContextCompaction,
  CODEX_APP_SERVER_ITEM_TYPES.HookPrompt,
  CODEX_APP_SERVER_ITEM_TYPES.Plan,
  CODEX_APP_SERVER_ITEM_TYPES.Reasoning,
  CODEX_APP_SERVER_ITEM_TYPES.UserMessage,
]);
const SAFE_PROGRESS_METHODS = new Set([
  CODEX_APP_SERVER_METHODS.TurnDiffUpdated,
  CODEX_APP_SERVER_METHODS.ThreadTokenUsageUpdated,
  CODEX_APP_SERVER_METHODS.AgentMessageDelta,
  CODEX_APP_SERVER_METHODS.PlanDelta,
  CODEX_APP_SERVER_METHODS.ReasoningSummaryTextDelta,
  CODEX_APP_SERVER_METHODS.ReasoningTextDelta,
]);
const KNOWN_METHODS = new Set(Object.values(CODEX_APP_SERVER_METHODS));

export function createCodexAppServerProtocol(config, io) {
  const state = {
    phase: CODEX_APP_SERVER_PROTOCOL_PHASES.Created,
    pendingRequests: new Map(),
    respondedServerRequestIds: new Set(),
    threadId: null,
    turnId: null,
    threadStarted: false,
    turnStarted: false,
    turnCompleted: false,
    items: new Map(),
    fileChangeItems: new Map(),
    changePaths: new Set(),
    approvalInFlight: false,
    approvalWaitActive: false,
    approvalWaitCleared: false,
    approvalWaitObserved: false,
    idleObserved: false,
    policyDenied: false,
    failure: null,
    outcome: null,
    eventCount: 0,
    responseCount: 0,
    requestCount: 0,
    notificationCount: 0,
    methodCounts: new Map(),
    unknownMethodCount: 0,
    unknownMethods: new Set(),
    completedFileChangeCount: 0,
    approvedCount: 0,
    cancelledCount: 0,
    authorizations: [],
    threadStatusTransitions: [],
    changeDigest: createHash("sha256"),
  };

  return {
    start,
    handleLine,
    fail,
    abort,
    finalize,
    getEvidence,
    getFailure: () => state.failure,
    getOutcome: () => state.outcome,
    getPolicyDenied: () => state.policyDenied,
  };

  function start() {
    if (state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.Created) {
      throw new Error("app-server protocol already started");
    }
    state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.InitializePending;
    sendRequest(CODEX_APP_SERVER_REQUEST_IDS.Initialize, CODEX_APP_SERVER_METHODS.Initialize, {
      clientInfo: {
        name: "liushi-harness",
        title: "liushi-harness",
        version: "0.0.0",
      },
      capabilities: { experimentalApi: true },
    });
  }

  async function handleLine(line) {
    if (state.failure !== null) return;
    state.eventCount += 1;
    let message;
    try {
      message = JSON.parse(line);
    } catch (cause) {
      fail(createProtocolError("server emitted invalid JSONL", cause));
      return;
    }
    if (!isRecord(message)) {
      fail(createProtocolError("server emitted a non-object JSONL message"));
      return;
    }

    try {
      const hasMethod = Object.hasOwn(message, "method");
      const hasId = Object.hasOwn(message, "id");
      if (hasMethod) {
        requireMethod(message.method);
        recordMethod(message.method);
        if (hasId) {
          state.requestCount += 1;
          await handleServerRequest(message);
        } else {
          state.notificationCount += 1;
          await handleNotification(message.method, message.params);
        }
        return;
      }
      if (hasId) {
        state.responseCount += 1;
        handleResponse(message);
        return;
      }
      throw createProtocolError("server emitted a message without method or id");
    } catch (error) {
      fail(asProtocolError(error));
    }
  }

  function fail(error, reason = CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError) {
    if (error !== null && error !== undefined) state.failure ??= asProtocolError(error);
    io.requestTermination(reason);
  }

  function abort(reason) {
    state.approvalInFlight = false;
    state.failure ??= new Error(`app-server protocol aborted: ${String(reason)}`);
  }

  function finalize(processInfo) {
    if (state.failure !== null) throw attachProcessState(state.failure, processInfo);
    if (state.policyDenied) {
      return {
        outcome: CODEX_APP_SERVER_OUTCOMES.Denied,
        process: processInfo,
        protocolEvidence: getEvidence(),
      };
    }
    if (!state.turnCompleted || state.outcome === null) {
      throw attachProcessState(
        createProtocolError("app-server closed before a terminal turn/completed"),
        processInfo,
      );
    }
    return {
      outcome: state.outcome,
      process: processInfo,
      protocolEvidence: getEvidence(),
    };
  }

  function getEvidence() {
    return {
      threadId: state.threadId,
      turnId: state.turnId,
      eventCount: state.eventCount,
      responseCount: state.responseCount,
      requestCount: state.requestCount,
      notificationCount: state.notificationCount,
      methodCounts: Object.fromEntries([...state.methodCounts.entries()].sort()),
      unknownMethodCount: state.unknownMethodCount,
      unknownMethods: [...state.unknownMethods].sort(),
      itemCount: state.items.size,
      fileChangeItemCount: state.fileChangeItems.size,
      completedFileChangeCount: state.completedFileChangeCount,
      approvedCount: state.approvedCount,
      cancelledCount: state.cancelledCount,
      authorizations: [...state.authorizations]
        .sort(compareAuthorizationItemIds)
        .map((authorization) => ({ ...authorization })),
      threadStatusTransitions: state.threadStatusTransitions.map(cloneThreadStatusTransition),
      changeDigest: state.changeDigest.copy().digest("hex"),
    };
  }

  function handleResponse(message) {
    const request = state.pendingRequests.get(message.id);
    if (request === undefined) {
      throw createProtocolError("server returned an unknown or duplicate response id");
    }
    state.pendingRequests.delete(message.id);
    if (message.error !== undefined) {
      throw createProtocolError(`${request.method} returned a JSON-RPC error`);
    }
    if (!isRecord(message.result)) {
      throw createProtocolError(`${request.method} returned an invalid result`);
    }

    if (request.method === CODEX_APP_SERVER_METHODS.Initialize) {
      if (state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.InitializePending) {
        throw createProtocolError("initialize response arrived out of order");
      }
      sendNotification(CODEX_APP_SERVER_METHODS.Initialized, {});
      state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.ThreadPending;
      sendRequest(
        CODEX_APP_SERVER_REQUEST_IDS.ThreadStart,
        CODEX_APP_SERVER_METHODS.ThreadStart,
        createThreadStartParams(),
      );
      return;
    }

    if (request.method === CODEX_APP_SERVER_METHODS.ThreadStart) {
      if (state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.ThreadPending) {
        throw createProtocolError("thread/start response arrived out of order");
      }
      registerThreadId(readThreadId(message.result), "thread/start response");
      state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.TurnPending;
      sendRequest(
        CODEX_APP_SERVER_REQUEST_IDS.TurnStart,
        CODEX_APP_SERVER_METHODS.TurnStart,
        createTurnStartParams(),
      );
      return;
    }

    if (request.method === CODEX_APP_SERVER_METHODS.TurnStart) {
      if (state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.TurnPending) {
        throw createProtocolError("turn/start response arrived out of order");
      }
      registerTurnId(readTurnId(message.result), "turn/start response");
      state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.Running;
      return;
    }

    throw createProtocolError("client request method was not recognized");
  }

  async function handleServerRequest(message) {
    if (!isRpcId(message.id)) throw createProtocolError("server request id is invalid");
    if (message.method !== CODEX_APP_SERVER_METHODS.FileChangeRequestApproval) {
      sendProtocolError(message.id, CODEX_APP_SERVER_JSON_RPC_ERRORS.MethodNotFound);
      throw createProtocolError("unknown server request");
    }
    await handleFileChangeApproval(message);
  }

  async function handleFileChangeApproval(message) {
    let itemId = null;
    let item = null;
    let rejectionReason = CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.ProtocolRejected;
    try {
      if (state.respondedServerRequestIds.has(message.id)) {
        throw createProtocolError("server approval request id was repeated");
      }
      const params = requireRecord(message.params, "file change approval params");
      const threadId = requireIdentifier(params.threadId, "approval threadId");
      const turnId = requireIdentifier(params.turnId, "approval turnId");
      itemId = requireIdentifier(params.itemId, "approval itemId");
      assertContext(threadId, turnId, "file change approval");
      assertGrantRootIsEmpty(params);

      item = state.fileChangeItems.get(itemId);
      if (item === undefined) {
        throw createProtocolError("file change approval arrived without a prior item/started");
      }
      if (item.approval !== null || state.approvalInFlight) {
        throw createProtocolError("file change approval was repeated or concurrent");
      }
      if (!state.approvalWaitActive) {
        throw createProtocolError("file change approval arrived outside the approval wait state");
      }
      if (item.invalidError !== null) {
        rejectionReason = CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.ProposalRejected;
        throw new Error("file change item failed validation", { cause: item.invalidError });
      }

      state.approvalInFlight = true;
      const proposal = createFileChangeProposal(threadId, turnId, item.normalized);
      let authorization;
      try {
        authorization = await config.authorizeFileChange({
          ...proposal,
          changes: proposal.changes.map((change) => ({ ...change })),
        });
      } catch {
        cancelAuthorization(
          message.id,
          itemId,
          item,
          reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.CallbackError),
        );
        state.approvalInFlight = false;
        fail(
          new Error("authorizeFileChange failed"),
          CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
        );
        return;
      }
      if (state.failure !== null) {
        state.approvalInFlight = false;
        return;
      }

      if (!isPlainRecord(authorization)) {
        cancelAuthorization(
          message.id,
          itemId,
          item,
          reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidAuthorization),
        );
        state.approvalInFlight = false;
        fail(
          new Error("authorizeFileChange returned an invalid result"),
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
        cancelAuthorization(message.id, itemId, item, evidence);
        state.approvalInFlight = false;
        if (explicitlyDenied) {
          state.policyDenied = true;
          fail(null, CODEX_APP_SERVER_TERMINATION_REASONS.PolicyDenied);
        } else {
          fail(
            new Error("authorizeFileChange result must explicitly set approved"),
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
          message.id,
          itemId,
          item,
          reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.MissingEvidence),
        );
        state.approvalInFlight = false;
        fail(
          new Error("authorizeFileChange must return evidence when approved"),
          CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
        );
        return;
      }

      let evidenceDigest;
      try {
        evidenceDigest = calculateCanonicalJsonSha256(evidenceField.value);
      } catch {
        cancelAuthorization(
          message.id,
          itemId,
          item,
          reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidEvidence),
        );
        state.approvalInFlight = false;
        fail(
          new Error("authorizeFileChange returned invalid evidence"),
          CODEX_APP_SERVER_TERMINATION_REASONS.AuthorizationError,
        );
        return;
      }

      sendAuditedDecision(
        message.id,
        itemId,
        CODEX_APP_SERVER_APPROVAL_DECISIONS.Accept,
        evidenceDigest,
      );
      item.approval = APPROVAL_STATE.Accepted;
      state.approvedCount += 1;
      state.approvalInFlight = false;
    } catch (error) {
      if (!state.respondedServerRequestIds.has(message.id)) {
        try {
          if (itemId === null) {
            sendDecision(message.id, CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel);
          } else {
            cancelAuthorization(message.id, itemId, item, reasonEvidence(rejectionReason));
          }
        } catch (sendError) {
          fail(sendError, CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError);
          return;
        }
      }
      state.approvalInFlight = false;
      fail(error, CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError);
    }
  }

  async function handleNotification(method, params) {
    if (method === CODEX_APP_SERVER_METHODS.ThreadStarted) {
      const value = requireRecord(params, "thread/started params");
      registerThreadId(readThreadId(value), "thread/started");
      if (state.threadStarted) throw createProtocolError("thread/started was repeated");
      state.threadStarted = true;
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.TurnStarted) {
      const value = requireRecord(params, "turn/started params");
      const threadId = requireIdentifier(value.threadId, "turn/started threadId");
      const turnId = readTurnId(value);
      registerTurnId(turnId, "turn/started");
      assertContext(threadId, turnId, "turn/started");
      if (state.turnStarted) throw createProtocolError("turn/started was repeated");
      state.turnStarted = true;
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.ItemStarted) {
      handleItemStarted(requireRecord(params, "item/started params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.ItemCompleted) {
      handleItemCompleted(requireRecord(params, "item/completed params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.TurnCompleted) {
      handleTurnCompleted(requireRecord(params, "turn/completed params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.FileChangePatchUpdated) {
      handleFileChangePatchUpdated(requireRecord(params, "file change patch params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.ServerRequestResolved) {
      handleServerRequestResolved(requireRecord(params, "serverRequest/resolved params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.RemoteControlStatusChanged) {
      handleRemoteControlStatusChanged(
        requireRecord(params, "remoteControl/status/changed params"),
      );
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.ThreadStatusChanged) {
      handleThreadStatusChanged(requireRecord(params, "thread/status/changed params"));
      return;
    }
    if (method === CODEX_APP_SERVER_METHODS.AccountRateLimitsUpdated) {
      requireRecord(
        requireRecord(params, "account/rateLimits/updated params").rateLimits,
        "account/rateLimits/updated rateLimits",
      );
      return;
    }
    if (isSafeProgressNotification(method)) {
      assertOptionalContext(params, method);
      return;
    }
    throw createProtocolError("unknown server notification");
  }

  function handleItemStarted(params) {
    const threadId = requireIdentifier(params.threadId, "item/started threadId");
    const turnId = requireIdentifier(params.turnId, "item/started turnId");
    assertContext(threadId, turnId, "item/started");
    const item = requireRecord(params.item, "item/started item");
    const itemId = requireIdentifier(item.id, "item/started item.id");
    assertOptionalItemId(params, itemId, "item/started");
    if (state.items.has(itemId)) throw createProtocolError("item/started was repeated");

    if (
      item.type === CODEX_APP_SERVER_ITEM_TYPES.FileChange ||
      item.type === CODEX_APP_SERVER_ITEM_TYPES.FileChangeLegacy
    ) {
      let normalized = null;
      let invalidError = null;
      try {
        normalized = normalizeFileChangeItem(item, config.allowedPaths);
        for (const change of normalized.changes) {
          const identity = pathIdentity(change.path);
          if (state.changePaths.has(identity)) {
            throw createProtocolError("file change path was repeated");
          }
          state.changePaths.add(identity);
          state.changeDigest.update(JSON.stringify(change));
        }
      } catch (error) {
        invalidError = error;
      }
      const record = {
        kind: FILE_ITEM_STATE.FileChange,
        id: itemId,
        normalized,
        invalidError,
        approval: null,
        completed: false,
      };
      state.items.set(itemId, record);
      state.fileChangeItems.set(itemId, record);
      return;
    }

    if (!SAFE_ITEM_TYPES.has(item.type)) {
      throw createProtocolError("unsupported item type was emitted");
    }
    state.items.set(itemId, {
      kind: FILE_ITEM_STATE.Other,
      id: itemId,
      type: item.type,
      completed: false,
    });
  }

  function handleItemCompleted(params) {
    const threadId = requireIdentifier(params.threadId, "item/completed threadId");
    const turnId = requireIdentifier(params.turnId, "item/completed turnId");
    assertContext(threadId, turnId, "item/completed");
    const item = requireRecord(params.item, "item/completed item");
    const itemId = requireIdentifier(item.id, "item/completed item.id");
    assertOptionalItemId(params, itemId, "item/completed");
    const record = state.items.get(itemId);
    if (record === undefined || record.completed) {
      throw createProtocolError("item/completed did not match one started item");
    }

    if (record.kind === FILE_ITEM_STATE.FileChange) {
      if (record.invalidError !== null) {
        throw new Error("item/completed file change was invalid", { cause: record.invalidError });
      }
      const normalized = normalizeFileChangeItem(item, config.allowedPaths, "item/completed item");
      if (!changesEqual(record.normalized.changes, normalized.changes)) {
        throw createProtocolError("item/completed changes did not match item/started");
      }
      if (record.approval === APPROVAL_STATE.Accepted) {
        if (item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Completed) {
          throw createProtocolError("approved file change did not complete successfully");
        }
      } else if (record.approval === null) {
        throw createProtocolError("file change completed without an approval decision");
      } else if (
        item.status === CODEX_APP_SERVER_ITEM_STATUSES.Completed ||
        (item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Failed &&
          item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Declined)
      ) {
        throw createProtocolError("cancelled file change had an invalid terminal status");
      }
      record.completed = true;
      state.completedFileChangeCount += 1;
      return;
    }

    if (item.type !== record.type) throw createProtocolError("item/completed type did not match");
    record.completed = true;
  }

  function handleFileChangePatchUpdated(params) {
    const threadId = requireIdentifier(params.threadId, "file change patch threadId");
    const turnId = requireIdentifier(params.turnId, "file change patch turnId");
    const itemId = requireIdentifier(params.itemId, "file change patch itemId");
    assertContext(threadId, turnId, "file change patch");
    const record = state.fileChangeItems.get(itemId);
    if (record === undefined) throw createProtocolError("file change patch has no prior item");
    const changes = normalizeChanges(
      params.changes,
      config.allowedPaths,
      "file change patch changes",
    );
    if (!changesEqual(record.normalized.changes, changes)) {
      throw createProtocolError("file change patch changed the approved path set");
    }
  }

  function handleTurnCompleted(params) {
    const threadId = requireIdentifier(params.threadId, "turn/completed threadId");
    const turnId = readTurnId(params);
    assertContext(threadId, turnId, "turn/completed");
    if (state.turnCompleted) throw createProtocolError("turn/completed was repeated");
    const status = readTurnStatus(params);
    if (status === CODEX_APP_SERVER_TURN_STATUSES.InProgress) {
      throw createProtocolError("turn/completed cannot be in progress");
    }

    state.turnCompleted = true;
    if (status === CODEX_APP_SERVER_TURN_STATUSES.Completed) {
      assertSuccessfulFileChanges();
      state.outcome = CODEX_APP_SERVER_OUTCOMES.Succeeded;
    } else if (status === CODEX_APP_SERVER_TURN_STATUSES.Interrupted) {
      state.outcome = CODEX_APP_SERVER_OUTCOMES.Interrupted;
    } else if (status === CODEX_APP_SERVER_TURN_STATUSES.Failed) {
      state.outcome = CODEX_APP_SERVER_OUTCOMES.Failed;
    } else {
      throw createProtocolError("turn/completed status is invalid");
    }
    state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.Completed;
    io.closeInput();
  }

  function handleServerRequestResolved(params) {
    const requestId = params.requestId;
    if (!isRpcId(requestId) || !state.respondedServerRequestIds.has(requestId)) {
      throw createProtocolError("serverRequest/resolved did not match an approval response");
    }
  }

  function handleRemoteControlStatusChanged(params) {
    if (
      params.status !== CODEX_APP_SERVER_REMOTE_CONTROL_STATUS.Disabled ||
      typeof params.serverName !== "string" ||
      params.serverName.length === 0 ||
      typeof params.installationId !== "string" ||
      params.installationId.length === 0 ||
      params.environmentId !== null
    ) {
      throw createProtocolError("remote control must remain disabled");
    }
  }

  function handleThreadStatusChanged(params) {
    const threadId = requireIdentifier(params.threadId, "thread/status/changed threadId");
    if (state.threadId === null || threadId !== state.threadId) {
      throw createProtocolError("thread/status/changed thread identity did not match");
    }
    const transition = normalizeThreadStatusTransition(
      requireRecord(params.status, "thread/status/changed status"),
    );
    assertRequiredThreadStatusTransition(transition);
    if (transition.type === CODEX_APP_SERVER_THREAD_STATUS.Active) {
      if (transition.activeFlags.length === 0) {
        if (state.approvalWaitActive) {
          if (state.approvedCount + state.cancelledCount !== 1) {
            throw createProtocolError("approval wait state cleared before a decision");
          }
          state.approvalWaitActive = false;
          state.approvalWaitCleared = true;
        }
        state.threadStatusTransitions.push(transition);
        return;
      }
      if (
        state.approvalWaitObserved ||
        state.approvalWaitActive ||
        state.fileChangeItems.size !== 1 ||
        [...state.fileChangeItems.values()].some((item) => item.approval !== null)
      ) {
        throw createProtocolError("approval wait state did not match one pending file change");
      }
      state.approvalWaitObserved = true;
      state.approvalWaitActive = true;
      state.threadStatusTransitions.push(transition);
      return;
    }
    if (
      !state.approvalWaitObserved ||
      !state.approvalWaitCleared ||
      state.approvalWaitActive ||
      state.approvalInFlight ||
      state.completedFileChangeCount !== state.fileChangeItems.size
    ) {
      throw createProtocolError("thread became idle before the approved file change completed");
    }
    state.idleObserved = true;
    state.threadStatusTransitions.push(transition);
  }

  function assertSuccessfulFileChanges() {
    if (state.fileChangeItems.size === 0) {
      throw createProtocolError("turn completed without a file change item");
    }
    for (const item of state.fileChangeItems.values()) {
      if (item.approval !== APPROVAL_STATE.Accepted || !item.completed) {
        throw createProtocolError("turn completed without a completed approved file change");
      }
    }
    if (
      !state.approvalWaitObserved ||
      !state.approvalWaitCleared ||
      state.approvalWaitActive ||
      !state.idleObserved ||
      state.threadStatusTransitions.length !==
        CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.length
    ) {
      throw createProtocolError("turn completed without the required approval status transitions");
    }
  }

  function assertRequiredThreadStatusTransition(actual) {
    const expected =
      CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS[state.threadStatusTransitions.length];
    if (
      expected === undefined ||
      expected.type !== actual.type ||
      JSON.stringify(expected.activeFlags ?? []) !== JSON.stringify(actual.activeFlags ?? [])
    ) {
      throw createProtocolError("thread status transition sequence is invalid");
    }
  }

  function normalizeThreadStatusTransition(status) {
    if (status.type === CODEX_APP_SERVER_THREAD_STATUS.Active) {
      if (!hasExactKeys(status, ["activeFlags", "type"]) || !Array.isArray(status.activeFlags)) {
        throw createProtocolError("thread/status/changed active status is invalid");
      }
      if (status.activeFlags.length === 0) {
        return { type: CODEX_APP_SERVER_THREAD_STATUS.Active, activeFlags: [] };
      }
      if (
        status.activeFlags.length === 1 &&
        status.activeFlags[0] === CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval
      ) {
        return {
          type: CODEX_APP_SERVER_THREAD_STATUS.Active,
          activeFlags: [CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval],
        };
      }
      throw createProtocolError("thread active flags are not allowed by the restricted protocol");
    }
    if (status.type !== CODEX_APP_SERVER_THREAD_STATUS.Idle || !hasExactKeys(status, ["type"])) {
      throw createProtocolError("thread/status/changed status is invalid");
    }
    return { type: CODEX_APP_SERVER_THREAD_STATUS.Idle };
  }

  function cloneThreadStatusTransition(transition) {
    return transition.activeFlags === undefined
      ? { type: transition.type }
      : { type: transition.type, activeFlags: [...transition.activeFlags] };
  }

  function createThreadStartParams() {
    return {
      model: config.model,
      modelProvider: config.modelProvider,
      cwd: config.cwd,
      runtimeWorkspaceRoots: [...config.runtimeWorkspaceRoots],
      approvalPolicy: CODEX_APP_SERVER_APPROVAL_POLICY.OnRequest,
      permissions: CODEX_APP_SERVER_PERMISSIONS.ReadOnly,
      ephemeral: true,
    };
  }

  function createTurnStartParams() {
    return {
      threadId: state.threadId,
      input: [{ type: CODEX_APP_SERVER_INPUT_TYPES.Text, text: config.prompt }],
      model: config.model,
      modelProvider: config.modelProvider,
      cwd: config.cwd,
      runtimeWorkspaceRoots: [...config.runtimeWorkspaceRoots],
      approvalPolicy: CODEX_APP_SERVER_APPROVAL_POLICY.OnRequest,
      permissions: CODEX_APP_SERVER_PERMISSIONS.ReadOnly,
    };
  }

  function sendRequest(id, method, params) {
    if (state.pendingRequests.has(id)) throw new Error("client request id was repeated");
    state.pendingRequests.set(id, { method });
    io.send({ id, method, params });
  }

  function sendNotification(method, params) {
    io.send({ method, params });
  }

  function sendDecision(id, decision) {
    if (state.respondedServerRequestIds.has(id)) {
      throw createProtocolError("server approval request was answered more than once");
    }
    state.respondedServerRequestIds.add(id);
    if (decision === CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel) state.cancelledCount += 1;
    io.send({ id, result: { decision } });
  }

  function sendAuditedDecision(id, itemId, decision, evidenceDigest) {
    sendDecision(id, decision);
    state.authorizations.push({ itemId, decision, evidenceDigest });
  }

  function cancelAuthorization(id, itemId, item, evidence) {
    let evidenceDigest;
    try {
      evidenceDigest = calculateCanonicalJsonSha256(evidence);
    } catch {
      evidenceDigest = calculateCanonicalJsonSha256(
        reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidEvidence),
      );
    }
    sendAuditedDecision(id, itemId, CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel, evidenceDigest);
    if (item !== null && item !== undefined) item.approval = APPROVAL_STATE.Denied;
  }

  function sendProtocolError(id, code) {
    if (state.respondedServerRequestIds.has(id)) return;
    state.respondedServerRequestIds.add(id);
    io.send({
      id,
      error: { code, message: "Unsupported app-server request" },
    });
  }

  function registerThreadId(value, label) {
    const threadId = requireIdentifier(value, `${label}.threadId`);
    if (state.threadId !== null && state.threadId !== threadId) {
      throw createProtocolError("multiple thread ids were observed");
    }
    state.threadId = threadId;
  }

  function registerTurnId(value, label) {
    const turnId = requireIdentifier(value, `${label}.turnId`);
    if (state.turnId !== null && state.turnId !== turnId) {
      throw createProtocolError("multiple turn ids were observed");
    }
    state.turnId = turnId;
  }

  function assertContext(threadId, turnId, label) {
    if (state.threadId === null || state.turnId === null) {
      throw createProtocolError(`${label} arrived before thread/turn identity was established`);
    }
    if (threadId !== state.threadId || turnId !== state.turnId) {
      throw createProtocolError(`${label} thread/turn identity did not match`);
    }
  }

  function assertOptionalContext(params, label) {
    if (!isRecord(params)) return;
    if (params.threadId !== undefined || params.turnId !== undefined) {
      const threadId = requireIdentifier(params.threadId, `${label}.threadId`);
      const turnId = requireIdentifier(params.turnId, `${label}.turnId`);
      assertContext(threadId, turnId, label);
    }
  }

  function assertOptionalItemId(params, itemId, label) {
    if (params.itemId !== undefined) {
      const suppliedItemId = requireIdentifier(params.itemId, `${label}.itemId`);
      if (suppliedItemId !== itemId) throw createProtocolError(`${label} item id did not match`);
    }
  }

  function assertGrantRootIsEmpty(params) {
    for (const key of Object.values(CODEX_APP_SERVER_GRANT_ROOT_FIELDS)) {
      if (Object.hasOwn(params, key) && params[key] !== undefined && params[key] !== null) {
        throw createProtocolError("grantRoot must be null or omitted");
      }
    }
  }

  function recordMethod(method) {
    if (!KNOWN_METHODS.has(method)) {
      state.unknownMethodCount += 1;
      state.unknownMethods.add(method);
      return;
    }
    state.methodCounts.set(method, (state.methodCounts.get(method) ?? 0) + 1);
  }
}

function readThreadId(value) {
  const direct = value?.threadId;
  const nested = value?.thread?.id;
  if (direct !== undefined && nested !== undefined && direct !== nested) {
    throw createProtocolError("thread ids in one message did not match");
  }
  return direct ?? nested;
}

function readTurnId(value) {
  const direct = value?.turnId;
  const nested = value?.turn?.id;
  if (direct !== undefined && nested !== undefined && direct !== nested) {
    throw createProtocolError("turn ids in one message did not match");
  }
  return direct ?? nested;
}

function readTurnStatus(value) {
  return value?.status ?? value?.turn?.status;
}

function isSafeProgressNotification(method) {
  return SAFE_PROGRESS_METHODS.has(method);
}

function requireMethod(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw createProtocolError("server method is invalid");
  }
}

function requireIdentifier(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\0")
  ) {
    throw createProtocolError(`${label} is invalid`);
  }
  return value;
}

function isRpcId(value) {
  return (
    (typeof value === "string" && value.length > 0 && value.length <= 512) ||
    (Number.isSafeInteger(value) && value >= 0)
  );
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw createProtocolError(`${label} is invalid`);
  return value;
}

function createProtocolError(message, cause) {
  return new Error(message, cause === undefined ? undefined : { cause });
}

function asProtocolError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function attachProcessState(error, processInfo) {
  error.processStarted = true;
  error.processMayBeRunning = processInfo.processMayBeRunning;
  error.outcomeUnknown = processInfo.processMayBeRunning;
  error.terminationReason = processInfo.terminationReason;
  error.timedOut = processInfo.timedOut;
  error.outputLimitExceeded = processInfo.outputLimitExceeded;
  error.stderrLimitExceeded = processInfo.stderrLimitExceeded;
  error.protocolEvidence = processInfo.protocolEvidence ?? null;
  return error;
}

function deniedAuthorizationEvidence(evidenceField) {
  if (!evidenceField.present || evidenceField.value === undefined) {
    return reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.PolicyDenied);
  }
  return evidenceField.value;
}

function reasonEvidence(reason) {
  return { reason };
}

function readOwnDataField(value, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
      return { present: false, value: undefined };
    }
    return { present: true, value: descriptor.value };
  } catch {
    return { present: false, value: undefined };
  }
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function compareAuthorizationItemIds(left, right) {
  if (left.itemId < right.itemId) return -1;
  if (left.itemId > right.itemId) return 1;
  return 0;
}

function hasExactKeys(value, expectedKeys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
