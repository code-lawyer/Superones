import "server-only";

import { createHash } from "node:crypto";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";

export type FrontierPublicObservationTask = {
  taskId: string;
  season: string;
  submissionId: string;
  owner: string;
  repo: string;
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
    return parsed;
  },
};

function taskId(season: string, submissionId: string) {
  return `frontier:${createHash("sha256").update(`${season}:${submissionId}`).digest("hex").slice(0, 32)}`;
}

export async function enqueueFrontierObservationTask(input: {
  season: string;
  submissionId: string;
  owner: string;
  repo: string;
}) {
  return mutateStateDocument(taskDocument, (store) => {
    const id = taskId(input.season, input.submissionId);
    const existing = store.tasks.find((task) => task.taskId === id);
    if (existing) return existing;
    const task: FrontierPublicObservationTask = {
      taskId: id,
      ...input,
      requestedAt: new Date().toISOString(),
      lastDispatchedAt: null,
      dispatches: 0,
    };
    store.tasks.push(task);
    store.tasks = store.tasks.slice(-5_000);
    return task;
  });
}

export async function dispatchFrontierObservationTasks(limit = 200) {
  return mutateStateDocument(taskDocument, (store) => {
    const now = new Date().toISOString();
    const selected = store.tasks
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .slice(0, Math.max(1, Math.min(500, limit)));
    for (const task of selected) {
      task.lastDispatchedAt = now;
      task.dispatches += 1;
    }
    return selected.map((task) => ({ ...task }));
  });
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
