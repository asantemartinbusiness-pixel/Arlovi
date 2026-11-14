export interface CellResult {
  value: number | string;
  error?: string;
}

function colToIndex(col: string): number {
  let n = 0;
  for (const char of col) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

export function parseAddress(ref: string): { c: number; r: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!match) return null;
  return { c: colToIndex(match[1]), r: Number(match[2]) - 1 };
}

export function addressOf(c: number, r: number): string {
  let n = c + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return `${label}${r + 1}`;
}

function expandRange(start: string, end: string): string[] {
  const a = parseAddress(start);
  const b = parseAddress(end);
  if (!a || !b) throw new Error("#REF");
  const refs: string[] = [];
  const c1 = Math.min(a.c, b.c);
  const c2 = Math.max(a.c, b.c);
  const r1 = Math.min(a.r, b.r);
  const r2 = Math.max(a.r, b.r);
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) refs.push(addressOf(c, r));
  }
  return refs;
}

class FormulaParser {
  private index = 0;
  constructor(
    private readonly source: string,
    private readonly cell: (addr: string) => CellResult,
  ) {}

  parse(): number {
    const value = this.parseAdd();
    if (this.index < this.source.length) throw new Error("#VALUE");
    return value;
  }

  private parseAdd(): number {
    let value = this.parseMul();
    while (this.source[this.index] === "+" || this.source[this.index] === "-") {
      const op = this.source[this.index];
      this.index += 1;
      const right = this.parseMul();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseMul(): number {
    let value = this.parseUnary();
    while (this.source[this.index] === "*" || this.source[this.index] === "/") {
      const op = this.source[this.index];
      this.index += 1;
      const right = this.parseUnary();
      if (op === "/" && right === 0) throw new Error("#DIV/0");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.source[this.index] === "-") {
      this.index += 1;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    if (this.source[this.index] === "(") {
      this.index += 1;
      const value = this.parseAdd();
      if (this.source[this.index] !== ")") throw new Error("#VALUE");
      this.index += 1;
      return value;
    }
    const fn = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(/i.exec(this.source.slice(this.index));
    if (fn) {
      this.index += fn[0].length;
      const args = this.parseArgs();
      if (this.source[this.index] !== ")") throw new Error("#VALUE");
      this.index += 1;
      return applyFn(fn[1].toUpperCase(), args);
    }
    const ref = /^[A-Z]+\d+/.exec(this.source.slice(this.index));
    if (ref) {
      this.index += ref[0].length;
      return asNumber(this.cell(ref[0]));
    }
    const num = /^\d+(\.\d+)?/.exec(this.source.slice(this.index));
    if (num) {
      this.index += num[0].length;
      return Number(num[0]);
    }
    throw new Error("#VALUE");
  }

  private parseArgs(): number[] {
    const values: number[] = [];
    if (this.source[this.index] === ")") return values;
    for (;;) {
      const range = /^([A-Z]+\d+):([A-Z]+\d+)/.exec(this.source.slice(this.index));
      if (range) {
        this.index += range[0].length;
        for (const addr of expandRange(range[1], range[2])) values.push(asNumber(this.cell(addr)));
      } else {
        values.push(this.parseAdd());
      }
      if (this.source[this.index] === ",") {
        this.index += 1;
        continue;
      }
      break;
    }
    return values;
  }
}

function asNumber(cell: CellResult): number {
  if (cell.error) throw new Error(cell.error);
  if (typeof cell.value === "number") return cell.value;
  if (cell.value === "") return 0;
  const numeric = Number(cell.value);
  if (Number.isNaN(numeric)) throw new Error("#VALUE");
  return numeric;
}

function applyFn(name: string, args: number[]): number {
  if (name === "COUNT") return args.length;
  if (args.length === 0) throw new Error("#DIV/0");
  if (name === "SUM") return args.reduce((sum, value) => sum + value, 0);
  if (name === "MIN") return Math.min(...args);
  if (name === "MAX") return Math.max(...args);
  if (name === "AVERAGE") return args.reduce((sum, value) => sum + value, 0) / args.length;
  throw new Error("#NAME");
}

export function evaluateSheet(cells: Record<string, string>): Record<string, CellResult> {
  const visiting = new Set<string>();
  const memo = new Map<string, CellResult>();
  const lookup = (addr: string): CellResult => {
    const key = addr.toUpperCase();
    const cached = memo.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return { value: "#CYCLE", error: "#CYCLE" };
    visiting.add(key);
    const raw = (cells[key] ?? cells[addr] ?? "").trim();
    let result: CellResult;
    if (raw.startsWith("=")) {
      try {
        const parser = new FormulaParser(raw.slice(1).replace(/\s+/g, "").toUpperCase(), lookup);
        result = { value: parser.parse() };
      } catch (error) {
        const message = error instanceof Error ? error.message : "#VALUE";
        result = { value: message, error: message };
      }
    } else if (raw === "") {
      result = { value: "" };
    } else if (!Number.isNaN(Number(raw))) {
      result = { value: Number(raw) };
    } else {
      result = { value: raw };
    }
    visiting.delete(key);
    memo.set(key, result);
    return result;
  };
  const output: Record<string, CellResult> = {};
  for (const key of Object.keys(cells)) output[key.toUpperCase()] = lookup(key);
  return output;
}

export function sheetCells(body: unknown): Record<string, string> {
  const sheets = (body as { sheets?: { cells?: Record<string, string> }[] } | undefined)?.sheets;
  return sheets?.[0]?.cells ?? {};
}
