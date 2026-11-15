import type { Rec } from "@/domain/types";
import { wallMs } from "@/platform/clock";

/* ====================================================================== *
 * App model. An app project is an entity model, a set of screens bound to
 * it, automations, roles and a release history. Records written before this
 * module existed carry `body.files` and `body.schema.tables`, so `readApp`
 * lifts those into entities instead of failing.
 * ====================================================================== */

export const FIELD_KINDS = ["text", "longtext", "number", "money", "date", "boolean", "choice", "reference"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  text: "Text", longtext: "Long text", number: "Number", money: "Money (minor units)",
  date: "Date", boolean: "Yes or no", choice: "Choice", reference: "Reference",
};

export const TS_TYPES: Record<FieldKind, string> = {
  text: "string", longtext: "string", number: "number", money: "number",
  date: "string", boolean: "boolean", choice: "string", reference: "string",
};

export interface EntityField {
  id: string;
  name: string;
  kind: FieldKind;
  required: boolean;
  unique: boolean;
  options: string[];
  /** Entity name for a reference field. */
  references: string;
}

export interface Entity {
  id: string;
  name: string;
  /** The workspace collection a preview reads from, when one is bound. */
  collection: string;
  fields: EntityField[];
}

export type ComponentKind = "table" | "detail" | "stat" | "list" | "form" | "text" | "chart";

export const COMPONENT_LABELS: Record<ComponentKind, string> = {
  table: "Table", detail: "Detail panel", stat: "Statistic", list: "List",
  form: "Form", text: "Text", chart: "Bar chart",
};

export const COMPONENT_HINTS: Record<ComponentKind, string> = {
  table: "Rows from an entity, with chosen columns",
  detail: "One record, field by field",
  stat: "A count or a total over an entity",
  list: "A compact list of one field",
  form: "Fields from an entity, with its validation",
  text: "Static copy",
  chart: "Counts grouped by one field",
};

export interface ScreenComponent {
  id: string;
  kind: ComponentKind;
  title: string;
  /** Entity id this component reads. Empty means unbound. */
  entityId: string;
  /** Field ids used as columns, the grouped field, or the aggregated field. */
  fieldIds: string[];
  /** stat only. */
  aggregate: "count" | "sum";
  text: string;
  span: 4 | 6 | 8 | 12;
}

export interface AppScreen {
  id: string;
  name: string;
  route: string;
  components: ScreenComponent[];
}

export interface Automation {
  id: string;
  name: string;
  trigger: "record_created" | "record_updated" | "schedule" | "manual";
  entityId: string;
  condition: { fieldId: string; operator: "equals" | "greater_than" | "less_than" | "changed"; value: string };
  steps: { id: string; kind: "create_record" | "update_field" | "notify" | "approve"; detail: string }[];
  enabled: boolean;
}

export interface AppRole {
  id: string;
  name: string;
  /** Entity id to permission string. */
  grants: Record<string, "none" | "read" | "write">;
  canApprove: boolean;
}

export interface AppVersion {
  id: string;
  label: string;
  at: string;
  note: string;
  actor: string;
  entities: number;
  screens: number;
}

export interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  entityId: string;
  auth: "role" | "none";
  note: string;
}

export interface Release {
  id: string;
  environment: "preview" | "staging" | "production";
  at: string;
  state: "built" | "blocked" | "rolled_back";
  note: string;
  actor: string;
}

