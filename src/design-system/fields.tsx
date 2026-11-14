import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function Field({
  label, hint, error, required, children, id, htmlFor,
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; id?: string; htmlFor?: string }) {
  const auto = useId();
  const target = htmlFor ?? id ?? auto;
  return (
    <div className="ds-field">
      <label className="ds-field-label" htmlFor={target}>
        {label}
        {required && <span className="ds-req" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <span className="ds-field-hint">{hint}</span>}
      {error && <span className="ds-field-error" role="alert">{error}</span>}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  align?: "start" | "end";
  invalid?: boolean;
}

export function TextInput({ align, invalid, className, ...rest }: TextInputProps) {
  return <input className={`ds-input${className ? ` ${className}` : ""}`} data-align={align === "end" ? "end" : undefined} aria-invalid={invalid || undefined} {...rest} />;
}

export function TextArea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`ds-textarea${className ? ` ${className}` : ""}`} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ds-select${className ? ` ${className}` : ""}`} {...rest}>{children}</select>;
}

export function Checkbox({ label, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ds-check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" className="ds-switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
  );
}

/** Money input working in minor units so rounding never drifts. */
export function MoneyInput({
  valueMinor, onChangeMinor, currency, label, id, disabled,
}: { valueMinor: number; onChangeMinor: (minor: number) => void; currency: string; label: string; id?: string; disabled?: boolean }) {
  return (
    <span className="ds-row ds-gap-2">
      <span className="ds-subtle" aria-hidden="true">{currency}</span>
      <TextInput
        id={id}
        align="end"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={(valueMinor / 100).toFixed(2)}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value.replace(/[^0-9.-]/g, ""));
          onChangeMinor(Number.isFinite(parsed) ? Math.round(parsed * 100) : 0);
        }}
      />
    </span>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="ds-form-grid">{children}</div>;
}

export function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="ds-fieldset">
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
