import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * Form model. Records seeded before this module existed carry only
 * `body.fields[]` with a label, type and required flag, so `readForm`
 * fills everything else from defaults and never throws on an old record.
 * ====================================================================== */

export const FIELD_TYPES = [
  "text", "longtext", "number", "date", "select", "multiselect", "checkbox",
  "fileref", "rating", "section", "pagebreak", "email",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_LABELS: Record<FieldType, string> = {
  text: "Short text", longtext: "Long text", number: "Number", date: "Date",
  select: "Single select", multiselect: "Multi-select", checkbox: "Checkbox",
  fileref: "File reference", rating: "Rating", section: "Section heading",
  pagebreak: "Page break", email: "Email",
};

export const FIELD_HINTS: Record<FieldType, string> = {
  text: "One line, with an optional length or pattern rule",
  longtext: "Several lines, with a length rule",
  number: "A figure, with a smallest and largest value",
  date: "A calendar date, with an earliest and latest",
  select: "One choice from a list",
  multiselect: "Any number of choices from a list",
  checkbox: "A single yes or no",
  fileref: "The name of a file the person will send separately",
  rating: "A whole number from one to five",
  section: "A heading that groups the questions under it",
  pagebreak: "Splits the form into pages",
  email: "One line, checked for an address shape",
};

/** Types that never carry an answer. */
export const STRUCTURAL: FieldType[] = ["section", "pagebreak"];

export type PatternRule = "" | "email" | "phone" | "postcode" | "url";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help: string;
  required: boolean;
  options: string[];
  placeholder: string;
  minLength: number;
  maxLength: number;
  min: number;
  max: number;
  pattern: PatternRule;
  /** Marked so the submissions table can redact it by default. */
  sensitive: boolean;
}

export type Operator = "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "answered" | "empty";

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "is", not_equals: "is not", contains: "contains",
  greater_than: "is more than", less_than: "is less than",
  answered: "is answered", empty: "is empty",
};

export interface LogicRule {
  id: string;
  /** Field this rule governs. */
  targetId: string;
  action: "show" | "hide" | "require";
  whenFieldId: string;
  operator: Operator;
  value: string;
}

export interface FormTheme {
  accent: string; ink: string; paper: string; radius: number; width: "narrow" | "wide";
  font: "Inter" | "Source Serif";
}

export interface FormSettings {
  notifyEnabled: boolean;
  notifyTo: string;
  confirmation: string;
  retentionDays: number;
  access: "link" | "workspace";
  closed: boolean;
  closeMessage: string;
  /** Raised on each publish so a submission can name the version it answered. */
  version: number;
}

export interface FormModel {
  fields: FormField[];
  logic: LogicRule[];
  theme: FormTheme;
  settings: FormSettings;
}

export const DEFAULT_THEME: FormTheme = {
  accent: "#234fe8", ink: "#17223a", paper: "#ffffff", radius: 12, width: "narrow", font: "Inter",
};

export const DEFAULT_SETTINGS: FormSettings = {
  notifyEnabled: false,
  notifyTo: "",
  confirmation: "Thank you. Your answers are recorded in the studio workspace.",
  retentionDays: 365,
  access: "link",
  closed: false,
  closeMessage: "This form is closed.",
  version: 1,
};

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function makeField(type: FieldType): FormField {
  return {
    id: nextId("f"),
    type,
    label: type === "section" ? "Section heading" : type === "pagebreak" ? "Page break" : FIELD_LABELS[type],
    help: "",
    required: false,
    options: type === "select" || type === "multiselect" ? ["First option", "Second option"] : [],
    placeholder: "",
    minLength: 0,
    maxLength: type === "longtext" ? 2000 : 0,
    min: type === "rating" ? 1 : 0,
    max: type === "rating" ? 5 : 0,
    pattern: type === "email" ? "email" : "",
    sensitive: false,
  };
}

