import { useState } from "react";
import { Button, Field, Notice, Stack, TextArea } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import type { Rec } from "@/domain/types";

/* Rendered inside the obligation quick view (panels.tsx); kept out of actions.tsx so the two do not import each other. */

export function RecordReview({ context, obligation }: { context: ScreenContext; obligation: Rec }) {
  const [note, setNote] = useState("");
  return (
    <Stack gap={2}>
      <Field label="Review note" hint={obligation.fields.reviewedBy ? `Last reviewed by ${String(obligation.fields.reviewedBy)} ${context.relative(String(obligation.fields.reviewedAt ?? ""))}` : "Not reviewed yet"}>
        <TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {String(obligation.fields.jurisdiction ?? "") !== "" && String(obligation.fields.jurisdiction) !== context.org.jurisdiction && (
        <Notice tone="warning" title="Different jurisdiction">This obligation is under {String(obligation.fields.jurisdiction)}, not {context.org.jurisdiction}. Its interpretation needs legal review.</Notice>
      )}
      <Button variant="secondary" disabled={!note.trim()} onClick={async () => {
        await context.mutate.patch(obligation.id, { fields: { ...obligation.fields, reviewedBy: context.actor, reviewedAt: new Date().toISOString(), reviewNote: note.trim() } }, { expectRevision: obligation.revision, event: `${obligation.title} reviewed by ${context.actor}: ${note.trim()}` });
        setNote("");
        context.toast("Review recorded", `${obligation.title} is marked reviewed by ${context.actor}. This is not legal advice.`);
      }}>Record my review</Button>
    </Stack>
  );
}

