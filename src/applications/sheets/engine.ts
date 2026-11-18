import { clockNow } from "@/platform/clock";
/* ====================================================================== *
 * Spreadsheet calculation engine.
 *
 * Replaces audit finding A12 (a six-column grid evaluated with a regular
 * expression over `body.sheets[0]`). This is a real engine: a tokeniser, a
 * precedence-climbing parser, a dependency graph with cycle detection and a
 * deterministic topological recalculation order.
 *
 * The file is DOM-free on purpose so it can be unit tested in node.
 * ====================================================================== */

/* ----------------------------- Addresses ----------------------------- */

export interface CellRef {
  /** 0-based column index. */
  col: number;
  /** 0-based row index. */
  row: number;
  sheet?: string;
  absCol?: boolean;
  absRow?: boolean;
}

export function columnName(col: number): string {
  let name = "";
  let n = col;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

export function columnIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellAddress(col: number, row: number): string {
  return `${columnName(col)}${row + 1}`;
}

const ADDRESS = /^([A-Za-z]{1,3})(\d{1,7})$/;

export function parseAddress(text: string): { col: number; row: number } | null {
  const match = ADDRESS.exec(text.replace(/\$/g, ""));
  if (!match) return null;
  const row = Number(match[2]) - 1;
  if (row < 0) return null;
  return { col: columnIndex(match[1]), row };
}

/** Expand "A1:C4" (or a single address) into the list of addresses it covers. */
export function expandRange(text: string): string[] {
  const [left, right] = text.split(":");
  const from = parseAddress(left);
  if (!from) return [];
  if (!right) return [cellAddress(from.col, from.row)];
  const to = parseAddress(right);
  if (!to) return [];
  const out: string[] = [];
  for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
    for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col += 1) {
      out.push(cellAddress(col, row));
    }
  }
  return out;
}

export interface RangeBox { fromCol: number; fromRow: number; toCol: number; toRow: number }

export function rangeBox(text: string): RangeBox | null {
  const [left, right] = text.split(":");
  const from = parseAddress(left);
  if (!from) return null;
  const to = right ? parseAddress(right) : from;
  if (!to) return null;
  return {
    fromCol: Math.min(from.col, to.col),
    fromRow: Math.min(from.row, to.row),
    toCol: Math.max(from.col, to.col),
    toRow: Math.max(from.row, to.row),
  };
}

export function boxLabel(box: RangeBox): string {
  const a = cellAddress(box.fromCol, box.fromRow);
  const b = cellAddress(box.toCol, box.toRow);
  return a === b ? a : `${a}:${b}`;
}

/* ----------------------------- Values ----------------------------- */

export type CellError = "#DIV/0!" | "#VALUE!" | "#REF!" | "#NAME?" | "#CYCLE!" | "#N/A" | "#PARSE!";

export type Scalar = number | string | boolean | null;

export interface CellResult {
  value: Scalar;
  error?: CellError;
  /** True when the cell holds a formula. */
  formula?: boolean;
}

export class EvalError extends Error {
  constructor(public readonly code: CellError) {
    super(code);
    this.name = "EvalError";
  }
}

/* ----------------------------- Tokeniser ----------------------------- */

type TokenType = "number" | "string" | "ident" | "ref" | "range" | "op" | "lparen" | "rparen" | "comma" | "bool";

interface Token { type: TokenType; text: string }

const OPERATORS = ["<>", "<=", ">=", "+", "-", "*", "/", "^", "&", "=", "<", ">", "%"];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n") { i += 1; continue; }
    if (ch === '"') {
      let text = "";
      i += 1;
      while (i < input.length) {
        if (input[i] === '"' && input[i + 1] === '"') { text += '"'; i += 2; continue; }
        if (input[i] === '"') { i += 1; break; }
        text += input[i];
        i += 1;
      }
      tokens.push({ type: "string", text });
      continue;
    }
    if (ch === "(") { tokens.push({ type: "lparen", text: ch }); i += 1; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", text: ch }); i += 1; continue; }
    if (ch === "," || ch === ";") { tokens.push({ type: "comma", text: "," }); i += 1; continue; }
    const two = input.slice(i, i + 2);
    const op = OPERATORS.find((candidate) => candidate.length === 2 && candidate === two)
      ?? OPERATORS.find((candidate) => candidate.length === 1 && candidate === ch);
    const digit = /[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] ?? ""));
    if (digit) {
      let text = "";
      while (i < input.length && /[0-9.]/.test(input[i])) { text += input[i]; i += 1; }
      if ((input[i] === "e" || input[i] === "E") && /[0-9+-]/.test(input[i + 1] ?? "")) {
        text += input[i]; i += 1;
        if (input[i] === "+" || input[i] === "-") { text += input[i]; i += 1; }
        while (i < input.length && /[0-9]/.test(input[i])) { text += input[i]; i += 1; }
      }
      tokens.push({ type: "number", text });
      continue;
    }
    if (/[A-Za-z_$']/.test(ch)) {
      let text = "";
      if (ch === "'") {
        i += 1;
        while (i < input.length && input[i] !== "'") { text += input[i]; i += 1; }
        i += 1;
        if (input[i] === "!") { text += "!"; i += 1; }
        while (i < input.length && /[A-Za-z0-9_$.]/.test(input[i])) { text += input[i]; i += 1; }
      } else {
        while (i < input.length && /[A-Za-z0-9_$.!]/.test(input[i])) { text += input[i]; i += 1; }
      }
      if (input[i] === ":" && ADDRESS.test(stripSheet(text).replace(/\$/g, ""))) {
        let right = "";
        i += 1;
        while (i < input.length && /[A-Za-z0-9_$]/.test(input[i])) { right += input[i]; i += 1; }
        tokens.push({ type: "range", text: `${text}:${right}` });
        continue;
      }
      const upper = text.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") { tokens.push({ type: "bool", text: upper }); continue; }
      if (ADDRESS.test(stripSheet(text).replace(/\$/g, ""))) { tokens.push({ type: "ref", text }); continue; }
      tokens.push({ type: "ident", text });
      continue;
    }
    if (op) { tokens.push({ type: "op", text: op }); i += op.length; continue; }
    throw new EvalError("#PARSE!");
  }
  return tokens;
}

