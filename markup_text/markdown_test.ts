import type * as LSP from "npm:vscode-languageserver-protocol@^3.17.5";
import { assert } from "jsr:@std/assert@^1.0.6/assert";
import { assertEquals } from "jsr:@std/assert@^1.0.6/equals";
import { parseMarkdown } from "./markdown.ts";
import type { TextAttrItem } from "./markup_text.ts";

function sortAttr(attrs: TextAttrItem[]) {
  const comparePosition = (a: LSP.Position, b: LSP.Position) => {
    if (a.line === b.line) {
      return a.character - b.character;
    } else {
      return a.line - b.line;
    }
  };

  const compare = (a: TextAttrItem, b: TextAttrItem): number => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    } else {
      if (a.type === "horizontalrule") {
        assert(a.type === b.type);
        return a.line - b.line;
      } else if (a.type === "fenced") {
        assert(a.type === b.type);
        if (a.lang !== b.lang) {
          return a.lang.localeCompare(b.lang);
        } else {
          return comparePosition(a.range.start, b.range.start);
        }
      } else if (a.type === "title") {
        assert(a.type === b.type);
        if (a.depth !== b.depth) {
          return a.depth - b.depth;
        } else {
          return comparePosition(a.range.start, b.range.start);
        }
      } else {
        assert(a.type === b.type);
        return comparePosition(a.range.start, b.range.start);
      }
    }
  };
  return attrs.sort(compare);
}

Deno.test("parseMarkdown", async (t) => {
  await t.step("plain text", () => {
    const result = parseMarkdown("foo\n\nbar\nbaz");
    const text = ["foo", "", "bar", "baz"];
    assertEquals(text, result.text);
    assertEquals([], result.attrs);
  });

  await t.step("titles", () => {
    const result = parseMarkdown([
      "# h1 title1",
      "## h2 *title2*",
      "###    h3 **title3**",
      "#### h4    title4",
      "##### h5 title5",
    ].join("\n"));

    const text = [
      "# h1 title1",
      "## h2 title2",
      "### h3 title3",
      "#### h4    title4",
      "##### h5 title5",
    ];

    assertEquals(text, result.text);

    assertEquals(
      sortAttr(result.attrs),
      sortAttr([
        {
          type: "italic",
          range: {
            start: { line: 2, character: 7 },
            end: { line: 2, character: 13 },
          },
        },
        {
          type: "bold",
          range: {
            start: { line: 3, character: 8 },
            end: { line: 3, character: 14 },
          },
        },
        {
          type: "title",
          depth: 1,
          range: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: text[0].length + 1 },
          },
        },
        {
          type: "title",
          depth: 2,
          range: {
            start: { line: 2, character: 1 },
            end: { line: 2, character: text[1].length + 1 },
          },
        },
        {
          type: "title",
          depth: 3,
          range: {
            start: { line: 3, character: 1 },
            end: { line: 3, character: text[2].length + 1 },
          },
        },
        {
          type: "title",
          depth: 4,
          range: {
            start: { line: 4, character: 1 },
            end: { line: 4, character: text[3].length + 1 },
          },
        },
        {
          type: "title",
          depth: 5,
          range: {
            start: { line: 5, character: 1 },
            end: { line: 5, character: text[4].length + 1 },
          },
        },
      ]),
    );
  });

  await t.step("fenced", () => {
    const result = parseMarkdown([
      "```typescript",
      "console.log();",
      "```",
    ].join("\n"));

    const text = [
      "console.log();",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([
        {
          type: "fenced",
          lang: "typescript",
          range: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: text[0].length + 1 },
          },
        },
      ]),
    );
  });

  await t.step("fenced surrounded by plain texts", () => {
    const result = parseMarkdown([
      "pre-plain-text",
      "```typescript",
      "console.log();",
      "```",
      "post-plain-text",
    ].join("\n"));

    const text = [
      "pre-plain-text",
      "console.log();",
      "post-plain-text",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([
        {
          type: "fenced",
          lang: "typescript",
          range: {
            start: { line: 2, character: 1 },
            end: { line: 2, character: text[1].length + 1 },
          },
        },
      ]),
    );
  });

  await t.step("two fenced", () => {
    const result = parseMarkdown([
      "```typescript",
      "console.log();",
      "```",
      "",
      "```cpp",
      "std::cout << std::endl;",
      "```",
    ].join("\n"));

    const text = [
      "console.log();",
      "",
      "std::cout << std::endl;",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([
        {
          type: "fenced",
          lang: "typescript",
          range: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: text[0].length + 1 },
          },
        },
        {
          type: "fenced",
          lang: "cpp",
          range: {
            start: { line: 3, character: 1 },
            end: { line: 3, character: text[2].length + 1 },
          },
        },
      ]),
    );
  });

  await t.step("hr after fenced", () => {
    const result = parseMarkdown([
      "```typescript",
      "console.log();",
      "```",
      "***",
      "plaintext",
    ].join("\n"));

    const text = [
      "console.log();",
      "",
      "plaintext",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([
        {
          type: "fenced",
          lang: "typescript",
          range: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: text[0].length + 1 },
          },
        },
        {
          type: "horizontalrule",
          line: 2,
        },
      ]),
    );
  });

  await t.step("blockquote", () => {
    const result = parseMarkdown([
      "plaintext-pre",
      "",
      "> This is",
      "> > an *quoted*",
      "> statement.",
      "",
      "plaintext-post",
    ].join("\n"));

    const text = [
      "plaintext-pre",
      "",
      "",
      "> This is",
      "> ",
      "> > an quoted",
      "> > statement.",
      "",
      "plaintext-post",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([{
        type: "italic",
        range: {
          start: { line: 6, character: 8 },
          end: { line: 6, character: 14 },
        },
      }]),
    );
  });

  await t.step("one-depth list", () => {
    const result = parseMarkdown([
      "- item 1",
      "- item 2",
      "- item 3",
    ].join("\n"));

    const text = [
      "• item 1",
      "• item 2",
      "• item 3",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([]),
    );
  });

  await t.step("two-depth list", () => {
    const result = parseMarkdown([
      "- item 1",
      "     - chitem 1",
      "     - chitem 2",
      "- item 2",
      "- item 3",
      "     - chitem 1",
    ].join("\n"));

    const text = [
      "• item 1",
      "    • chitem 1",
      "    • chitem 2",
      "• item 2",
      "• item 3",
      "    • chitem 1",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([]),
    );
  });

  await t.step("indexed two-depth list", () => {
    const result = parseMarkdown([
      "1. item 1",
      "     1. chitem 1",
      "     1. chitem 2",
      "1. item 2",
      "1. item 3",
      "     - chitem 1",
      "1. item 4",
      "1. item 5",
      "1. item 6",
      "1. item 7",
      "1. item 8",
      "1. item 9",
      "1. item 10",
    ].join("\n"));

    const text = [
      " 1. item 1",
      "    1. chitem 1",
      "    2. chitem 2",
      " 2. item 2",
      " 3. item 3",
      "    • chitem 1",
      " 4. item 4",
      " 5. item 5",
      " 6. item 6",
      " 7. item 7",
      " 8. item 8",
      " 9. item 9",
      "10. item 10",
    ];

    assertEquals(text, result.text);
    assertEquals(
      sortAttr(result.attrs),
      sortAttr([]),
    );
  });
});