/* ------------------------------ Reading ------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readField(raw: unknown, index: number): FormField {
  const row = asRecord(raw);
  const rawType = str(row.type, "text");
  const type = (FIELD_TYPES as readonly string[]).includes(rawType) ? (rawType as FieldType) : "text";
  const base = makeField(type);
  return {
    ...base,
    id: str(row.id) || `f${index + 1}`,
    label: str(row.label, base.label),
    help: str(row.help),
    required: row.required === true,
    options: row.options === undefined ? base.options : strList(row.options),
    placeholder: str(row.placeholder),
    minLength: num(row.minLength, base.minLength),
    maxLength: num(row.maxLength, base.maxLength),
    min: num(row.min, base.min),
    max: num(row.max, base.max),
    pattern: (["", "email", "phone", "postcode", "url"].includes(str(row.pattern)) ? str(row.pattern) : base.pattern) as PatternRule,
    sensitive: row.sensitive === true,
  };
}

export function readForm(record: Rec | undefined): FormModel {
  const body = asRecord(record?.body);
  const theme = asRecord(body.theme);
  const settings = asRecord(body.settings);
  const fields = (Array.isArray(body.fields) ? body.fields : []).map(readField);
  return {
    fields,
    logic: (Array.isArray(body.logic) ? body.logic : []).map((item, index) => {
      const row = asRecord(item);
      const action = str(row.action);
      const operator = str(row.operator);
      return {
        id: str(row.id) || `l${index + 1}`,
        targetId: str(row.targetId),
        action: (["show", "hide", "require"].includes(action) ? action : "show") as LogicRule["action"],
        whenFieldId: str(row.whenFieldId),
        operator: (["equals", "not_equals", "contains", "greater_than", "less_than", "answered", "empty"].includes(operator) ? operator : "equals") as Operator,
        value: str(row.value),
      };
    }),
    theme: {
      accent: str(theme.accent, DEFAULT_THEME.accent),
      ink: str(theme.ink, DEFAULT_THEME.ink),
      paper: str(theme.paper, DEFAULT_THEME.paper),
      radius: num(theme.radius, DEFAULT_THEME.radius),
      width: str(theme.width) === "wide" ? "wide" : "narrow",
      font: str(theme.font) === "Source Serif" ? "Source Serif" : "Inter",
    },
    settings: {
      notifyEnabled: settings.notifyEnabled === true,
      notifyTo: str(settings.notifyTo),
      confirmation: str(settings.confirmation, DEFAULT_SETTINGS.confirmation),
      retentionDays: num(settings.retentionDays, DEFAULT_SETTINGS.retentionDays),
      access: str(settings.access) === "workspace" ? "workspace" : "link",
      closed: settings.closed === true,
      closeMessage: str(settings.closeMessage, DEFAULT_SETTINGS.closeMessage),
      version: num(settings.version, 1),
    },
  };
}

/* ------------------------------ Logic ------------------------------ */

export type Answers = Record<string, string | string[] | boolean>;

export function answerText(value: Answers[string] | undefined): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

function matches(rule: LogicRule, answers: Answers): boolean {
  const raw = answers[rule.whenFieldId];
  const text = answerText(raw).trim().toLowerCase();
  const target = rule.value.trim().toLowerCase();
  switch (rule.operator) {
    case "answered": return text.length > 0;
    case "empty": return text.length === 0;
    case "equals": return text === target;
    case "not_equals": return text !== target;
    case "contains": return text.includes(target);
    case "greater_than": return Number(text) > Number(target);
    case "less_than": return Number(text) < Number(target);
    default: return false;
  }
}

/** Which fields a person actually sees, given what they have answered. */
export function evaluate(model: FormModel, answers: Answers): { visible: Set<string>; required: Set<string> } {
  const visible = new Set(model.fields.map((field) => field.id));
  const required = new Set(model.fields.filter((field) => field.required).map((field) => field.id));
  const showRules = model.logic.filter((rule) => rule.action === "show");
  // A field named by a show rule is hidden until one of its show rules matches.
  for (const rule of showRules) {
    if (model.fields.some((field) => field.id === rule.targetId)) visible.delete(rule.targetId);
  }
  for (const rule of model.logic) {
    if (!matches(rule, answers)) continue;
    if (rule.action === "show") visible.add(rule.targetId);
    if (rule.action === "hide") visible.delete(rule.targetId);
    if (rule.action === "require") required.add(rule.targetId);
  }
  return { visible, required };
}

export interface FieldError { fieldId: string; message: string }

const PATTERNS: Record<Exclude<PatternRule, "">, { test: RegExp; message: string }> = {
  email: { test: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: "Enter an address such as name@example.com." },
  phone: { test: /^[+0-9][0-9\s().-]{6,}$/, message: "Enter a telephone number, digits and spaces only." },
  postcode: { test: /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/, message: "Enter a postal code." },
  url: { test: /^https?:\/\/[^\s]+$/, message: "Enter an address starting with http:// or https://." },
};

/**
 * Validation. A field that is not visible is never validated, so a required
 * question hidden by a rule can never block a submission.
 */
