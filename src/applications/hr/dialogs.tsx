import type { ReactNode } from "react";

/** App-scoped layout for evidence-led, accessible People modals and drawers.
 * Keeps Arlovi's approved typography, colours and controls. */
export function PeopleDialogLead({ title, description, status }: {
  /** Kept for call-site compatibility; the screen path is no longer drawn (the overlay head already names the app and screen). */
  eyebrow?: string;
  title: string;
  description: string;
  status?: ReactNode;
}) {
  return (
    <div className="hr-dialog-lead">
      <div className="hr-dialog-title-row">
        <h3>{title}</h3>
        {status && <div className="hr-dialog-status">{status}</div>}
      </div>
      <p>{description}</p>
    </div>
  );
}

export function PeopleDialogSection({ step, title, description, children }: {
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="hr-dialog-section" aria-label={title}>
      <div className="hr-dialog-section-head">
        <span className="hr-dialog-section-step" aria-hidden="true">{step}</span>
        <div>
          <h4>{title}</h4>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="hr-dialog-section-content">{children}</div>
    </section>
  );
}