function stripSheet(text: string): string {
  const bang = text.lastIndexOf("!");
  return bang >= 0 ? text.slice(bang + 1) : text;
}

function sheetOf(text: string): string | undefined {
  const bang = text.lastIndexOf("!");
  return bang >= 0 ? text.slice(0, bang) : undefined;
}

/* ----------------------------- Parser ----------------------------- */

export type Node =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ref"; sheet?: string; address: string }
  | { kind: "range"; sheet?: string; from: string; to: string }
  | { kind: "name"; name: string }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "unary"; op: string; operand: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "percent"; operand: Node };

const BINDING: Record<string, number> = {
  "=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1,
  "&": 2,
  "+": 3, "-": 3,
  "*": 4, "/": 4,
  "^": 5,
};

export function parseFormula(source: string): Node {
  const body = source.startsWith("=") ? source.slice(1) : source;
  const tokens = tokenize(body);
  let position = 0;

  function peek(): Token | undefined { return tokens[position]; }
  function take(): Token {
    const token = tokens[position];
    if (!token) throw new EvalError("#PARSE!");
    position += 1;
    return token;
  }

  function parseAtom(): Node {
    const token = take();
    if (token.type === "number") return { kind: "number", value: Number(token.text) };
    if (token.type === "string") return { kind: "string", value: token.text };
    if (token.type === "bool") return { kind: "bool", value: token.text === "TRUE" };
    if (token.type === "ref") return { kind: "ref", sheet: sheetOf(token.text), address: stripSheet(token.text).replace(/\$/g, "").toUpperCase() };
    if (token.type === "range") {
      const [left, right] = token.text.split(":");
      return { kind: "range", sheet: sheetOf(left), from: stripSheet(left).replace(/\$/g, "").toUpperCase(), to: right.replace(/\$/g, "").toUpperCase() };
    }
    if (token.type === "op" && (token.text === "-" || token.text === "+")) {
      return { kind: "unary", op: token.text, operand: parseExpression(6) };
    }
    if (token.type === "lparen") {
      const inner = parseExpression(0);
      const close = take();
      if (close.type !== "rparen") throw new EvalError("#PARSE!");
      return inner;
    }
    if (token.type === "ident") {
      if (peek()?.type === "lparen") {
        take();
        const args: Node[] = [];
        if (peek()?.type !== "rparen") {
          for (;;) {
            args.push(parseExpression(0));
            const next = peek();
            if (next?.type === "comma") { take(); continue; }
            break;
          }
        }
        const close = take();
        if (close.type !== "rparen") throw new EvalError("#PARSE!");
        return { kind: "call", name: token.text.toUpperCase(), args };
      }
      return { kind: "name", name: token.text.toUpperCase() };
    }
    throw new EvalError("#PARSE!");
  }

  function parseExpression(minBinding: number): Node {
    let left = parseAtom();
    for (;;) {
      const token = peek();
      if (!token) break;
      if (token.type === "op" && token.text === "%") { take(); left = { kind: "percent", operand: left }; continue; }
      if (token.type !== "op") break;
      const binding = BINDING[token.text];
      if (binding === undefined || binding < minBinding) break;
      take();
      const right = parseExpression(token.text === "^" ? binding : binding + 1);
      left = { kind: "binary", op: token.text, left, right };
    }
    return left;
  }

  const result = parseExpression(0);
  if (position !== tokens.length) throw new EvalError("#PARSE!");
  return result;
}

/* ----------------------------- Coercion ----------------------------- */

export function toNumber(value: Scalar): number {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) return serialFromMs(date);
    throw new EvalError("#VALUE!");
  }
  return parsed;
}

export function toText(value: Scalar): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return trimNumber(value);
  return value;
}

function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "#NUM!";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1e10) / 1e10);
}

export function toBoolean(value: Scalar): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === "") return false;
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return toNumber(value) !== 0;
}

/* Spreadsheet date serials: day 1 is 1900-01-01, matching the 1900 system
 * (including its leap-year quirk offset of 25569 days to the Unix epoch). */
const EPOCH_OFFSET = 25569;
const DAY_MS = 86400000;

export function serialFromMs(ms: number): number {
  return ms / DAY_MS + EPOCH_OFFSET;
}

export function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - EPOCH_OFFSET) * DAY_MS));
}

export function serialFromParts(year: number, month: number, day: number): number {
  return serialFromMs(Date.UTC(year, month - 1, day));
}

/* ----------------------------- Functions ----------------------------- */

export interface EvalEnv {
  /** Resolved value of one cell on one sheet. */
  cell: (sheet: string | undefined, address: string) => Scalar;
  /** Flattened values of a range, row-major. */
  range: (sheet: string | undefined, from: string, to: string) => Scalar[];
  /** Range as a grid, used by VLOOKUP. */
  grid: (sheet: string | undefined, from: string, to: string) => Scalar[][];
  named: (name: string) => { from: string; to: string; sheet?: string } | undefined;
  now: Date;
}

type Fn = (args: Node[], env: EvalEnv, evaluate: (node: Node) => Scalar) => Scalar;

function flatten(args: Node[], env: EvalEnv, evaluate: (node: Node) => Scalar): Scalar[] {
  const out: Scalar[] = [];
  for (const arg of args) {
    if (arg.kind === "range") out.push(...env.range(arg.sheet, arg.from, arg.to));
    else if (arg.kind === "name") {
      const found = env.named(arg.name);
      if (!found) throw new EvalError("#NAME?");
      out.push(...env.range(found.sheet, found.from, found.to));
    } else out.push(evaluate(arg));
  }
  return out;
}

function numbers(values: Scalar[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (value === null || value === "") continue;
    if (typeof value === "boolean") continue;
    if (typeof value === "number") { out.push(value); continue; }
    const parsed = Number(String(value).trim());
    if (!Number.isNaN(parsed)) out.push(parsed);
  }
  return out;
}

