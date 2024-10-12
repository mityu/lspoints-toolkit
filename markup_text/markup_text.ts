import type * as LSP from "npm:vscode-languageserver-protocol@^3.17.5";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";
import type { Predicate } from "jsr:@core/unknownutil@^4.3.0/type";
import { dropLastWhile } from "jsr:@std/collections@^1.0.0/drop-last-while";
import { unreachable } from "jsr:@lambdalisue/unreachable@^1.0.1";
import { parseMarkdown } from "./markdown.ts";

export const textAttrTypes = [
  "fenced",
  "title",
  "horizontalrule",
  "bold",
  "strike",
  "italic",
  "link",
  "url",
  "codespan",
  "codespanDelimiter",
] as const;

export type TextAttrTypes = typeof textAttrTypes[number];

type TextAttrItemSpecial = {
  type: "fenced";
  range: LSP.Range;
  lang: string;
} | {
  type: "title";
  range: LSP.Range;
  depth: number;
} | {
  type: "horizontalrule";
  line: number;
};

type TextAttrItemGeneral = {
  type: Exclude<TextAttrTypes, TextAttrItemSpecial["type"]>;
  range: LSP.Range;
};

export type TextAttrItem = TextAttrItemGeneral | TextAttrItemSpecial;

const isMarkedStringWithLang = is.ObjectOf({
  language: is.String,
  value: is.String,
});

const isMarkedString = is.UnionOf([
  is.String,
  isMarkedStringWithLang,
]) satisfies Predicate<LSP.MarkedString>;

const isMarkedStringArray = is.ArrayOf(isMarkedString);

const isMarkupKind = is.LiteralOneOf(
  ["plaintext", "markdown"] as const,
) satisfies Predicate<LSP.MarkupKind>;

const isMarkupContent = is.ObjectOf({
  kind: isMarkupKind,
  value: is.String,
}) satisfies Predicate<LSP.MarkupContent>;

// function ensureElement<T extends string | number, U>(
//   r: Record<T, U[]>,
//   key: T,
// ): U[] {
//   if (!r[key]) {
//     r[key] = [];
//   }
//   return r[key];
// }

function markedStringToMarkdown(contents: LSP.MarkedString[]): string[] {
  const text = [] as string[];
  const sep = "- - -";
  contents.forEach((v) => {
    if (is.String(v)) {
      text.push(...v.split(/\n/));
    } else if (isMarkedStringWithLang(v)) {
      text.push("```" + v.language);
      text.push(...v.value.split(/\n/));
      text.push("```", sep);
    } else {
      v satisfies never;
    }
  });
  return dropLastWhile(text, (v) => v === sep || /^\s*$/.test(v));
}

function normalizeMarkupText(
  contents: string | LSP.MarkedString | LSP.MarkedString[] | LSP.MarkupContent,
): {
  kind: LSP.MarkupKind;
  text: string[];
} {
  const split = (v: string) => v.split(/\r?\n/);
  if (is.String(contents)) {
    return {
      kind: "plaintext",
      text: split(contents),
    };
  } else if (isMarkedString(contents) || isMarkedStringArray(contents)) {
    const markdown = markedStringToMarkdown(
      is.Array(contents) ? contents : [contents],
    );
    return {
      kind: "markdown",
      text: markdown,
    };
  } else if (isMarkupContent(contents)) {
    return {
      kind: contents.kind,
      text: split(contents.value),
    };
  } else {
    unreachable(contents);
  }
}

export function getMarkupText(
  contents: string | LSP.MarkedString | LSP.MarkedString[] | LSP.MarkupContent,
): {
  text: string[];
  attrs: TextAttrItem[];
} {
  const normalized = normalizeMarkupText(contents);
  if (normalized.kind == "plaintext") {
    return {
      text: normalized.text,
      attrs: [],
    };
  } else if (normalized.kind == "markdown") {
    return parseMarkdown(normalized.text.join("\n"));
  } else {
    unreachable(normalized.kind);
  }
}
