import ts from "typescript";

export const TRACE_LIMITS = Object.freeze({
  sourceBytes: 256 * 1024,
  nodes: 50_000,
  depth: 128,
  records: 1_000,
  tokenCharacters: 16_384,
  literalCharacters: 1_024,
  excerptCharacters: 4_096,
});

export type TraceErrorCode =
  "MALFORMED_SOURCE" | "SOURCE_LIMIT" | "AST_LIMIT" | "UNSUPPORTED_SOURCE";

export class TraceError extends Error {
  readonly code: TraceErrorCode;

  constructor(code: TraceErrorCode, message: string) {
    super(message);
    this.name = "TraceError";
    this.code = code;
  }
}

/** Offsets count UTF-16 code units; end is exclusive. Columns/lines are 1-based. */
export interface TraceLocation {
  start: number;
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  excerpt: string;
}

export interface TraceUsage {
  method: string;
  path: string;
  matchMethod: "ast-static-request-object" | "ast-fetch-literal";
  ruleId: string;
  symbol?: string;
  location: TraceLocation;
  requestLocation: TraceLocation;
  bodyProperties?: string[];
  limitations: string[];
}

export interface TraceUnresolved {
  ruleId: string;
  reason: string;
  location?: TraceLocation;
}

export interface TraceResult {
  usages: TraceUsage[];
  unresolved: TraceUnresolved[];
}

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"]);
const sharedLimitations = [
  "Lexical syntax only: execution, network dispatch, reachability and business-flow use are unverified.",
  "Imports, variables, aliases, wrappers and interprocedural data flow are not resolved.",
];

function literal(node: ts.Node): node is ts.StringLiteral {
  return ts.isStringLiteral(node);
}

function nameOf(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  return node;
}

/** No computed keys, spreads, getters, methods, shorthand or duplicate properties. */
function fields(node: ts.ObjectLiteralExpression): Map<string, ts.Expression> | undefined {
  const result = new Map<string, ts.Expression>();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) return undefined;
    const name = nameOf(property.name);
    if (name === undefined || result.has(name) || name === "__proto__") return undefined;
    result.set(name, property.initializer);
  }
  return result;
}

function symbolOf(node: ts.Node): string | undefined {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) {
      if (parent.name) return parent.name.text;
      if (ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name)) {
        return parent.parent.name.text;
      }
      return undefined;
    }
    if (ts.isArrowFunction(parent)) {
      return ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name)
        ? parent.parent.name.text
        : undefined;
    }
    if (ts.isMethodDeclaration(parent)) return nameOf(parent.name);
  }
  return undefined;
}

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? boundNames(element.name) : [],
  );
}

function declaresFetch(node: ts.Node): boolean {
  if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
    return boundNames(node.name).includes("fetch");
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  )
    return node.name?.text === "fetch";
  if (ts.isImportClause(node)) return node.name?.text === "fetch";
  if (
    ts.isImportSpecifier(node) ||
    ts.isNamespaceImport(node) ||
    ts.isImportEqualsDeclaration(node)
  ) {
    return node.name.text === "fetch";
  }
  return false;
}

function fetchTarget(node: ts.Node): boolean {
  return (
    (ts.isIdentifier(node) && node.text === "fetch") ||
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === "fetch" &&
      ts.isIdentifier(node.expression) &&
      ["globalThis", "window", "self"].includes(node.expression.text)) ||
    (ts.isElementAccessExpression(node) &&
      literal(node.argumentExpression) &&
      node.argumentExpression.text === "fetch" &&
      ts.isIdentifier(node.expression) &&
      ["globalThis", "window", "self"].includes(node.expression.text))
  );
}

function rebindsFetch(node: ts.Node): boolean {
  return (
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      assignmentWritesFetch(node.left)) ||
    ((ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer) &&
      assignmentWritesFetch(node.initializer)) ||
    (ts.isDeleteExpression(node) && fetchTarget(node.expression)) ||
    ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      fetchTarget(node.operand))
  );
}

function typeOnlyContext(node: ts.Node): boolean {
  for (let parent: ts.Node | undefined = node; parent; parent = parent.parent) {
    if (
      ts.isTypeNode(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent)
    )
      return true;
    if (
      ts.canHaveModifiers(parent) &&
      ts.getModifiers(parent)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
    )
      return true;
  }
  return false;
}

function isWithinFunction(node: ts.Node): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return true;
  }
  return false;
}

function assignmentWritesFetch(node: ts.Expression): boolean {
  node = unwrap(node);
  if (fetchTarget(node)) return true;
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some(
      (property) =>
        (ts.isShorthandPropertyAssignment(property) && property.name.text === "fetch") ||
        (ts.isPropertyAssignment(property) && assignmentWritesFetch(property.initializer)) ||
        (ts.isSpreadAssignment(property) && assignmentWritesFetch(property.expression)),
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) =>
      assignmentWritesFetch(ts.isSpreadElement(element) ? element.expression : element),
    );
  }
  return false;
}