export function validate(model: FormModel, answers: Answers): FieldError[] {
  const { visible, required } = evaluate(model, answers);
  const errors: FieldError[] = [];
  for (const field of model.fields) {
    if (STRUCTURAL.includes(field.type)) continue;
    if (!visible.has(field.id)) continue;
    const raw = answers[field.id];
    const text = answerText(raw).trim();
    if (required.has(field.id) && text.length === 0) {
      errors.push({ fieldId: field.id, message: `${field.label} is required.` });
      continue;
    }
    if (text.length === 0) continue;
    if (field.minLength > 0 && text.length < field.minLength) {
      errors.push({ fieldId: field.id, message: `${field.label} needs at least ${field.minLength} characters.` });
    }
    if (field.maxLength > 0 && text.length > field.maxLength) {
      errors.push({ fieldId: field.id, message: `${field.label} must be ${field.maxLength} characters or fewer.` });
    }
    if (field.pattern && !PATTERNS[field.pattern].test.test(text)) {
      errors.push({ fieldId: field.id, message: PATTERNS[field.pattern].message });
    }
    if (field.type === "number" || field.type === "rating") {
      const value = Number(text);
      if (Number.isNaN(value)) errors.push({ fieldId: field.id, message: `${field.label} must be a number.` });
      else {
        if (field.min !== 0 && value < field.min) errors.push({ fieldId: field.id, message: `${field.label} must be ${field.min} or more.` });
        if (field.max !== 0 && value > field.max) errors.push({ fieldId: field.id, message: `${field.label} must be ${field.max} or less.` });
      }
    }
    if (field.type === "select" && field.options.length > 0 && !field.options.includes(text)) {
      errors.push({ fieldId: field.id, message: `${field.label} must be one of the listed options.` });
    }
  }
  return errors;
}

/* ------------------------------ Diagnostics ------------------------------ */

export interface LogicIssue { id: string; level: "fail" | "warn"; title: string; detail: string }

/** Rules checked against the field list: dangling targets, loops, dead branches. */
export function logicIssues(model: FormModel): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const byId = new Map(model.fields.map((field) => [field.id, field]));

  for (const rule of model.logic) {
    const target = byId.get(rule.targetId);
    const source = byId.get(rule.whenFieldId);
    if (!target) issues.push({ id: `dangling-target-${rule.id}`, level: "fail", title: "A rule points at a field that is gone", detail: `Rule ${rule.id} governs a field that is no longer in this form.` });
    if (!source) issues.push({ id: `dangling-source-${rule.id}`, level: "fail", title: "A rule reads a field that is gone", detail: `Rule ${rule.id} reads a field that is no longer in this form.` });
    if (target && source && rule.targetId === rule.whenFieldId) {
      issues.push({ id: `self-${rule.id}`, level: "fail", title: `${target.label} depends on itself`, detail: "A field cannot decide its own visibility; the branch can never settle." });
    }
    if (target && source) {
      const targetIndex = model.fields.indexOf(target);
      const sourceIndex = model.fields.indexOf(source);
      if (sourceIndex > targetIndex) {
        issues.push({ id: `order-${rule.id}`, level: "warn", title: `${target.label} depends on a later question`, detail: `${source.label} comes after it, so the rule only takes effect once the person has scrolled back.` });
      }
    }
    if (rule.operator !== "answered" && rule.operator !== "empty" && !rule.value.trim()) {
      issues.push({ id: `novalue-${rule.id}`, level: "warn", title: "A rule has no value to compare against", detail: `The comparison ${OPERATOR_LABELS[rule.operator]} has an empty right-hand side, so it never matches.` });
    }
    if (source && (source.type === "select" || source.type === "multiselect") && rule.value && !source.options.includes(rule.value)) {
      issues.push({ id: `badoption-${rule.id}`, level: "fail", title: `"${rule.value}" is not an option of ${source.label}`, detail: "The branch can never be reached because no answer can equal that value." });
    }
  }

  const { required, visible } = evaluate(model, {});
  for (const field of model.fields) {
    if (STRUCTURAL.includes(field.type)) continue;
    if (required.has(field.id) && !visible.has(field.id)) {
      const reachable = model.logic.some((rule) => rule.action === "show" && rule.targetId === field.id);
      issues.push({
        id: `hidden-required-${field.id}`,
        level: reachable ? "warn" : "fail",
        title: `${field.label} is required but hidden at the start`,
        detail: reachable
          ? "It is only required once the rule that shows it matches. Validation skips it while it is hidden, so it cannot block a submission."
          : "No rule can ever show it, so it is unreachable. Validation skips it, but the question is dead.",
      });
    }
  }
  return issues;
}

/** The pages a form is split into by its page breaks. */
export function pages(model: FormModel): FormField[][] {
  const result: FormField[][] = [[]];
  for (const field of model.fields) {
    if (field.type === "pagebreak") { result.push([]); continue; }
    result[result.length - 1].push(field);
  }
  return result;
}

export function embedSnippet(formId: string, title: string, theme: FormTheme): string {
  return `<!-- ${title} -->
<div id="arlovi-form-${formId}"></div>
<script>
  // The embed loads the form definition from the workspace that owns it.
  // No host is connected, so this snippet is the shape of the embed, not a
  // live script: pasting it on a page does not reach a server.
  window.arloviForm = window.arloviForm || [];
  window.arloviForm.push({
    form: ${JSON.stringify(formId)},
    mount: ${JSON.stringify(`#arlovi-form-${formId}`)},
    theme: { accent: ${JSON.stringify(theme.accent)}, radius: ${theme.radius} }
  });
</script>`;
}