export interface AppModel {
  entities: Entity[];
  screens: AppScreen[];
  automations: Automation[];
  roles: AppRole[];
  versions: AppVersion[];
  endpoints: Endpoint[];
  releases: Release[];
  files: { path: string; content: string }[];
  /** Rows typed by a person for the preview and tests, per entity id. Never workspace records. */
  seeds?: Record<string, Record<string, string>[]>;
  settings: { name: string; description: string; environment: "preview" | "staging" | "production"; locale: string };
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${wallMs().toString(36).slice(-4)}${counter.toString(36)}`;
}

export function makeField(kind: FieldKind): EntityField {
  return {
    id: nextId("fl"), name: "New field", kind, required: false, unique: false,
    options: kind === "choice" ? ["Open", "Closed"] : [], references: "",
  };
}

export function makeEntity(name: string): Entity {
  return {
    id: nextId("en"),
    name,
    collection: "",
    fields: [
      { ...makeField("text"), name: "Title", required: true },
      { ...makeField("choice"), name: "Status", options: ["Open", "Closed"] },
    ],
  };
}

export function makeComponent(kind: ComponentKind): ScreenComponent {
  return {
    id: nextId("cp"), kind, title: COMPONENT_LABELS[kind], entityId: "", fieldIds: [],
    aggregate: "count", text: kind === "text" ? "Write the copy this screen needs." : "",
    span: kind === "stat" ? 4 : kind === "text" ? 12 : 6,
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

function readField(raw: unknown, index: number): EntityField {
  const row = asRecord(raw);
  const kind = (FIELD_KINDS as readonly string[]).includes(str(row.kind)) ? (str(row.kind) as FieldKind) : "text";
  return {
    id: str(row.id) || `fl${index + 1}`,
    name: str(row.name, `Field ${index + 1}`),
    kind,
    required: row.required === true,
    unique: row.unique === true,
    options: strList(row.options),
    references: str(row.references),
  };
}

export function readApp(record: Rec | undefined): AppModel {
  const body = asRecord(record?.body);
  const settings = asRecord(body.settings);
  const legacySchema = asRecord(body.schema);
  const legacyTables = Array.isArray(legacySchema.tables) ? legacySchema.tables : [];

  const entities: Entity[] = Array.isArray(body.entities) && body.entities.length > 0
    ? body.entities.map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `en${index + 1}`,
        name: str(row.name, `Entity ${index + 1}`),
        collection: str(row.collection),
        fields: (Array.isArray(row.fields) ? row.fields : []).map(readField),
      };
    })
    : legacyTables.map((item, index) => {
      const row = asRecord(item);
      return {
        id: `legacy-${index + 1}`,
        name: str(row.name, `Table ${index + 1}`),
        collection: "",
        fields: strList(row.fields).map((name, fieldIndex) => ({
          id: `legacy-${index + 1}-${fieldIndex + 1}`,
          name,
          kind: "text" as FieldKind,
          required: fieldIndex === 0,
          unique: false,
          options: [],
          references: "",
        })),
      };
    });

  return {
    entities,
    screens: (Array.isArray(body.screens) ? body.screens : []).map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `sc${index + 1}`,
        name: str(row.name, `Screen ${index + 1}`),
        route: str(row.route, `/screen-${index + 1}`),
        components: (Array.isArray(row.components) ? row.components : []).map((entry, componentIndex) => {
          const component = asRecord(entry);
          const kind = str(component.kind);
          const base = makeComponent((["table", "detail", "stat", "list", "form", "text", "chart"].includes(kind) ? kind : "text") as ComponentKind);
          return {
            ...base,
            id: str(component.id) || `cp${componentIndex + 1}`,
            title: str(component.title, base.title),
            entityId: str(component.entityId),
            fieldIds: strList(component.fieldIds),
            aggregate: str(component.aggregate) === "sum" ? "sum" : "count",
            text: str(component.text, base.text),
            span: ([4, 6, 8, 12].includes(num(component.span, 6)) ? num(component.span, 6) : 6) as ScreenComponent["span"],
          };
        }),
      };
    }),
    automations: (Array.isArray(body.automations) ? body.automations : []).map((item, index) => {
      const row = asRecord(item);
      const condition = asRecord(row.condition);
      const trigger = str(row.trigger);
      const operator = str(condition.operator);
      return {
        id: str(row.id) || `au${index + 1}`,
        name: str(row.name, `Automation ${index + 1}`),
        trigger: (["record_created", "record_updated", "schedule", "manual"].includes(trigger) ? trigger : "manual") as Automation["trigger"],
        entityId: str(row.entityId),
        condition: {
          fieldId: str(condition.fieldId),
          operator: (["equals", "greater_than", "less_than", "changed"].includes(operator) ? operator : "equals") as Automation["condition"]["operator"],
          value: str(condition.value),
        },
        steps: (Array.isArray(row.steps) ? row.steps : []).map((entry, stepIndex) => {
          const step = asRecord(entry);
          const kind = str(step.kind);
          return {
            id: str(step.id) || `st${stepIndex + 1}`,
            kind: (["create_record", "update_field", "notify", "approve"].includes(kind) ? kind : "notify") as Automation["steps"][number]["kind"],
            detail: str(step.detail),
          };
        }),
        enabled: row.enabled !== false,
      };
    }),
    roles: (Array.isArray(body.roles) ? body.roles : []).map((item, index) => {
      const row = asRecord(item);
      const grants = asRecord(row.grants);
      return {
        id: str(row.id) || `ro${index + 1}`,
        name: str(row.name, `Role ${index + 1}`),
        grants: Object.fromEntries(Object.entries(grants).map(([key, value]) => [key, (["none", "read", "write"].includes(String(value)) ? String(value) : "none") as "none" | "read" | "write"])),
        canApprove: row.canApprove === true,
      };
    }),
    versions: (Array.isArray(body.versions) ? body.versions : []).map((item, index) => {
      const row = asRecord(item);
      return {
        id: str(row.id) || `ve${index + 1}`,
        label: str(row.label, `v${index + 1}`),
        at: str(row.at),
        note: str(row.note),
        actor: str(row.actor),
        entities: num(row.entities, 0),
        screens: num(row.screens, 0),
      };
    }),
    endpoints: (Array.isArray(body.endpoints) ? body.endpoints : []).map((item, index) => {
      const row = asRecord(item);
      const method = str(row.method).toUpperCase();
      return {
        id: str(row.id) || `ep${index + 1}`,
        method: (["GET", "POST", "PATCH", "DELETE"].includes(method) ? method : "GET") as Endpoint["method"],
        path: str(row.path, "/"),
        entityId: str(row.entityId),
        auth: str(row.auth) === "none" ? "none" : "role",
        note: str(row.note),
      };
    }),
    releases: (Array.isArray(body.releases) ? body.releases : []).map((item, index) => {
      const row = asRecord(item);
      const environment = str(row.environment);
      const state = str(row.state);
      return {
        id: str(row.id) || `re${index + 1}`,
        environment: (["preview", "staging", "production"].includes(environment) ? environment : "preview") as Release["environment"],
        at: str(row.at),
        state: (["built", "blocked", "rolled_back"].includes(state) ? state : "blocked") as Release["state"],
        note: str(row.note),
        actor: str(row.actor),
      };
    }),
    files: (Array.isArray(body.files) ? body.files : []).map((item) => {
      const row = asRecord(item);
      return { path: str(row.path, "file.txt"), content: str(row.content) };
    }),
    seeds: Object.fromEntries(Object.entries(asRecord(body.seeds)).map(([entityId, rows]) => [
      entityId,
      (Array.isArray(rows) ? rows : []).map((row) => Object.fromEntries(Object.entries(asRecord(row)).map(([key, value]) => [key, str(value)]))),
    ])),
    settings: {
      name: str(settings.name, record?.title ?? "App"),
      description: str(settings.description, record?.summary ?? ""),
      environment: (["preview", "staging", "production"].includes(str(settings.environment)) ? str(settings.environment) : "preview") as AppModel["settings"]["environment"],
      locale: str(settings.locale, "en-GB"),
    },
  };
}

/* ------------------------------ Validation ------------------------------ */

export interface ModelIssue { id: string; level: "fail" | "warn" | "pass"; area: "Data" | "Screens" | "Logic" | "Access"; title: string; detail: string }

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9 _]*$/;

export function validateApp(model: AppModel): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const names = new Map<string, number>();

  if (model.entities.length === 0) {
    issues.push({ id: "no-entities", level: "fail", area: "Data", title: "The app has no entities", detail: "Nothing can be stored, bound or generated until one entity exists." });
  }

  for (const entity of model.entities) {
    names.set(entity.name.toLowerCase(), (names.get(entity.name.toLowerCase()) ?? 0) + 1);
    if (!IDENTIFIER.test(entity.name)) {
      issues.push({ id: `entity-name-${entity.id}`, level: "fail", area: "Data", title: `"${entity.name}" is not a usable entity name`, detail: "A name must start with a letter and contain only letters, digits, spaces or underscores, because it becomes a TypeScript interface." });
    }
    if (entity.fields.length === 0) {
      issues.push({ id: `entity-empty-${entity.id}`, level: "fail", area: "Data", title: `${entity.name} has no fields`, detail: "An entity with no fields cannot be bound to a component." });
    }
    const fieldNames = new Map<string, number>();
    for (const field of entity.fields) {
      fieldNames.set(field.name.toLowerCase(), (fieldNames.get(field.name.toLowerCase()) ?? 0) + 1);
      if (field.kind === "reference") {
        const target = model.entities.find((item) => item.name === field.references);
        issues.push(target
          ? { id: `ref-${entity.id}-${field.id}`, level: "pass", area: "Data", title: `${entity.name}.${field.name} resolves to ${target.name}`, detail: "The reference names an entity that exists." }
          : { id: `ref-${entity.id}-${field.id}`, level: "fail", area: "Data", title: `${entity.name}.${field.name} references "${field.references || "nothing"}"`, detail: "No entity with that name is defined, so the relation cannot be generated." });
      }
      if (field.kind === "choice" && field.options.length === 0) {
        issues.push({ id: `choice-${entity.id}-${field.id}`, level: "fail", area: "Data", title: `${entity.name}.${field.name} is a choice with no options`, detail: "A choice field needs at least one value for a person to pick." });
      }
      if (field.unique && !field.required) {
        issues.push({ id: `unique-${entity.id}-${field.id}`, level: "warn", area: "Data", title: `${entity.name}.${field.name} is unique but optional`, detail: "Two records can both leave it empty, which most databases treat as not a conflict. Make it required if it identifies the record." });
      }
    }
    for (const [name, count] of fieldNames) {
      if (count > 1) issues.push({ id: `dupfield-${entity.id}-${name}`, level: "fail", area: "Data", title: `${entity.name} has ${count} fields called "${name}"`, detail: "Field names become object keys, so duplicates silently overwrite one another." });
    }
    if (!entity.fields.some((field) => field.required)) {
      issues.push({ id: `norequired-${entity.id}`, level: "warn", area: "Data", title: `${entity.name} has no required field`, detail: "A record with every field empty is valid, which usually means a missing rule rather than a deliberate one." });
    }
  }
  for (const [name, count] of names) {
    if (count > 1) issues.push({ id: `dupentity-${name}`, level: "fail", area: "Data", title: `${count} entities are called "${name}"`, detail: "Generated interfaces would collide." });
  }

  const routes = new Map<string, number>();
  for (const screen of model.screens) {
    routes.set(screen.route, (routes.get(screen.route) ?? 0) + 1);
    if (screen.components.length === 0) {
      issues.push({ id: `screen-empty-${screen.id}`, level: "warn", area: "Screens", title: `${screen.name} has no components`, detail: "The screen renders an empty page." });
    }
    for (const component of screen.components) {
      if (component.kind === "text") continue;
      const entity = model.entities.find((item) => item.id === component.entityId);
      issues.push(entity
        ? { id: `bind-${component.id}`, level: "pass", area: "Screens", title: `${component.title} is bound to ${entity.name}`, detail: `It reads ${component.fieldIds.length || entity.fields.length} fields.` }
        : { id: `bind-${component.id}`, level: "fail", area: "Screens", title: `${component.title} on ${screen.name} is not bound`, detail: "A data component with no entity has nothing to render." });
      if (entity) {
        const missing = component.fieldIds.filter((id) => !entity.fields.some((field) => field.id === id));
        if (missing.length) {
          issues.push({ id: `bindfield-${component.id}`, level: "fail", area: "Screens", title: `${component.title} uses ${missing.length} fields that no longer exist`, detail: `They were removed from ${entity.name}. The component would render blank columns.` });
        }
      }
    }
  }
  for (const [route, count] of routes) {
    if (count > 1) issues.push({ id: `duproute-${route}`, level: "fail", area: "Screens", title: `${count} screens answer ${route}`, detail: "Only one of them would ever be reached." });
  }

  for (const automation of model.automations) {
    const entity = model.entities.find((item) => item.id === automation.entityId);
    if (!entity) {
      issues.push({ id: `auto-entity-${automation.id}`, level: "fail", area: "Logic", title: `${automation.name} watches an entity that does not exist`, detail: "The automation can never run." });
      continue;
    }
    const field = entity.fields.find((item) => item.id === automation.condition.fieldId);
    if (automation.condition.fieldId && !field) {
      issues.push({ id: `auto-field-${automation.id}`, level: "fail", area: "Logic", title: `${automation.name} tests a field that was removed`, detail: `${entity.name} has no field with that id, so the condition can never be true.` });
    }
    if (field && field.kind === "choice" && automation.condition.value && !field.options.includes(automation.condition.value)) {
      issues.push({ id: `auto-value-${automation.id}`, level: "fail", area: "Logic", title: `${automation.name} compares against "${automation.condition.value}"`, detail: `${field.name} can never hold that value, so the branch is unreachable.` });
    }
    if (automation.steps.length === 0) {
      issues.push({ id: `auto-steps-${automation.id}`, level: "warn", area: "Logic", title: `${automation.name} has no steps`, detail: "It would match and then do nothing." });
    }
    if (automation.steps.some((step) => step.kind === "notify")) {
      issues.push({ id: `auto-notify-${automation.id}`, level: "warn", area: "Logic", title: `${automation.name} wants to notify someone`, detail: "No mail provider is connected, so that step records the intention and stops." });
    }
  }

  if (model.roles.length === 0) {
    issues.push({ id: "no-roles", level: "warn", area: "Access", title: "No roles are defined", detail: "Without a role model every person sees every screen." });
  }
  for (const role of model.roles) {
    const writable = Object.entries(role.grants).filter(([, grant]) => grant === "write").length;
    if (writable === model.entities.length && model.entities.length > 0 && !role.canApprove) {
      issues.push({ id: `role-wide-${role.id}`, level: "warn", area: "Access", title: `${role.name} can write to every entity`, detail: "A role that can write everything is usually wider than the work it does." });
    }
  }
  const newRole = model.roles.find((role) => /new|member|default/i.test(role.name));
  if (newRole) {
    const wide = Object.values(newRole.grants).some((grant) => grant === "write");
    issues.push(wide
      ? { id: "default-role", level: "warn", area: "Access", title: `${newRole.name} can write by default`, detail: "A newly added person inherits this role. Writing should be granted deliberately." }
      : { id: "default-role", level: "pass", area: "Access", title: `${newRole.name} starts read-only`, detail: "A new person inherits no write access and none of the owner's rights." });
  }

  return issues;
}

export function issueTotals(issues: ModelIssue[]): { fail: number; warn: number; pass: number } {
  return {
    fail: issues.filter((issue) => issue.level === "fail").length,
    warn: issues.filter((issue) => issue.level === "warn").length,
    pass: issues.filter((issue) => issue.level === "pass").length,
  };
}

/* ------------------------------ Code generation ------------------------------ */

function pascal(value: string): string {
  return value.replace(/[^A-Za-z0-9]+(.)?/g, (_, chr: string | undefined) => (chr ? chr.toUpperCase() : "")).replace(/^(.)/, (chr) => chr.toUpperCase()) || "Entity";
}

function camel(value: string): string {
  const name = pascal(value);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function fieldKey(name: string): string {
  const key = camel(name);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(name);
}

export function generateTypes(model: AppModel): string {
  const lines: string[] = [
    "/**",
    ` * ${model.settings.name} — generated from the data model.`,
    " * Written by the model designer; edit the model rather than this file.",
    " */",
    "",
  ];
  for (const entity of model.entities) {
    const name = pascal(entity.name);
    const choices = entity.fields.filter((field) => field.kind === "choice" && field.options.length > 0);
    for (const field of choices) {
      lines.push(`export type ${name}${pascal(field.name)} = ${field.options.map((option) => JSON.stringify(option)).join(" | ")};`);
    }
    if (choices.length) lines.push("");
    lines.push(`export interface ${name} {`);
    lines.push("  id: string;");
    for (const field of entity.fields) {
      const optional = field.required ? "" : "?";
      const type = field.kind === "choice" && field.options.length > 0
        ? `${name}${pascal(field.name)}`
        : field.kind === "reference"
          ? `${pascal(field.references || "Unknown")}["id"]`
          : TS_TYPES[field.kind];
      const comment = field.kind === "money" ? " // minor units" : field.unique ? " // unique" : "";
      lines.push(`  ${fieldKey(field.name)}${optional}: ${type};${comment}`);
    }
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

export function generateValidators(model: AppModel): string {
  const lines: string[] = [
    `import type { ${model.entities.map((entity) => pascal(entity.name)).join(", ") || "never"} } from "./types";`,
    "",
    "export interface FieldError { field: string; message: string }",
    "",
  ];
  for (const entity of model.entities) {
    const name = pascal(entity.name);
    lines.push(`export function validate${name}(input: Partial<${name}>): FieldError[] {`);
    lines.push("  const errors: FieldError[] = [];");
    for (const field of entity.fields) {
      const key = fieldKey(field.name);
      const access = key.startsWith('"') ? `input[${key}]` : `input.${key}`;
      if (field.required) {
        lines.push(`  if (${access} === undefined || ${access} === "") errors.push({ field: ${JSON.stringify(field.name)}, message: ${JSON.stringify(`${field.name} is required.`)} });`);
      }
      if (field.kind === "choice" && field.options.length > 0) {
        lines.push(`  if (${access} !== undefined && !${JSON.stringify(field.options)}.includes(${access})) errors.push({ field: ${JSON.stringify(field.name)}, message: ${JSON.stringify(`${field.name} must be one of ${field.options.join(", ")}.`)} });`);
      }
      if (field.kind === "money" || field.kind === "number") {
        lines.push(`  if (typeof ${access} === "number" && Number.isNaN(${access})) errors.push({ field: ${JSON.stringify(field.name)}, message: ${JSON.stringify(`${field.name} must be a number.`)} });`);
      }
    }
    lines.push("  return errors;");
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

export function generateScreens(model: AppModel): string {
  const lines: string[] = [
    'import type { ReactNode } from "react";',
    "",
    "/** Screen definitions, generated from the screen designer. */",
    "export interface GeneratedScreen { name: string; route: string; render: () => ReactNode }",
    "",
  ];
  for (const screen of model.screens) {
    lines.push(`// ${screen.name} — ${screen.route}`);
    lines.push(`export const ${camel(screen.name)}Screen = {`);
    lines.push(`  name: ${JSON.stringify(screen.name)},`);
    lines.push(`  route: ${JSON.stringify(screen.route)},`);
    lines.push("  components: [");
    for (const component of screen.components) {
      const entity = model.entities.find((item) => item.id === component.entityId);
      lines.push(`    { kind: ${JSON.stringify(component.kind)}, title: ${JSON.stringify(component.title)}, entity: ${JSON.stringify(entity ? pascal(entity.name) : null)}, fields: ${JSON.stringify(component.fieldIds.map((id) => entity?.fields.find((field) => field.id === id)?.name ?? id))} },`);
    }
    lines.push("  ],");
    lines.push("};");
    lines.push("");
  }
  return lines.join("\n");
}

export function generateApi(model: AppModel): string {
  const lines: string[] = ["/** Endpoint contracts, generated from the API designer. */", ""];
  for (const endpoint of model.endpoints) {
    const entity = model.entities.find((item) => item.id === endpoint.entityId);
    lines.push(`// ${endpoint.method} ${endpoint.path}${endpoint.note ? ` — ${endpoint.note}` : ""}`);
    lines.push(`export interface ${pascal(`${endpoint.method} ${endpoint.path}`)}Request {`);
    lines.push(`  auth: ${endpoint.auth === "role" ? '"role"' : '"none"'};`);
    if (entity && (endpoint.method === "POST" || endpoint.method === "PATCH")) {
      lines.push(`  body: ${endpoint.method === "PATCH" ? `Partial<${pascal(entity.name)}>` : pascal(entity.name)};`);
    }
    lines.push("}");
    lines.push("");
  }
  if (model.endpoints.length === 0) lines.push("// No endpoints defined yet.");
  return lines.join("\n");
}

export function generatedFiles(model: AppModel): { path: string; content: string }[] {
  return [
    { path: "src/types.ts", content: generateTypes(model) },
    { path: "src/validate.ts", content: generateValidators(model) },
    { path: "src/screens.ts", content: generateScreens(model) },
    { path: "src/api.ts", content: generateApi(model) },
  ];
}

/** Collections a preview can genuinely read from in this workspace. */
export const BINDABLE_COLLECTIONS = [
  "contacts", "companies", "deals", "quotes", "invoices", "orders", "products",
  "tasks", "projects", "tickets", "bookings", "suppliers", "submissions",
];
