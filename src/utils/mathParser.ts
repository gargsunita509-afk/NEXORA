/**
 * Safe Mathematical Expression Parser & Evaluator for Class 11 Mathematics
 * Uses Lexer/Tokenizer + Recursive Descent Parser with explicit Operator Precedence.
 * No eval() or Function() used.
 */

export type AngleMode = 'DEG' | 'RAD';

export interface StatResult {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  variance: number;
  stdev: number;
  min: number;
  max: number;
}

// Factorial helper
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Factorial requires a non-negative integer');
  }
  if (n > 170) {
    throw new Error('Overflow: Factorial result too large (> 170!)');
  }
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

// Permutation: nPr = n! / (n - r)!
export function permutation(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw new Error('nPr requires integers where n ≥ r ≥ 0');
  }
  return factorial(n) / factorial(n - r);
}

// Combination: nCr = n! / (r! * (n - r)!)
export function combination(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw new Error('nCr requires integers where n ≥ r ≥ 0');
  }
  return factorial(n) / (factorial(r) * factorial(n - r));
}

type TokenType =
  | 'NUMBER'
  | 'IDENTIFIER'
  | 'PLUS'
  | 'MINUS'
  | 'MUL'
  | 'DIV'
  | 'POW'
  | 'MOD'
  | 'PERCENT'
  | 'FACTORIAL'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

class Lexer {
  private pos = 0;
  private input: string;

  constructor(input: string) {
    // Normalize pipe absolute-value syntax |x| to abs(x)
    this.input = this.normalizeInput(input);
  }

  private normalizeInput(raw: string): string {
    let str = raw
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/−/g, '-');

    // Convert |expr| to abs(expr)
    // Matches |...| without overlapping
    let pipeOpen = false;
    let normalized = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '|') {
        if (!pipeOpen) {
          normalized += 'abs(';
          pipeOpen = true;
        } else {
          normalized += ')';
          pipeOpen = false;
        }
      } else {
        normalized += char;
      }
    }
    return normalized;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      if (/\s/.test(char)) {
        this.pos++;
        continue;
      }

      // Numbers (including scientific notation e.g., 1.5e3, 2.5E-4)
      if (/\d/.test(char) || (char === '.' && /\d/.test(this.input[this.pos + 1] || ''))) {
        let numStr = '';
        while (
          this.pos < this.input.length &&
          /[\d.]/.test(this.input[this.pos])
        ) {
          numStr += this.input[this.pos++];
        }
        // Check for scientific notation (e.g. 1.2e+5)
        if (
          this.pos < this.input.length &&
          /[eE]/.test(this.input[this.pos]) &&
          /[\d+-]/.test(this.input[this.pos + 1] || '')
        ) {
          numStr += this.input[this.pos++]; // e or E
          if (/[\+\-]/.test(this.input[this.pos])) {
            numStr += this.input[this.pos++];
          }
          while (this.pos < this.input.length && /\d/.test(this.input[this.pos])) {
            numStr += this.input[this.pos++];
          }
        }
        tokens.push({ type: 'NUMBER', value: numStr });
        continue;
      }

      // Identifiers / Function names / Keywords
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
          ident += this.input[this.pos++];
        }
        const lower = ident.toLowerCase();
        if (lower === 'mod') {
          tokens.push({ type: 'MOD', value: 'mod' });
        } else {
          tokens.push({ type: 'IDENTIFIER', value: lower });
        }
        continue;
      }

      // Operators
      switch (char) {
        case '+':
          tokens.push({ type: 'PLUS', value: '+' });
          this.pos++;
          break;
        case '-':
          tokens.push({ type: 'MINUS', value: '-' });
          this.pos++;
          break;
        case '*':
          tokens.push({ type: 'MUL', value: '*' });
          this.pos++;
          break;
        case '/':
          tokens.push({ type: 'DIV', value: '/' });
          this.pos++;
          break;
        case '^':
          tokens.push({ type: 'POW', value: '^' });
          this.pos++;
          break;
        case '%':
          tokens.push({ type: 'PERCENT', value: '%' });
          this.pos++;
          break;
        case '!':
          tokens.push({ type: 'FACTORIAL', value: '!' });
          this.pos++;
          break;
        case '(':
          tokens.push({ type: 'LPAREN', value: '(' });
          this.pos++;
          break;
        case ')':
          tokens.push({ type: 'RPAREN', value: ')' });
          this.pos++;
          break;
        case ',':
          tokens.push({ type: 'COMMA', value: ',' });
          this.pos++;
          break;
        default:
          throw new Error(`Unexpected character '${char}' at index ${this.pos}`);
      }
    }

    tokens.push({ type: 'EOF', value: '' });
    return this.insertImplicitMultiplication(tokens);
  }

  // Insert implicit multiplication e.g., 2(3), 3pi, 4sin(30), (2)(3)
  private insertImplicitMultiplication(tokens: Token[]): Token[] {
    const result: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      result.push(cur);

      if (i < tokens.length - 1) {
        const next = tokens[i + 1];

        const isCurRightSide =
          cur.type === 'NUMBER' ||
          cur.type === 'RPAREN' ||
          cur.type === 'FACTORIAL' ||
          (cur.type === 'IDENTIFIER' && (cur.value === 'pi' || cur.value === 'e'));

        const isNextLeftSide =
          next.type === 'NUMBER' ||
          next.type === 'LPAREN' ||
          next.type === 'IDENTIFIER';

        // Exceptions: nPr, nCr, mod are binary operators
        const isBinaryKeyword =
          next.type === 'MOD' ||
          (next.type === 'IDENTIFIER' && (next.value === 'npr' || next.value === 'ncr'));

        if (isCurRightSide && isNextLeftSide && !isBinaryKeyword) {
          result.push({ type: 'MUL', value: '*' });
        }
      }
    }
    return result;
  }
}