function simpleRoute(node: ts.Expression): node is ts.StringLiteral {
  return (
    literal(node) &&
    node.text.length <= TRACE_LIMITS.literalCharacters &&
    /^\/(?!\/)[^?#%\\\s{}]*$/.test(node.text)
  );
}

function preflight(text: string, check: () => void): void {
  if (Buffer.byteLength(text, "utf8") > TRACE_LIMITS.sourceBytes || text.includes("\0")) {
    throw new TraceError("SOURCE_LIMIT", "Source exceeds the byte limit or contains NUL.");
  }
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  let depth = 0;
  let tokens = 0;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    check();
    tokens++;
    if (scanner.getTextPos() - scanner.getTokenPos() > TRACE_LIMITS.tokenCharacters) {
      throw new TraceError("SOURCE_LIMIT", "Source token exceeds the character limit.");
    }
    if (
      [
        ts.SyntaxKind.OpenBraceToken,
        ts.SyntaxKind.OpenParenToken,
        ts.SyntaxKind.OpenBracketToken,
      ].includes(kind)
    )
      depth++;
    if (
      [
        ts.SyntaxKind.CloseBraceToken,
        ts.SyntaxKind.CloseParenToken,
        ts.SyntaxKind.CloseBracketToken,
      ].includes(kind)
    )
      depth = Math.max(0, depth - 1);
    if (depth > TRACE_LIMITS.depth || tokens > TRACE_LIMITS.nodes) {
      throw new TraceError(
        "AST_LIMIT",
        "Source token count or nesting exceeds the parser preflight limit.",
      );
    }
  }
}