/** "> 100", "<=3", "apple", "*ford" — the criteria grammar SUMIF/COUNTIF use. */
export function matchesCriterion(value: Scalar, criterion: Scalar): boolean {
  const text = toText(criterion).trim();
  const comparison = /^(<=|>=|<>|<|>|=)(.*)$/.exec(text);
  if (comparison) {
    const op = comparison[1];
    const operand = comparison[2].trim();
    const operandNumber = Number(operand);
    if (operand !== "" && !Number.isNaN(operandNumber) && value !== null && value !== "") {
      const left = Number(toText(value));
      if (!Number.isNaN(left)) {
        if (op === "<") return left < operandNumber;
        if (op === "<=") return left <= operandNumber;
        if (op === ">") return left > operandNumber;
        if (op === ">=") return left >= operandNumber;
        if (op === "=") return left === operandNumber;
        return left !== operandNumber;
      }
    }
    const left = toText(value).toUpperCase();
    const right = operand.toUpperCase();
    if (op === "=") return left === right;
    if (op === "<>") return left !== right;
    if (op === "<") return left < right;
    if (op === "<=") return left <= right;
    if (op === ">") return left > right;
    return left >= right;
  }
  if (text.includes("*") || text.includes("?")) {
    const pattern = new RegExp(`^${text.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
    return pattern.test(toText(value));
  }
  const asNumber = Number(text);
  if (text !== "" && !Number.isNaN(asNumber) && value !== null && value !== "") {
    const left = Number(toText(value));
    if (!Number.isNaN(left)) return left === asNumber;
  }
  return toText(value).toUpperCase() === text.toUpperCase();
}

function rangeOf(arg: Node, env: EvalEnv): { sheet?: string; from: string; to: string } {
  if (arg.kind === "range") return { sheet: arg.sheet, from: arg.from, to: arg.to };
  if (arg.kind === "ref") return { sheet: arg.sheet, from: arg.address, to: arg.address };
  if (arg.kind === "name") {
    const found = env.named(arg.name);
    if (!found) throw new EvalError("#NAME?");
    return found;
  }
  throw new EvalError("#VALUE!");
}

/* Values of a range argument, row-major, for the *IFS family. */
function rangeValues(arg: Node, env: EvalEnv): Scalar[] {
  const target = rangeOf(arg, env);
  return env.range(target.sheet, target.from, target.to);
}

/* A one-row or one-column range as a list; a block is refused. */
function vectorValues(arg: Node, env: EvalEnv): Scalar[] {
  const target = rangeOf(arg, env);
  const grid = env.grid(target.sheet, target.from, target.to);
  if (grid.length > 1 && (grid[0]?.length ?? 0) > 1) throw new EvalError("#VALUE!");
  return grid.flat();
}

/* Pairs of (range, criterion): true where every pair matches. Sizes must agree. */
function criteriaMask(pairs: Node[], env: EvalEnv, evaluate: (node: Node) => Scalar, size: number): boolean[] {
  const mask = new Array<boolean>(size).fill(true);
  for (let index = 0; index < pairs.length; index += 2) {
    const keys = rangeValues(pairs[index], env);
    if (keys.length !== size) throw new EvalError("#VALUE!");
    const criterion = evaluate(pairs[index + 1]);
    keys.forEach((key, at) => { if (mask[at] && !matchesCriterion(key, criterion)) mask[at] = false; });
  }
  return mask;
}

function sameKey(a: Scalar, b: Scalar): boolean {
  if (typeof a !== "boolean" && typeof b !== "boolean" && isNumeric(a) && isNumeric(b)) return toNumber(a) === toNumber(b);
  return toText(a).toUpperCase() === toText(b).toUpperCase();
}

function compareScalars(a: Scalar, b: Scalar): number {
  if (isNumeric(a) && isNumeric(b)) return toNumber(a) - toNumber(b);
  const left = toText(a).toUpperCase();
  const right = toText(b).toUpperCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

/* HLOOKUP reads the transposed table: find the key in the first column. */
function lookupRow(grid: Scalar[][], needle: Scalar, column: number, approximate: boolean): Scalar {
  if (column < 1) throw new EvalError("#VALUE!");
  let best: Scalar[] | undefined;
  for (const row of grid) {
    if (column > row.length) throw new EvalError("#REF!");
    const keyValue = row[0];
    if (!approximate) {
      if (sameKey(keyValue, needle)) return row[column - 1] ?? null;
      continue;
    }
    if (isNumeric(keyValue) && isNumeric(needle)) {
      if (toNumber(keyValue) <= toNumber(needle)) best = row;
      else break;
    } else if (sameKey(keyValue, needle)) {
      return row[column - 1] ?? null;
    }
  }
  if (best) return best[column - 1] ?? null;
  throw new EvalError("#N/A");
}

function roundAway(value: number, places: number, direction: "up" | "down"): number {
  const factor = 10 ** places;
  const scaled = Math.abs(value) * factor;
  const cleaned = Math.abs(scaled - Math.round(scaled)) < 1e-9 ? Math.round(scaled) : scaled;
  const magnitude = direction === "up" ? Math.ceil(cleaned) : Math.floor(cleaned);
  return (Math.sign(value) * magnitude) / factor;
}

export const FUNCTIONS: Record<string, Fn> = {
  SUM: (args, env, ev) => numbers(flatten(args, env, ev)).reduce((total, value) => total + value, 0),
  AVERAGE: (args, env, ev) => {
    const list = numbers(flatten(args, env, ev));
    if (list.length === 0) throw new EvalError("#DIV/0!");
    return list.reduce((total, value) => total + value, 0) / list.length;
  },
  MIN: (args, env, ev) => {
    const list = numbers(flatten(args, env, ev));
    return list.length === 0 ? 0 : Math.min(...list);
  },
  MAX: (args, env, ev) => {
    const list = numbers(flatten(args, env, ev));
    return list.length === 0 ? 0 : Math.max(...list);
  },
  COUNT: (args, env, ev) => numbers(flatten(args, env, ev)).length,
  COUNTA: (args, env, ev) => flatten(args, env, ev).filter((value) => value !== null && value !== "").length,
  IF: (args, _env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    return toBoolean(ev(args[0])) ? ev(args[1]) : (args[2] ? ev(args[2]) : false);
  },
  IFERROR: (args, _env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    try { return ev(args[0]); } catch { return ev(args[1]); }
  },
  AND: (args, env, ev) => flatten(args, env, ev).filter((value) => value !== null && value !== "").every((value) => toBoolean(value)),
  OR: (args, env, ev) => flatten(args, env, ev).filter((value) => value !== null && value !== "").some((value) => toBoolean(value)),
  NOT: (args, _env, ev) => {
    if (args.length !== 1) throw new EvalError("#VALUE!");
    return !toBoolean(ev(args[0]));
  },
  ROUND: (args, _env, ev) => {
    const value = toNumber(ev(args[0]));
    const places = args[1] ? Math.trunc(toNumber(ev(args[1]))) : 0;
    const factor = 10 ** places;
    const scaled = value * factor;
    // Spreadsheets round half away from zero, not half up as Math.round does.
    const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
    return rounded / factor;
  },
  ABS: (args, _env, ev) => Math.abs(toNumber(ev(args[0]))),
  CONCAT: (args, env, ev) => flatten(args, env, ev).map((value) => toText(value)).join(""),
  CONCATENATE: (args, env, ev) => flatten(args, env, ev).map((value) => toText(value)).join(""),
  LEFT: (args, _env, ev) => toText(ev(args[0])).slice(0, args[1] ? Math.max(0, Math.trunc(toNumber(ev(args[1])))) : 1),
  RIGHT: (args, _env, ev) => {
    const text = toText(ev(args[0]));
    const count = args[1] ? Math.max(0, Math.trunc(toNumber(ev(args[1])))) : 1;
    return count === 0 ? "" : text.slice(-count);
  },
  LEN: (args, _env, ev) => toText(ev(args[0])).length,
  TRIM: (args, _env, ev) => toText(ev(args[0])).trim(),
  UPPER: (args, _env, ev) => toText(ev(args[0])).toUpperCase(),
  LOWER: (args, _env, ev) => toText(ev(args[0])).toLowerCase(),
  VLOOKUP: (args, env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    const needle = ev(args[0]);
    const table = rangeOf(args[1], env);
    const grid = env.grid(table.sheet, table.from, table.to);
    const column = Math.trunc(toNumber(ev(args[2])));
    if (column < 1) throw new EvalError("#VALUE!");
    const approximate = args[3] ? toBoolean(ev(args[3])) : true;
    let best: Scalar[] | undefined;
    for (const row of grid) {
      if (column > row.length) throw new EvalError("#REF!");
      const key = row[0];
      if (!approximate) {
        if (toText(key).toUpperCase() === toText(needle).toUpperCase()) return row[column - 1] ?? null;
        continue;
      }
      const keyNumber = Number(toText(key));
      const needleNumber = Number(toText(needle));
      if (!Number.isNaN(keyNumber) && !Number.isNaN(needleNumber)) {
        if (keyNumber <= needleNumber) best = row;
        else break;
      } else if (toText(key).toUpperCase() === toText(needle).toUpperCase()) {
        return row[column - 1] ?? null;
      }
    }
    if (best) return best[column - 1] ?? null;
    throw new EvalError("#N/A");
  },
  SUMIF: (args, env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    const target = rangeOf(args[0], env);
    const keys = env.range(target.sheet, target.from, target.to);
    const criterion = ev(args[1]);
    const sumRange = args[2] ? rangeOf(args[2], env) : target;
    const values = env.range(sumRange.sheet, sumRange.from, sumRange.to);
    let total = 0;
    keys.forEach((key, index) => {
      if (!matchesCriterion(key, criterion)) return;
      const value = values[index];
      if (typeof value === "number") total += value;
      else if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) total += Number(value);
    });
    return total;
  },
  COUNTIF: (args, env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    const target = rangeOf(args[0], env);
    const keys = env.range(target.sheet, target.from, target.to);
    const criterion = ev(args[1]);
    return keys.filter((key) => key !== null && key !== "" && matchesCriterion(key, criterion)).length;
  },
  TODAY: (_args, env) => serialFromMs(Date.UTC(env.now.getUTCFullYear(), env.now.getUTCMonth(), env.now.getUTCDate())),
  NOW: (_args, env) => serialFromMs(env.now.getTime()),
  DATE: (args, _env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    return serialFromParts(Math.trunc(toNumber(ev(args[0]))), Math.trunc(toNumber(ev(args[1]))), Math.trunc(toNumber(ev(args[2]))));
  },
  YEAR: (args, _env, ev) => serialToDate(toNumber(ev(args[0]))).getUTCFullYear(),
  MONTH: (args, _env, ev) => serialToDate(toNumber(ev(args[0]))).getUTCMonth() + 1,
  DAY: (args, _env, ev) => serialToDate(toNumber(ev(args[0]))).getUTCDate(),
  /* --- conditional aggregates over several criteria --- */
  SUMIFS: (args, env, ev) => {
    if (args.length < 3 || args.length % 2 === 0) throw new EvalError("#VALUE!");
    const values = rangeValues(args[0], env);
    const mask = criteriaMask(args.slice(1), env, ev, values.length);
    return numbers(values.filter((_value, index) => mask[index])).reduce((total, value) => total + value, 0);
  },
  COUNTIFS: (args, env, ev) => {
    if (args.length < 2 || args.length % 2 === 1) throw new EvalError("#VALUE!");
    const first = rangeValues(args[0], env);
    return criteriaMask(args, env, ev, first.length).filter(Boolean).length;
  },
  AVERAGEIF: (args, env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    const keys = rangeValues(args[0], env);
    const values = args[2] ? rangeValues(args[2], env) : keys;
    const criterion = ev(args[1]);
    const picked = numbers(values.filter((_value, index) => matchesCriterion(keys[index] ?? null, criterion)));
    if (picked.length === 0) throw new EvalError("#DIV/0!");
    return picked.reduce((total, value) => total + value, 0) / picked.length;
  },
  AVERAGEIFS: (args, env, ev) => {
    if (args.length < 3 || args.length % 2 === 0) throw new EvalError("#VALUE!");
    const values = rangeValues(args[0], env);
    const mask = criteriaMask(args.slice(1), env, ev, values.length);
    const picked = numbers(values.filter((_value, index) => mask[index]));
    if (picked.length === 0) throw new EvalError("#DIV/0!");
    return picked.reduce((total, value) => total + value, 0) / picked.length;
  },
  MAXIFS: (args, env, ev) => {
    if (args.length < 3 || args.length % 2 === 0) throw new EvalError("#VALUE!");
    const values = rangeValues(args[0], env);
    const mask = criteriaMask(args.slice(1), env, ev, values.length);
    const picked = numbers(values.filter((_value, index) => mask[index]));
    return picked.length === 0 ? 0 : Math.max(...picked);
  },
  MINIFS: (args, env, ev) => {
    if (args.length < 3 || args.length % 2 === 0) throw new EvalError("#VALUE!");
    const values = rangeValues(args[0], env);
    const mask = criteriaMask(args.slice(1), env, ev, values.length);
    const picked = numbers(values.filter((_value, index) => mask[index]));
    return picked.length === 0 ? 0 : Math.min(...picked);
  },
  /* --- lookup --- */
  HLOOKUP: (args, env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    const table = rangeOf(args[1], env);
    const grid = env.grid(table.sheet, table.from, table.to);
    const transposed = grid[0]?.map((_cell, col) => grid.map((row) => row[col])) ?? [];
    return lookupRow(transposed, ev(args[0]), Math.trunc(toNumber(ev(args[2]))), args[3] ? toBoolean(ev(args[3])) : true);
  },
  MATCH: (args, env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    const needle = ev(args[0]);
    const list = vectorValues(args[1], env);
    const mode = args[2] ? Math.trunc(toNumber(ev(args[2]))) : 1;
    if (mode === 0) {
      const index = list.findIndex((value) => sameKey(value, needle));
      if (index < 0) throw new EvalError("#N/A");
      return index + 1;
    }
    let found = -1;
    for (let index = 0; index < list.length; index += 1) {
      const cmp = compareScalars(list[index], needle);
      if (mode > 0 ? cmp <= 0 : cmp >= 0) found = index;
      else break;
    }
    if (found < 0) throw new EvalError("#N/A");
    return found + 1;
  },
  INDEX: (args, env, ev) => {
    if (args.length < 2) throw new EvalError("#VALUE!");
    const table = rangeOf(args[0], env);
    const grid = env.grid(table.sheet, table.from, table.to);
    let row = Math.trunc(toNumber(ev(args[1])));
    let col = args[2] ? Math.trunc(toNumber(ev(args[2]))) : 1;
    /* A single row given one index is read along the row. */
    if (!args[2] && grid.length === 1) { col = row; row = 1; }
    if (row < 1 || col < 1 || row > grid.length || col > (grid[0]?.length ?? 0)) throw new EvalError("#REF!");
    return grid[row - 1][col - 1] ?? "";
  },
  XLOOKUP: (args, env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    const needle = ev(args[0]);
    const keys = vectorValues(args[1], env);
    const results = vectorValues(args[2], env);
    if (keys.length !== results.length) throw new EvalError("#VALUE!");
    const index = keys.findIndex((value) => sameKey(value, needle));
    if (index >= 0) return results[index];
    if (args[3]) return ev(args[3]);
    throw new EvalError("#N/A");
  },
  IFS: (args, _env, ev) => {
    if (args.length < 2 || args.length % 2 === 1) throw new EvalError("#VALUE!");
    for (let index = 0; index < args.length; index += 2) if (toBoolean(ev(args[index]))) return ev(args[index + 1]);
    throw new EvalError("#N/A");
  },
  /* --- maths --- */
  ROUNDUP: (args, _env, ev) => roundAway(toNumber(ev(args[0])), args[1] ? Math.trunc(toNumber(ev(args[1]))) : 0, "up"),
  ROUNDDOWN: (args, _env, ev) => roundAway(toNumber(ev(args[0])), args[1] ? Math.trunc(toNumber(ev(args[1]))) : 0, "down"),
  INT: (args, _env, ev) => Math.floor(toNumber(ev(args[0]))),
  MOD: (args, _env, ev) => {
    const a = toNumber(ev(args[0]));
    const b = toNumber(ev(args[1]));
    if (b === 0) throw new EvalError("#DIV/0!");
    return a - b * Math.floor(a / b);
  },
  POWER: (args, _env, ev) => {
    const result = toNumber(ev(args[0])) ** toNumber(ev(args[1]));
    if (!Number.isFinite(result)) throw new EvalError("#VALUE!");
    return result;
  },
  SQRT: (args, _env, ev) => {
    const value = toNumber(ev(args[0]));
    if (value < 0) throw new EvalError("#VALUE!");
    return Math.sqrt(value);
  },
  PRODUCT: (args, env, ev) => numbers(flatten(args, env, ev)).reduce((total, value) => total * value, 1),
  MEDIAN: (args, env, ev) => {
    const list = numbers(flatten(args, env, ev)).sort((a, b) => a - b);
    if (list.length === 0) throw new EvalError("#VALUE!");
    const middle = Math.floor(list.length / 2);
    return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
  },
  COUNTBLANK: (args, env, ev) => flatten(args, env, ev).filter((value) => value === null || value === "").length,
  /* --- text --- */
  MID: (args, _env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    const start = Math.trunc(toNumber(ev(args[1])));
    const count = Math.trunc(toNumber(ev(args[2])));
    if (start < 1 || count < 0) throw new EvalError("#VALUE!");
    return toText(ev(args[0])).slice(start - 1, start - 1 + count);
  },
  SUBSTITUTE: (args, _env, ev) => {
    if (args.length < 3) throw new EvalError("#VALUE!");
    const text = toText(ev(args[0]));
    const from = toText(ev(args[1]));
    const to = toText(ev(args[2]));
    if (!from) return text;
    if (!args[3]) return text.split(from).join(to);
    const nth = Math.trunc(toNumber(ev(args[3])));
    let seen = 0;
    return text.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), (match) => { seen += 1; return seen === nth ? to : match; });
  },
  /* --- information --- */
  ISBLANK: (args, _env, ev) => { const value = ev(args[0]); return value === null || value === ""; },
  ISNUMBER: (args, _env, ev) => typeof ev(args[0]) === "number",
  ISTEXT: (args, _env, ev) => { const value = ev(args[0]); return typeof value === "string" && value !== ""; },
  ISERROR: (args, _env, ev) => {
    try { ev(args[0]); return false; } catch (error) { if (error instanceof EvalError) return true; throw error; }
  },
};

export const FUNCTION_HELP: { name: string; signature: string; summary: string }[] = [
  { name: "SUM", signature: "SUM(range, …)", summary: "Adds every number in the ranges and values given." },
  { name: "AVERAGE", signature: "AVERAGE(range, …)", summary: "Mean of the numeric cells; blanks and text are skipped." },
  { name: "MIN", signature: "MIN(range, …)", summary: "Smallest number in the arguments." },
  { name: "MAX", signature: "MAX(range, …)", summary: "Largest number in the arguments." },
  { name: "COUNT", signature: "COUNT(range, …)", summary: "How many cells hold a number." },
  { name: "COUNTA", signature: "COUNTA(range, …)", summary: "How many cells are not empty." },
  { name: "IF", signature: "IF(test, then, else)", summary: "Chooses between two values on a condition." },
  { name: "IFERROR", signature: "IFERROR(value, fallback)", summary: "Returns the fallback when the first argument errors." },
  { name: "AND", signature: "AND(a, b, …)", summary: "True when every argument is true." },
  { name: "OR", signature: "OR(a, b, …)", summary: "True when any argument is true." },
  { name: "NOT", signature: "NOT(a)", summary: "Inverts a condition." },
  { name: "ROUND", signature: "ROUND(number, places)", summary: "Rounds half away from zero to the given decimals." },
  { name: "ABS", signature: "ABS(number)", summary: "Magnitude without its sign." },
  { name: "CONCAT", signature: "CONCAT(a, b, …)", summary: "Joins text without a separator." },
  { name: "LEFT", signature: "LEFT(text, count)", summary: "First characters of the text." },
  { name: "RIGHT", signature: "RIGHT(text, count)", summary: "Last characters of the text." },
  { name: "LEN", signature: "LEN(text)", summary: "Number of characters." },
  { name: "TRIM", signature: "TRIM(text)", summary: "Removes leading and trailing spaces." },
  { name: "UPPER", signature: "UPPER(text)", summary: "Upper-case text." },
  { name: "LOWER", signature: "LOWER(text)", summary: "Lower-case text." },
  { name: "VLOOKUP", signature: "VLOOKUP(key, table, column, [approximate])", summary: "Finds the key in the first column and returns another column of that row." },
  { name: "SUMIF", signature: "SUMIF(range, criterion, [sum range])", summary: "Adds the cells whose key matches the criterion." },
  { name: "COUNTIF", signature: "COUNTIF(range, criterion)", summary: "Counts the cells matching the criterion." },
  { name: "TODAY", signature: "TODAY()", summary: "Today's date as a serial, from the workspace clock." },
  { name: "NOW", signature: "NOW()", summary: "Current date and time as a serial, from the workspace clock." },
  { name: "DATE", signature: "DATE(year, month, day)", summary: "Builds a date serial." },
  { name: "YEAR", signature: "YEAR(serial)", summary: "Year of a date serial." },
  { name: "MONTH", signature: "MONTH(serial)", summary: "Month of a date serial." },
  { name: "DAY", signature: "DAY(serial)", summary: "Day of a date serial." },
  { name: "SUMIFS", signature: "SUMIFS(sum range, range1, criterion1, …)", summary: "Adds the cells whose row matches every criterion." },
  { name: "COUNTIFS", signature: "COUNTIFS(range1, criterion1, …)", summary: "Counts the rows matching every criterion." },
  { name: "AVERAGEIF", signature: "AVERAGEIF(range, criterion, [average range])", summary: "Mean of the cells whose key matches the criterion." },
  { name: "AVERAGEIFS", signature: "AVERAGEIFS(average range, range1, criterion1, …)", summary: "Mean of the cells whose row matches every criterion." },
  { name: "MAXIFS", signature: "MAXIFS(max range, range1, criterion1, …)", summary: "Largest number whose row matches every criterion." },
  { name: "MINIFS", signature: "MINIFS(min range, range1, criterion1, …)", summary: "Smallest number whose row matches every criterion." },
  { name: "HLOOKUP", signature: "HLOOKUP(key, table, row, [approximate])", summary: "Finds the key in the first row and returns another row of that column." },
  { name: "MATCH", signature: "MATCH(key, range, [type])", summary: "Position of the key in a row or column; 0 is exact, 1 the largest not above, -1 the smallest not below." },
  { name: "INDEX", signature: "INDEX(range, row, [column])", summary: "The value at a row and column of the range." },
  { name: "XLOOKUP", signature: "XLOOKUP(key, lookup range, return range, [if not found])", summary: "Exact-match lookup that returns the matching item of a second range." },
  { name: "IFS", signature: "IFS(test1, value1, …)", summary: "The value of the first test that is true; #N/A when none is." },
  { name: "ROUNDUP", signature: "ROUNDUP(number, places)", summary: "Rounds away from zero." },
  { name: "ROUNDDOWN", signature: "ROUNDDOWN(number, places)", summary: "Rounds towards zero." },
  { name: "INT", signature: "INT(number)", summary: "Rounds down to the nearest integer." },
  { name: "MOD", signature: "MOD(number, divisor)", summary: "Remainder with the sign of the divisor; #DIV/0! for zero." },
  { name: "POWER", signature: "POWER(number, power)", summary: "Raises a number to a power." },
  { name: "SQRT", signature: "SQRT(number)", summary: "Square root; #VALUE! for a negative number." },
  { name: "PRODUCT", signature: "PRODUCT(range, …)", summary: "Multiplies every number in the arguments." },
  { name: "MEDIAN", signature: "MEDIAN(range, …)", summary: "Middle value of the numbers." },
  { name: "COUNTBLANK", signature: "COUNTBLANK(range)", summary: "How many cells are empty." },
  { name: "MID", signature: "MID(text, start, count)", summary: "Characters from the middle of the text." },
  { name: "SUBSTITUTE", signature: "SUBSTITUTE(text, old, new, [instance])", summary: "Replaces text, every time or only the nth time." },
  { name: "ISBLANK", signature: "ISBLANK(value)", summary: "True for an empty cell." },
  { name: "ISNUMBER", signature: "ISNUMBER(value)", summary: "True for a number." },
  { name: "ISTEXT", signature: "ISTEXT(value)", summary: "True for text." },
  { name: "ISERROR", signature: "ISERROR(value)", summary: "True when the value is an error; a formula fed by a circular reference stays #CYCLE!." },
];

/* ----------------------------- Dependencies ----------------------------- */

export interface SheetInput {
  id: string;
  name: string;
  cells: Record<string, string>;
}

export interface NamedRange { name: string; sheetName?: string; ref: string }

export interface WorkbookInput {
  sheets: SheetInput[];
  namedRanges?: NamedRange[];
  now?: Date;
}

/** `Sheet!A1` key used inside the dependency graph. */
function key(sheetName: string, address: string): string { return `${sheetName}!${address}`; }

/** Every cell a formula reads, as graph keys. */
export function precedents(node: Node, sheetName: string, named: (name: string) => NamedRange | undefined): string[] {
  const out: string[] = [];
  function walk(current: Node) {
    switch (current.kind) {
      case "ref":
        out.push(key(current.sheet ?? sheetName, current.address));
        break;
      case "range":
        for (const address of expandRange(`${current.from}:${current.to}`)) out.push(key(current.sheet ?? sheetName, address));
        break;
      case "name": {
        const found = named(current.name);
        if (found) {
          for (const address of expandRange(found.ref)) out.push(key(found.sheetName ?? sheetName, address));
        }
        break;
      }
      case "call":
        current.args.forEach(walk);
        break;
      case "binary":
        walk(current.left); walk(current.right);
        break;
      case "unary":
        walk(current.operand);
        break;
      case "percent":
        walk(current.operand);
        break;
      default:
        break;
    }
  }
  walk(node);
  return out;
}

export interface EvaluationResult {
  /** sheet name → address → result. */
  values: Record<string, Record<string, CellResult>>;
  /** Graph keys in the order they were computed. */
  order: string[];
  /** Graph keys that sit in or depend on a cycle. */
  cycles: string[];
  /** Graph key → the keys it reads. */
  graph: Record<string, string[]>;
  /** Formula cells that failed to parse or evaluate. */
  errors: { key: string; sheetName: string; address: string; source: string; code: CellError }[];
}

function literal(raw: string): Scalar {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const upper = trimmed.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  const asNumber = Number(trimmed.replace(/,/g, ""));
  if (!Number.isNaN(asNumber) && /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)) return asNumber;
  return raw;
}

/**
 * Evaluate a whole workbook. Formula cells are parsed once, a dependency
 * graph is built, strongly connected components are detected (Tarjan) and
 * the remaining cells are computed in topological order, so a value is never
 * read before the cell it depends on has been produced.
 */
export function evaluateWorkbook(input: WorkbookInput): EvaluationResult {
  const now = input.now ?? clockNow();
  const namedList = input.namedRanges ?? [];
  const namedByName = new Map(namedList.map((item) => [item.name.toUpperCase(), item]));
  const named = (name: string) => namedByName.get(name.toUpperCase());

  const sheetByName = new Map(input.sheets.map((sheet) => [sheet.name.toUpperCase(), sheet]));
  const values: Record<string, Record<string, CellResult>> = {};
  for (const sheet of input.sheets) values[sheet.name] = {};

  const formulas = new Map<string, { sheetName: string; address: string; source: string; node?: Node; code?: CellError }>();
  const graph: Record<string, string[]> = {};

  for (const sheet of input.sheets) {
    for (const [address, raw] of Object.entries(sheet.cells)) {
      const normalized = address.toUpperCase();
      if (typeof raw !== "string" || !raw.startsWith("=")) {
        values[sheet.name][normalized] = { value: literal(typeof raw === "string" ? raw : String(raw ?? "")) };
        continue;
      }
      const graphKey = key(sheet.name, normalized);
      try {
        const node = parseFormula(raw);
        formulas.set(graphKey, { sheetName: sheet.name, address: normalized, source: raw, node });
        graph[graphKey] = [...new Set(precedents(node, sheet.name, named))];
      } catch {
        formulas.set(graphKey, { sheetName: sheet.name, address: normalized, source: raw, code: "#PARSE!" });
        graph[graphKey] = [];
      }
    }
  }

  const cycles = findCycles(graph, formulas);
  const errors: EvaluationResult["errors"] = [];

  for (const graphKey of cycles) {
    const entry = formulas.get(graphKey);
    if (!entry) continue;
    values[entry.sheetName][entry.address] = { value: null, error: "#CYCLE!", formula: true };
    errors.push({ key: graphKey, sheetName: entry.sheetName, address: entry.address, source: entry.source, code: "#CYCLE!" });
  }

  const order = topologicalOrder(graph, formulas, new Set(cycles));

  function readCell(sheetName: string | undefined, address: string): Scalar {
    const sheet = sheetName ? sheetByName.get(sheetName.toUpperCase()) : undefined;
    const resolvedName = sheet?.name ?? sheetName;
    if (sheetName && !sheet) throw new EvalError("#REF!");
    const table = resolvedName ? values[resolvedName] : undefined;
    if (!table) throw new EvalError("#REF!");
    const found = table[address.toUpperCase()];
    if (!found) return "";
    if (found.error) throw new EvalError(found.error);
    return found.value;
  }

  for (const graphKey of order) {
    const entry = formulas.get(graphKey);
    if (!entry || !entry.node) {
      if (entry) {
        values[entry.sheetName][entry.address] = { value: null, error: entry.code ?? "#PARSE!", formula: true };
        errors.push({ key: graphKey, sheetName: entry.sheetName, address: entry.address, source: entry.source, code: entry.code ?? "#PARSE!" });
      }
      continue;
    }
    const env: EvalEnv = {
      now,
      cell: (sheetName, address) => readCell(sheetName ?? entry.sheetName, address),
      range: (sheetName, from, to) => expandRange(`${from}:${to}`).map((address) => readCell(sheetName ?? entry.sheetName, address)),
      grid: (sheetName, from, to) => {
        const box = rangeBox(`${from}:${to}`);
        if (!box) throw new EvalError("#REF!");
        const rows: Scalar[][] = [];
        for (let row = box.fromRow; row <= box.toRow; row += 1) {
          const line: Scalar[] = [];
          for (let col = box.fromCol; col <= box.toCol; col += 1) line.push(readCell(sheetName ?? entry.sheetName, cellAddress(col, row)));
          rows.push(line);
        }
        return rows;
      },
      named: (name) => {
        const found = named(name);
        if (!found) return undefined;
        const [from, to] = found.ref.includes(":") ? found.ref.split(":") : [found.ref, found.ref];
        return { from: from.toUpperCase(), to: to.toUpperCase(), sheet: found.sheetName };
      },
    };
    try {
      const value = evaluateNode(entry.node, env);
      values[entry.sheetName][entry.address] = { value, formula: true };
    } catch (error) {
      const code = error instanceof EvalError ? error.code : "#VALUE!";
      values[entry.sheetName][entry.address] = { value: null, error: code, formula: true };
      errors.push({ key: graphKey, sheetName: entry.sheetName, address: entry.address, source: entry.source, code });
    }
  }

  return { values, order, cycles, graph, errors };
}

export function evaluateNode(node: Node, env: EvalEnv): Scalar {
  const ev = (inner: Node): Scalar => evaluateNode(inner, env);
  switch (node.kind) {
    case "number": return node.value;
    case "string": return node.value;
    case "bool": return node.value;
    case "ref": return env.cell(node.sheet, node.address);
    case "range": {
      const list = env.range(node.sheet, node.from, node.to);
      return list.length ? list[0] : "";
    }
    case "name": {
      const found = env.named(node.name);
      if (!found) throw new EvalError("#NAME?");
      const list = env.range(found.sheet, found.from, found.to);
      return list.length === 1 ? list[0] : (list.length ? list[0] : "");
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new EvalError("#NAME?");
      return fn(node.args, env, ev);
    }
    case "unary": {
      const value = toNumber(ev(node.operand));
      return node.op === "-" ? -value : value;
    }
    case "percent": return toNumber(ev(node.operand)) / 100;
    case "binary": {
      const op = node.op;
      if (op === "&") return toText(ev(node.left)) + toText(ev(node.right));
      const left = ev(node.left);
      const right = ev(node.right);
      if (op === "=" || op === "<>" || op === "<" || op === "<=" || op === ">" || op === ">=") {
        const bothNumeric = isNumeric(left) && isNumeric(right);
        const a: number | string = bothNumeric ? toNumber(left) : toText(left).toUpperCase();
        const b: number | string = bothNumeric ? toNumber(right) : toText(right).toUpperCase();
        if (op === "=") return a === b;
        if (op === "<>") return a !== b;
        if (op === "<") return a < b;
        if (op === "<=") return a <= b;
        if (op === ">") return a > b;
        return a >= b;
      }
      const a = toNumber(left);
      const b = toNumber(right);
      if (op === "+") return a + b;
      if (op === "-") return a - b;
      if (op === "*") return a * b;
      if (op === "/") {
        if (b === 0) throw new EvalError("#DIV/0!");
        return a / b;
      }
      if (op === "^") return a ** b;
      throw new EvalError("#PARSE!");
    }
    default: throw new EvalError("#PARSE!");
  }
}

function isNumeric(value: Scalar): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (value === null) return false;
  const trimmed = value.trim();
  return trimmed !== "" && !Number.isNaN(Number(trimmed));
}

/**
 * Tarjan strongly connected components. Any component of more than one node,
 * or a node that reads itself, is a cycle; everything that transitively reads
 * a cycle is poisoned with it so the error is explicit rather than a stale
 * number.
 */
function findCycles(graph: Record<string, string[]>, formulas: Map<string, unknown>): string[] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const inCycle = new Set<string>();
  let counter = 0;

  const nodes = Object.keys(graph);

  function strongConnect(node: string) {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph[node] ?? []) {
      if (!formulas.has(next)) continue;
      if (!index.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      for (;;) {
        const popped = stack.pop()!;
        onStack.delete(popped);
        component.push(popped);
        if (popped === node) break;
      }
      const selfReading = component.length === 1 && (graph[component[0]] ?? []).includes(component[0]);
      if (component.length > 1 || selfReading) for (const member of component) inCycle.add(member);
    }
  }

  for (const node of nodes) if (!index.has(node)) strongConnect(node);

  // Poison anything that reads a cycle.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (inCycle.has(node)) continue;
      if ((graph[node] ?? []).some((next) => inCycle.has(next))) { inCycle.add(node); changed = true; }
    }
  }
  return [...inCycle].sort();
}

/** Kahn's algorithm over formula cells only, with a stable tie-break. */
function topologicalOrder(graph: Record<string, string[]>, formulas: Map<string, unknown>, skip: Set<string>): string[] {
  const nodes = Object.keys(graph).filter((node) => !skip.has(node)).sort();
  const dependsOn = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    const list = (graph[node] ?? []).filter((next) => formulas.has(next) && !skip.has(next));
    dependsOn.set(node, new Set(list));
    for (const next of list) {
      const existing = dependents.get(next) ?? [];
      existing.push(node);
      dependents.set(next, existing);
    }
  }
  const ready = nodes.filter((node) => (dependsOn.get(node)?.size ?? 0) === 0);
  const order: string[] = [];
  while (ready.length) {
    ready.sort();
    const node = ready.shift()!;
    order.push(node);
    for (const dependent of dependents.get(node) ?? []) {
      const set = dependsOn.get(dependent);
      if (!set) continue;
      set.delete(node);
      if (set.size === 0) ready.push(dependent);
    }
  }
  // Anything left is unreachable because of a cycle we already flagged.
  for (const node of nodes) if (!order.includes(node)) order.push(node);
  return order;
}

/* ----------------------------- CSV ----------------------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i += 1; continue; }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { quoted = true; i += 1; continue; }
    if (ch === ",") { row.push(field); field = ""; i += 1; continue; }
    if (ch === "\r") { i += 1; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
    .join("\n");
}