export class MathEvaluator {
  private tokens: Token[] = [];
  private current = 0;
  private angleMode: AngleMode;

  constructor(angleMode: AngleMode = 'DEG') {
    this.angleMode = angleMode;
  }

  setAngleMode(mode: AngleMode) {
    this.angleMode = mode;
  }

  evaluate(expression: string): number {
    if (!expression || !expression.trim()) {
      throw new Error('Empty expression');
    }

    const lexer = new Lexer(expression);
    this.tokens = lexer.tokenize();
    this.current = 0;

    const val = this.parseExpression();

    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token '${this.peek().value}' after expression`);
    }

    if (Number.isNaN(val)) {
      throw new Error('Result is undefined (NaN)');
    }
    if (!Number.isFinite(val)) {
      throw new Error('Math Overflow / Division by Zero (Infinity)');
    }

    // Clean small floating point precision errors (e.g. sin(180) -> 0 instead of 1.22e-16)
    return Math.abs(val) < 1e-14 ? 0 : Number(val.toPrecision(12)) / 1;
  }

  // Precedence level 1: + and -
  private parseExpression(): number {
    let result = this.parseTerm();

    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.consume();
      const right = this.parseTerm();
      if (op.type === 'PLUS') {
        result += right;
      } else {
        result -= right;
      }
    }

    return result;
  }

  // Precedence level 2: *, /, %, and combinatorics nPr, nCr, mod
  private parseTerm(): number {
    let result = this.parsePower();

    while (
      this.peek().type === 'MUL' ||
      this.peek().type === 'DIV' ||
      this.peek().type === 'PERCENT' ||
      this.peek().type === 'MOD' ||
      (this.peek().type === 'IDENTIFIER' && (this.peek().value === 'npr' || this.peek().value === 'ncr'))
    ) {
      const token = this.consume();
      if (token.type === 'MUL') {
        result *= this.parsePower();
      } else if (token.type === 'DIV') {
        const divisor = this.parsePower();
        if (divisor === 0) {
          throw new Error('Division by zero');
        }
        result /= divisor;
      } else if (token.type === 'PERCENT') {
        // Class 11 percentage: e.g. 50% = 0.5 or 200 * 15%
        result = result / 100;
      } else if (token.type === 'MOD') {
        const m = this.parsePower();
        if (m === 0) throw new Error('Modulo by zero');
        // Mathematical remainder: 17 mod 5 = 2
        result = ((result % m) + m) % m;
      } else if (token.type === 'IDENTIFIER' && token.value === 'npr') {
        const r = this.parsePower();
        result = permutation(result, r);
      } else if (token.type === 'IDENTIFIER' && token.value === 'ncr') {
        const r = this.parsePower();
        result = combination(result, r);
      }
    }

    return result;
  }

  // Precedence level 3: Power ^ (right-associative)
  private parsePower(): number {
    let base = this.parseUnary();

    if (this.peek().type === 'POW') {
      this.consume();
      const exponent = this.parsePower(); // Right-associative
      base = Math.pow(base, exponent);
    }

    return base;
  }

  // Precedence level 4: Unary + or -
  private parseUnary(): number {
    if (this.peek().type === 'MINUS') {
      this.consume();
      return -this.parseUnary();
    }
    if (this.peek().type === 'PLUS') {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  // Precedence level 5: Factorial !
  private parsePostfix(): number {
    let val = this.parsePrimary();

    while (this.peek().type === 'FACTORIAL') {
      this.consume();
      val = factorial(val);
    }

    return val;
  }

  // Precedence level 6: Primary values, parentheses, functions, constants
  private parsePrimary(): number {
    const token = this.peek();

    // Number
    if (token.type === 'NUMBER') {
      this.consume();
      const num = parseFloat(token.value);
      if (Number.isNaN(num)) throw new Error(`Invalid number: ${token.value}`);
      return num;
    }

    // Parentheses
    if (token.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpression();
      if (this.peek().type !== 'RPAREN') {
        throw new Error("Missing closing parenthesis ')'");
      }
      this.consume(); // consume ')'
      return val;
    }

    // Identifiers: Functions and Constants
    if (token.type === 'IDENTIFIER') {
      this.consume();
      const name = token.value.toLowerCase();

      // Constants
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;

      // Function calls require '('
      if (this.peek().type === 'LPAREN') {
        this.consume(); // '('
        const arg = this.parseExpression();
        let secondArg: number | null = null;

        if (this.peek().type === 'COMMA') {
          this.consume();
          secondArg = this.parseExpression();
        }

        if (this.peek().type !== 'RPAREN') {
          throw new Error(`Expected ')' after function ${name}`);
        }
        this.consume(); // ')'

        return this.executeFunction(name, arg, secondArg);
      }

      throw new Error(`Unknown identifier '${name}'`);
    }

    throw new Error(`Unexpected token '${token.value || token.type}'`);
  }

  private executeFunction(fn: string, arg: number, secondArg: number | null): number {
    switch (fn) {
      case 'sin': {
        const rad = this.angleMode === 'DEG' ? (arg * Math.PI) / 180 : arg;
        return Math.sin(rad);
      }
      case 'cos': {
        const rad = this.angleMode === 'DEG' ? (arg * Math.PI) / 180 : arg;
        return Math.cos(rad);
      }
      case 'tan': {
        const rad = this.angleMode === 'DEG' ? (arg * Math.PI) / 180 : arg;
        // Check for asymptotes at 90°, 270°, etc.
        if (this.angleMode === 'DEG' && Math.abs((arg % 180) - 90) < 1e-9) {
          throw new Error('tan is undefined at 90° + k·180°');
        }
        return Math.tan(rad);
      }
      case 'asin': {
        if (arg < -1 || arg > 1) throw new Error('Domain error: asin domain is [-1, 1]');
        const res = Math.asin(arg);
        return this.angleMode === 'DEG' ? (res * 180) / Math.PI : res;
      }
      case 'acos': {
        if (arg < -1 || arg > 1) throw new Error('Domain error: acos domain is [-1, 1]');
        const res = Math.acos(arg);
        return this.angleMode === 'DEG' ? (res * 180) / Math.PI : res;
      }
      case 'atan': {
        const res = Math.atan(arg);
        return this.angleMode === 'DEG' ? (res * 180) / Math.PI : res;
      }
      case 'sqrt': {
        if (arg < 0) throw new Error('Domain error: sqrt of negative number');
        return Math.sqrt(arg);
      }
      case 'cbrt':
        return Math.cbrt(arg);
      case 'log': {
        if (arg <= 0) throw new Error('Domain error: log of non-positive number');
        return Math.log10(arg);
      }
      case 'ln': {
        if (arg <= 0) throw new Error('Domain error: ln of non-positive number');
        return Math.log(arg);
      }
      case 'abs':
        return Math.abs(arg);
      case 'fact':
        return factorial(arg);
      case 'npr':
        if (secondArg === null) throw new Error('nPr requires two arguments: nPr(n, r)');
        return permutation(arg, secondArg);
      case 'ncr':
        if (secondArg === null) throw new Error('nCr requires two arguments: nCr(n, r)');
        return combination(arg, secondArg);
      default:
        throw new Error(`Unsupported math function '${fn}'`);
    }
  }

  private peek(): Token {
    return this.tokens[this.current] || { type: 'EOF', value: '' };
  }

  private consume(): Token {
    const cur = this.peek();
    this.current++;
    return cur;
  }
}

/**
 * Statistics calculation for Class 11 Mathematics
 */
export function calculateStatistics(numbers: number[]): StatResult {
  if (numbers.length === 0) {
    throw new Error('Please provide at least one number');
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  const mean = sum / count;

  // Median
  let median: number;
  const mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    median = sorted[mid];
  }

  // Mode
  const freq: Record<number, number> = {};
  let maxFreq = 0;
  for (const n of sorted) {
    freq[n] = (freq[n] || 0) + 1;
    if (freq[n] > maxFreq) maxFreq = freq[n];
  }
  const mode: number[] = [];
  if (maxFreq > 1) {
    for (const [key, f] of Object.entries(freq)) {
      if (f === maxFreq) mode.push(Number(key));
    }
  }

  // Variance & Standard Deviation (Sample/Population)
  const sumSqDiff = sorted.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0);
  const variance = count > 1 ? sumSqDiff / count : 0;
  const stdev = Math.sqrt(variance);

  return {
    count,
    sum: Number(sum.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    mode,
    variance: Number(variance.toFixed(4)),
    stdev: Number(stdev.toFixed(4)),
    min: sorted[0],
    max: sorted[count - 1],
  };
}
