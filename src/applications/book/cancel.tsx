import { useState } from "react";
import { Empty, Field, Notice, Pill, Properties, Select, TextArea } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { CHANGED_ELSEWHERE, ProviderBoundary } from "@/applications/market/kit";
import { bodyOf, DEPOSIT_LABEL, useBookData, type BookingBody } from "./data";
import { CANCEL_REASONS, cancellationFee, reasonError, reasonLabel } from "./availability";

/* ====================================================================== *
 * BOOK cancellation with a recorded reason. The notice policy and fee are
 * shown before anything changes; the fee is recorded as due for a person to
 * decide, never charged, and the customer is not notified automatically.
 * ====================================================================== */

export function CancelBooking({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const booking = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  if (!booking) return <Empty title="Select a booking" />;
  return <CancelBookingForm key={booking.id} context={context} close={close} booking={booking} />;
}

function CancelBookingForm({ context, close, booking }: { context: ScreenContext; close: () => void; booking: Rec }) {
  const data = useBookData();
  const { now } = useWorkspace();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [waive, setWaive] = useState(false);
  const [touched, setTouched] = useState(false);
  const service = data.services.find((item) => item.id === String(booking.fields.serviceId ?? ""));
  const noticeHours = Number(service?.fields.cancellationNoticeHours ?? 24);
  const feeBp = Number(service?.fields.cancellationFeeBp ?? 0);
  const fee = cancellationFee({ startAt: booking.startAt, now, noticeHours, feeBp, priceMinor: service?.amountMinor ?? booking.amountMinor ?? 0 });
  const finished = ["cancelled", "completed", "no_show"].includes(booking.status);
  const error = reasonError(reason, note);
  const depositPaid = String(booking.fields.depositState) === "paid_local";
  const feeDue = waive ? 0 : fee.feeMinor;

  return (
    <form
      id="cancel-booking"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (error || finished) return;
        const label = reasonLabel(CANCEL_REASONS, reason);
        const text = `Cancelled by ${context.actor}: ${label}${note.trim() ? ` — ${note.trim()}` : ""}.${fee.insideNotice ? ` Inside the ${noticeHours} hour notice period; fee ${waive ? "waived" : `${context.money(feeDue)} recorded as due for a person to decide`}.` : ""} Kept as a local record; no message was sent.`;
        const body = bodyOf<BookingBody>(booking, {});
        const saved = await context.mutate.patch(booking.id, {
          status: "cancelled",
          fields: {
            ...booking.fields,
            cancelledBy: context.actor, cancelledAt: now.toISOString(), cancellationReason: reason, cancellationNote: note.trim(),
            cancellationFeeMinor: feeDue, cancellationFeeWaived: fee.insideNotice && waive, cancellationInsideNotice: fee.insideNotice,
          },
          body: { ...body, messages: [...(body.messages ?? []), { at: now.toISOString(), direction: "out", body: text }] },
        }, { expectRevision: booking.revision, event: `${booking.title} cancelled by ${context.actor}: ${label}` });
        if (!saved) { context.toast("Changed elsewhere", CHANGED_ELSEWHERE, "failed"); return; }
        context.toast("Cancelled", `${booking.title} is cancelled (${label.toLowerCase()}) and its slot is free.${depositPaid ? " The deposit has to be returned outside this browser." : ""}`);
        close();
      }}
    >
      <Properties rows={[
        { label: "Booking", value: booking.title },
        { label: "Starts", value: <span className="ds-num">{context.dateTime(booking.startAt)}</span> },
        { label: "Notice", value: fee.insideNotice ? <Pill tone="warning">Inside the {noticeHours}h notice period</Pill> : <Pill tone="success">Outside the {noticeHours}h notice period</Pill> },
        { label: "Fee by policy", value: <span className="ds-num">{fee.insideNotice ? `${(feeBp / 100).toFixed(0)}% · ${context.money(fee.feeMinor)}` : "None"}</span> },
        { label: "Deposit", value: DEPOSIT_LABEL[String(booking.fields.depositState ?? "none")] ?? "—" },
      ]} />
      {finished && <Notice tone="warning" title="Nothing to cancel">{booking.title} is already {booking.status.replace("_", " ")}.</Notice>}
      <Field label="Reason" required error={touched && !reason ? "Choose a reason" : undefined}>
        <Select value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={touched && !reason ? true : undefined}>
          <option value="">Choose a reason</option>
          {CANCEL_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Note for the record" required={reason === "other"} error={touched && reason === "other" && error ? error : undefined} hint="Kept on the booking's history.">
        <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {fee.insideNotice && fee.feeMinor > 0 && (
        <label className="ds-check">
          <input type="checkbox" checked={waive} onChange={(event) => setWaive(event.target.checked)} />
          <span>Waive the {context.money(fee.feeMinor)} late-cancellation fee</span>
        </label>
      )}
      <ProviderBoundary kept={"the deposit is recorded on the booking as requested or received; no card was charged."} id={depositPaid ? "payment.capture" : "email.send"} title={depositPaid ? "Returning the deposit cannot be done here" : "The customer is not notified automatically"} />
    </form>
  );
}
