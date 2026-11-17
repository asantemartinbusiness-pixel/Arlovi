import type { Rec } from "@/domain/types";
import { LANES, stageOf, type LaneId } from "./board";

/** Shared by task details, the project board and keyboard/drag movements. */
export interface TaskMoveDecision {
  blocked?: string;
  needsReviewDecision: boolean;
  incompleteDependencies: string[];
}

export function taskMoveDecision(task: Rec, destination: LaneId, projectTasks: Rec[]): TaskMoveDecision {
  const result: TaskMoveDecision = { needsReviewDecision: false, incompleteDependencies: [] };
  if (task.collection !== "tasks" || !LANES.some((lane) => lane.id === destination)) {
    return { ...result, blocked: "Select a valid task and destination stage." };
  }
  if (stageOf(task) === destination) return { ...result, blocked: "This task is already in that stage." };
  if (destination !== "done") return result;

  const ids = String(task.fields.dependsOn ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  for (const id of ids) {
    const dependency = projectTasks.find((item) =>
      item.id === id && item.collection === "tasks"
      && item.organizationId === task.organizationId
      && item.parentId === task.parentId);
    if (!dependency) {
      result.incompleteDependencies.push(`Missing or unrelated task ${id}`);
    } else if (stageOf(dependency) !== "done") {
      result.incompleteDependencies.push(dependency.title);
    }
  }
  if (result.incompleteDependencies.length) {
    result.blocked = `Finish or repair dependencies first: ${result.incompleteDependencies.join(", ")}.`;
    return result;
  }
  result.needsReviewDecision = String(task.fields.priority ?? "normal") === "high" && stageOf(task) !== "review";
  return result;
}

export function positiveHours(value: unknown): number {
  const hours = Number(value);
  if (typeof value === "string" && !value.trim()) throw new Error("Enter an estimate in hours.");
  if (!Number.isFinite(hours) || hours < 0 || !Number.isSafeInteger(Math.round(hours * 100))) {
    throw new Error("The estimate must be a valid non-negative number of hours.");
  }
  return hours;
}
