import { Fragment, useMemo } from "react";
import { Notice, Row, Stack } from "@/design-system";

/* ------------------------------------------------------------------ *
 * Word-level comparison of two stored versions of a clause.
 *
 * A longest-common-subsequence walk over words, which is enough to show
 * what a counterparty actually changed. It is a reading aid: the signed
 * version is never rewritten by it.
 * ------------------------------------------------------------------ */

export type Segment = { kind: "same" | "removed" | "added"; text: string };

export function diffWords(before: string, after: string): Segment[] {
  const left = before.split(/(\s+)/).filter((token) => token !== "");
  const right = after.split(/(\s+)/).filter((token) => token !== "");
  const rows = left.length;
  const columns = right.length;

  // Guard against a pathological size; these are clauses, not books.
  if (rows * columns > 400_000) {
    return before === after ? [{ kind: "same", text: after }] : [{ kind: "removed", text: before }, { kind: "added", text: after }];
  }

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const segments: Segment[] = [];
  const push = (kind: Segment["kind"], text: string) => {
    const last = segments.at(-1);
    if (last && last.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (left[i] === right[j]) { push("same", left[i]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { push("removed", left[i]); i += 1; }
    else { push("added", right[j]); j += 1; }
  }
  while (i < rows) { push("removed", left[i]); i += 1; }
  while (j < columns) { push("added", right[j]); j += 1; }
  return segments;
}

export interface Version { label: string; at: string; author: string; text: string }

export function Redline({ before, after, beforeLabel, afterLabel }: {
  before: Version; after: Version; beforeLabel?: string; afterLabel?: string;
}) {
  const segments = useMemo(() => diffWords(before.text, after.text), [before.text, after.text]);
  const removed = segments.filter((segment) => segment.kind === "removed").length;
  const added = segments.filter((segment) => segment.kind === "added").length;

  return (
    <Stack gap={4}>
      <div className="lg-redline">
        <div className="lg-redline-pane">
          <div className="lg-redline-head">{beforeLabel ?? before.label} · {before.author}</div>
          <div className="lg-redline-body">{before.text}</div>
        </div>
        <div className="lg-redline-pane">
          <div className="lg-redline-head">{afterLabel ?? after.label} · {after.author}</div>
          <div className="lg-redline-body">
            {segments.map((segment, index) => (
              segment.kind === "same"
                ? <Fragment key={index}>{segment.text}</Fragment>
                : segment.kind === "removed"
                  ? <del key={index} className="lg-del">{segment.text}</del>
                  : <ins key={index} className="lg-ins">{segment.text}</ins>
            ))}
          </div>
        </div>
      </div>

      <Row gap={3} wrap>
        <span className="ds-subtle">
          <span className="ds-num">{removed}</span> deletions · <span className="ds-num">{added}</span> insertions, compared word by word.
        </span>
      </Row>

      <Notice tone="info" title="A reading aid, not an opinion">
        The comparison shows what changed between two stored versions. Whether a change matters is a question for a person with
        the authority to answer it; nothing here accepts or rejects anything.
      </Notice>
    </Stack>
  );
}