/** Pure parser. It neither reads files nor resolves/imports/executes inspected modules. */
export function traceSource(path: string, text: string, check: () => void = () => {}): TraceResult {
  if (typeof path !== "string" || typeof text !== "string" || !/\.(?:ts|tsx|js|jsx)$/.test(path)) {
    throw new TraceError(
      "UNSUPPORTED_SOURCE",
      "Expected a TypeScript or JavaScript source path and text.",
    );
  }
  check();
  preflight(text, check);
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : path.endsWith(".js")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  let file: ts.SourceFile;
  try {
    file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  } catch {
    throw new TraceError(
      "MALFORMED_SOURCE",
      "The TypeScript parser could not process the source within the supported shape.",
    );
  }
  check();
  // TypeScript exposes parseDiagnostics at runtime but omits it from SourceFile's public interface.
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics.length > 0) {
    throw new TraceError(
      "MALFORMED_SOURCE",
      `Source has ${diagnostics.length} parser diagnostic(s).`,
    );
  }
  const nodes: ts.Node[] = [];
  const stack: { node: ts.Node; depth: number }[] = [{ node: file, depth: 0 }];
  while (stack.length > 0) {
    check();
    const item = stack.pop();
    if (!item) break;
    if (nodes.length >= TRACE_LIMITS.nodes || item.depth > TRACE_LIMITS.depth) {
      throw new TraceError("AST_LIMIT", "Source AST node count or depth exceeds the limit.");
    }
    nodes.push(item.node);
    const children: ts.Node[] = [];
    ts.forEachChild(item.node, (child) => {
      children.push(child);
    });
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (child) stack.push({ node: child, depth: item.depth + 1 });
    }
  }
  const fetchIsShadowed = nodes.some(
    (node) => declaresFetch(node) || rebindsFetch(node) || ts.isWithStatement(node),
  );
  const result: TraceResult = { usages: [], unresolved: [] };
  function location(
    node: ts.Node,
    max: number = TRACE_LIMITS.excerptCharacters,
  ): TraceLocation | undefined {
    const start = node.getStart(file);
    const end = node.getEnd();
    if (end - start > max) return undefined;
    const from = file.getLineAndCharacterOfPosition(start);
    const to = file.getLineAndCharacterOfPosition(end);
    return {
      start,
      end,
      startLine: from.line + 1,
      startColumn: from.character + 1,
      endLine: to.line + 1,
      endColumn: to.character + 1,
      excerpt: text.slice(start, end),
    };
  }
  function guardRecords(): void {
    if (result.usages.length + result.unresolved.length >= TRACE_LIMITS.records) {
      throw new TraceError(
        "AST_LIMIT",
        "Trace result count exceeds the limit; partial results are discarded.",
      );
    }
  }
  function unresolved(node: ts.Node, ruleId: string, reason: string): void {
    guardRecords();
    const citation = location(node);
    result.unresolved.push({ ruleId, reason, ...(citation ? { location: citation } : {}) });
  }
  function emit(
    node: ts.Node,
    route: ts.StringLiteral,
    method: string,
    matchMethod: TraceUsage["matchMethod"],
    body?: ts.Expression,
  ): void {
    const citation = location(route, TRACE_LIMITS.literalCharacters);
    const requestLocation = location(node);
    if (!citation || !requestLocation) {
      unresolved(
        node,
        "ast.excerpt-limit.v1",
        "Request or route span exceeds the bounded exact-excerpt policy.",
      );
      return;
    }
    const bodyFields =
      body && ts.isObjectLiteralExpression(unwrap(body))
        ? fields(unwrap(body) as ts.ObjectLiteralExpression)
        : undefined;
    guardRecords();
    const symbol = symbolOf(node);
    result.usages.push({
      method,
      path: route.text,
      matchMethod,
      ruleId:
        matchMethod === "ast-static-request-object"
          ? "ast.returned-request-object.v1"
          : "ast.direct-fetch-literal.v1",
      ...(symbol ? { symbol } : {}),
      location: citation,
      requestLocation,
      ...(bodyFields ? { bodyProperties: [...bodyFields.keys()].sort() } : {}),
      limitations: [
        ...sharedLimitations,
        ...(matchMethod === "ast-static-request-object"
          ? [
              "A returned method/path/body object follows the declared construction convention; its use as an HTTP request is unverified.",
            ]
          : [
              "Direct fetch assumes an ambient standard fetch binding; external modules and runtime global mutations are not analyzed.",
            ]),
        ...(body && !bodyFields
          ? ["Request body values and property structure are not resolved."]
          : []),
      ],
    });
  }
  for (const node of nodes) {
    check();
    if (typeOnlyContext(node)) continue;
    let returned: ts.Expression | undefined;
    if (ts.isReturnStatement(node) && node.expression && isWithinFunction(node))
      returned = unwrap(node.expression);
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) returned = unwrap(node.body);
    if (returned && ts.isObjectLiteralExpression(returned)) {
      const map = fields(returned);
      const keys = returned.properties.flatMap((property) =>
        property.name ? [nameOf(property.name)] : [],
      );
      const hasRequestKeys =
        (keys.includes("path") && keys.includes("method")) ||
        (keys.includes("body") &&
          (keys.includes("path") || keys.includes("method")) &&
          returned.properties.some(
            (property) =>
              ts.isSpreadAssignment(property) ||
              (property.name && ts.isComputedPropertyName(property.name)),
          ));
      if (hasRequestKeys) {
        const method = map?.get("method");
        const route = map?.get("path");
        const body = map?.get("body");
        if (
          !map ||
          !method ||
          !route ||
          !body ||
          !literal(method) ||
          !methods.has(method.text) ||
          !simpleRoute(route) ||
          !ts.isObjectLiteralExpression(unwrap(body)) ||
          !fields(unwrap(body) as ts.ObjectLiteralExpression) ||
          [...map.keys()].some((key) => !["method", "path", "headers", "body"].includes(key))
        ) {
          unresolved(
            returned,
            "ast.unsupported-request-object.v1",
            "Returned request-like object has unsupported, dynamic or ambiguous keys, method, path or body.",
          );
        } else emit(returned, route, method.text, "ast-static-request-object", body);
      }
    }
    if (ts.isNewExpression(node)) {
      unresolved(
        node,
        "ast.opaque-call.v1",
        "Constructed Request/client instance is outside the supported direct-call and returned-object patterns.",
      );
      continue;
    }
    if (!ts.isCallExpression(node)) continue;
    const isDirectFetch = ts.isIdentifier(node.expression) && node.expression.text === "fetch";
    if (isDirectFetch) {
      if (fetchIsShadowed || node.questionDotToken || node.typeArguments?.length) {
        unresolved(
          node,
          "ast.ambiguous-fetch.v1",
          "Fetch is shadowed/rebound in this file or uses unsupported optional/generic call syntax.",
        );
        continue;
      }
      const route = node.arguments[0];
      const options = node.arguments[1];
      if (
        !route ||
        !simpleRoute(route) ||
        node.arguments.length > 2 ||
        (options && !ts.isObjectLiteralExpression(options))
      ) {
        unresolved(
          node,
          "ast.unsupported-fetch.v1",
          "Fetch URL or options are dynamic, non-local, or outside the literal request pattern.",
        );
        continue;
      }
      const map =
        options && ts.isObjectLiteralExpression(options)
          ? fields(options)
          : new Map<string, ts.Expression>();
      const method = map?.get("method");
      if (
        !map ||
        [...map.keys()].some((key) => !["method", "headers", "body"].includes(key)) ||
        (method && (!literal(method) || !methods.has(method.text) || method.text === "TRACE"))
      ) {
        unresolved(
          node,
          "ast.unsupported-fetch-options.v1",
          "Fetch options contain unsupported, duplicate, computed, spread or dynamic method fields.",
        );
        continue;
      }
      emit(
        node,
        route,
        method && literal(method) ? method.text : "GET",
        "ast-fetch-literal",
        map.get("body"),
      );
    } else {
      unresolved(
        node,
        "ast.opaque-call.v1",
        "Call is outside the supported direct-fetch pattern; helper, alias, wrapper or SDK behavior is unresolved.",
      );
    }
  }
  return result;
}
