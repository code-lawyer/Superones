import "server-only";

import { createHash } from "node:crypto";
import { removePendingSubmissions } from "./frontier/submissions.ts";
import { mutateStateDocument, readStateDocument, withPersistenceTransaction, type StateDocumentDefinition } from "./state-document-store.ts";

export type FrontierPublicObservationTask = {
  taskId: string;
  kind: "inspect_submission" | "verify_submission" | "observe_stars";
  season: string;
  submissionId: string;
  owner: string;
  repo: string;
  expiresAt: string | null;
  requestedAt: string;
  lastDispatchedAt: string | null;
  dispatches: number;
};

type FrontierPublicTaskStore = {
  version: 1;
  tasks: FrontierPublicObservationTask[];
};

const taskDocument: StateDocumentDefinition<FrontierPublicTaskStore> = {
  namespace: "frontier-public-tasks",
  fileName: "frontier-public-tasks.json",
  create: () => ({ version: 1, tasks: [] }),
  parse: (value) => {
    const parsed = value as FrontierPublicTaskStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      throw new Error("Frontier 公开回退任务格式无效。");
    }
    return {
      ...parsed,
      tasks: parsed.tasks.map((task) => {
        const kind = task.kind ?? "observe_stars";
        const requestedAt = Date.parse(task.requestedAt);
        return {
          ...task,
          kind,
          expiresAt: task.expiresAt ?? (
            kind !== "observe_stars" && Number.isFinite(requestedAt)
              ? new Date(requestedAt + 24 * 60 * 60 * 1000).toISOString()
              : null
          ),
        };
      }),
    };
  },
};

function taskId(season: string, submissionId: string) {
  return `frontier:${createHash("sha256").update(`${season}:${submissionId}`).digest("hex").slice(0, 32)}`;
}

export async function enqueueFrontierObservationTask(input: {
  kind?: FrontierPublicObservationTask["kind"];
  season: string;
  submissionId: string;
  owner: string;
  repo: string;
  expiresAt?: string;
  now?: Date;
}) {
  return mutateStateDocument(taskDocument, (store) => {
    const id = taskId(input.season, input.submissionId);
    const existing = store.tasks.find((task) => task.taskId === id);
    if (existing) {
      const requestedKind = input.kind ?? "observe_stars";
      const priority = { observe_stars: 0, inspect_submission: 1, verify_submission: 2 } as const;
      if (priority[requestedKind] > priority[existing.kind]) {
        existing.kind = requestedKind;
      }
      if (input.expiresAt) existing.expiresAt = input.expiresAt;
      return existing;
    }
    const task: FrontierPublicObservationTask = {
      taskId: id,
      kind: input.kind ?? "observe_stars",
      season: input.season,
      submissionId: input.submissionId,
      owner: input.owner,
      repo: input.repo,
      expiresAt: input.expiresAt ?? null,
      requestedAt: (input.now ?? new Date()).toISOString(),
      lastDispatchedAt: null,
      dispatches: 0,
    };
    store.tasks.push(task);
    store.tasks = store.tasks.slice(-5_000);
    return task;
  });
}

export async function dispatchFrontierObservationTasks(limit = 200, now = new Date()) {
  return withPersistenceTransaction(() => mutateStateDocument(taskDocument, async (store) => {
    const expiredSubmissionIds = store.tasks
      .filter((task) => task.expiresAt && Date.parse(task.expiresAt) <= now.getTime())
      .map((task) => task.submissionId);
    await removePendingSubmissions(expiredSubmissionIds);
    const expired = new Set(expiredSubmissionIds);
    store.tasks = store.tasks.filter((task) => !expired.has(task.submissionId));
    const dispatchedAt = now.toISOString();
    const selected = store.tasks
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .slice(0, Math.max(1, Math.min(500, limit)));
    for (const task of selected) {
      task.lastDispatchedAt = dispatchedAt;
      task.dispatches += 1;
    }
    return selected.map((task) => ({ ...task }));
  }));
}

export async function completeFrontierObservationTasks(submissionIds: readonly string[]) {
  if (submissionIds.length === 0) return 0;
  const completed = new Set(submissionIds);
  return mutateStateDocument(taskDocument, (store) => {
    const before = store.tasks.length;
    store.tasks = store.tasks.filter((task) => !completed.has(task.submissionId));
    return before - store.tasks.length;
  });
}

export async function frontierObservationTaskStats() {
  const store = await readStateDocument(taskDocument);
  return {
    pending: store.tasks.length,
    oldestRequestedAt: store.tasks
      .map((task) => task.requestedAt)
      .sort()[0] ?? null,
    dispatches: store.tasks.reduce((sum, task) => sum + task.dispatches, 0),
  };
}
