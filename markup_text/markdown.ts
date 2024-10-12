import type * as LSP from "npm:vscode-languageserver-protocol@^3.17.5";
import { marked } from "npm:marked@^14.1.2";
import type { MarkedToken, Token, TokensList } from "npm:marked@^14.1.2";
import { ensure } from "jsr:@core/unknownutil@^4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";
import { unescape } from "jsr:@std/html@^1.0.3/entities";
import { dropLastWhile } from "jsr:@std/collections@^1.0.0/drop-last-while";
import type { TextAttrItem } from "./markup_text.ts";
import { unreachable } from "jsr:@lambdalisue/unreachable@^1.0.1";

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

type TokenType = MarkedToken["type"];

const isTokenObject = is.ObjectOf({ type: is.String });

const strBytes = (() => {
  const encoder = new TextEncoder();
  return (text: string): number => {
    return encoder.encode(text).length;
  };
})();

function isMarkedToken(token: unknown): token is MarkedToken {
  if (!isTokenObject(token)) {
    return false;
  }
  // Forcely treat type of token.type as TokenType in order to make it able to
  // do exhaustiveness check in switch.
  const toktype = token.type as TokenType;
  switch (toktype) {
    case "space":
    case "code":
    case "heading":
    case "table":
    case "hr":
    case "blockquote":
    case "list":
    case "list_item":
    case "paragraph":
    case "html":
    case "text":
    case "def":
    case "escape":
    case "image":
    case "link":
    case "strong":
    case "em":
    case "codespan":
    case "br":
    case "del":
      return true;
    default:
      unreachable(toktype);
  }
}

function transformPosition(
  attr: TextAttrItem,
  delta: LSP.Position,
): TextAttrItem {
  if (attr.type === "horizontalrule") {
    return {
      ...attr,
      line: attr.line + delta.line,
    };
  } else {
    const src = attr.range;
    const range = {
      start: {
        line: src.start.line + delta.line,
        character: src.start.character + delta.character,
      },
      end: {
        line: src.end.line + delta.line,
        character: src.end.character + delta.character,
      },
    };
    return {
      ...attr,
      range,
    };
  }
}

class Renderer {
  text: string[] = [];
  attrs: TextAttrItem[] = [];

  render(tokensList: Token[] | TokensList) {
    this.#renderList(tokensList);
    return {
      text: this.text,
      attrs: this.attrs,
    };
  }

  #getEofPosition(exclusive: boolean = false): LSP.Position {
    return {
      line: this.text.length,
      character: strBytes(this.text[this.text.length - 1]) + 1 +
        (exclusive ? 1 : 0),
    };
  }

  #appendText(text: string): LSP.Range {
    const [top, ...rest] = unescape(text).split(/\n/);
    if (this.text.length === 0) {
      this.text.push(top, ...rest);
      return {
        start: {
          line: 1,
          character: 1,
        },
        end: this.#getEofPosition(),
      };
    } else {
      const start = this.#getEofPosition();
      this.text[this.text.length - 1] += top;
      this.text.push(...rest);
      const end = this.#getEofPosition();
      return { start, end };
    }
  }

  #renderList(tokens: Token[]): LSP.Range {
    const start = this.#getEofPosition();
    tokens.forEach((tok) => this.#renderOne(ensure(tok, isMarkedToken)));
    const end = this.#getEofPosition();
    return { start, end };
  }

  #renderOne(token: MarkedToken) {
    token.type satisfies TokenType;
    switch (token.type) {
      case "heading": {
        const { start } = this.#appendText("#".repeat(token.depth) + " ");
        const { end } = this.#renderList(token.tokens);
        this.text.push("");
        this.attrs.push({
          type: "title",
          range: { start, end },
          depth: token.depth,
        });
        break;
      }
      case "paragraph": {
        this.#renderList(token.tokens);
        this.text.push("");
        break;
      }
      case "text":
        this.#appendText(token.text);
        break;
      case "space":
        this.#appendText(token.raw.replace(/\n$/, ""));
        break;
      case "br":
        this.text.push("");
        break;
      case "strong": // fallthrough
      case "del": // fallthrough
      case "em": {
        const typetable = {
          strong: "bold",
          del: "strike",
          em: "italic",
        } as const satisfies Record<typeof token.type, string>;

        const range = this.#renderList(token.tokens);
        this.attrs.push({ type: typetable[token.type], range });
        break;
      }
      case "link": // fallthrough
      case "image": {
        const isLink = token.type === "link";
        this.#appendText(isLink ? "[" : "![");
        if (isLink) {
          const range = this.#renderList(token.tokens);
          this.attrs.push({ type: "link", range });
        } else {
          const range = this.#appendText(token.text);
          this.attrs.push({ type: "link", range });
        }
        this.#appendText("](");
        const range = this.#appendText(token.href);
        this.attrs.push({ type: "url", range });
        if (token.title) {
          this.#appendText(" ");
          const range = this.#appendText(token.title);
          this.attrs.push({ type: "title", range, depth: 0 });
        }
        this.#appendText(")");
        break;
      }
      case "code": {
        // fenced code block.
        const lang = token.lang ?? "";
        this.attrs.push({
          type: "fenced",
          range: this.#appendText(token.text),
          lang,
        });
        this.text.push(""); // Forcely create newline.
        break;
      }
      case "codespan": { // `codespan`
        this.attrs.push({
          type: "codespanDelimiter",
          range: this.#appendText("`"),
        });
        this.attrs.push({
          type: "codespan",
          range: this.#appendText(token.text),
        });
        this.attrs.push({
          type: "codespanDelimiter",
          range: this.#appendText("`"),
        });
        break;
      }
      case "blockquote": {
        const { text, attrs } = new Renderer().render(token.tokens);
        const quoted = dropLastWhile(text, (v) => /^\s*$/.test(v)).map((v) =>
          "> " + v
        );
        const shifted = attrs.map((attr) =>
          transformPosition(attr, { line: this.text.length, character: 2 })
        );
        this.text.push(...quoted, "");
        this.attrs.push(...shifted);
        break;
      }
      case "hr": {
        this.text.push("");
        this.attrs.push({
          type: "horizontalrule",
          line: this.text.length - 1,
        });
        break;
      }
      case "table":
        // TODO: Pretty table.
        this.#appendText(token.raw);
        break;
      case "list": {
        // TODO: Check ambiwidth
        const labelChar = "•"; // "-"
        const labelSize = token.ordered
          ? token.items.length.toString().length + 1 // "+ 1" is for the length of dot.
          : strBytes(labelChar);
        const checkboxSize = token.items.filter((v) => v.checked).length > 0
          ? 4 // " [x]".length
          : 0;
        token.items.forEach((item, idx) => {
          const { text: [hd, ...tl], attrs } = new Renderer().render(
            [item],
          );
          const label = token.ordered
            ? `${(idx + 1).toString().padStart(labelSize - 1, " ")}.`
            : labelChar;
          const checkbox = item.checked == undefined
            ? " ".repeat(checkboxSize)
            : item.checked
            ? " [x]"
            : " [ ]";
          const indentSize = labelSize + checkboxSize + 1;
          this.text.push(`${label}${checkbox} ${hd}`);
          this.text.push(...tl.map((v) => " ".repeat(indentSize) + v));
          this.attrs.push(
            ...attrs.map((attr) =>
              transformPosition(attr, { line: 0, character: indentSize })
            ),
          );
        });
        break;
      }
      case "list_item": {
        token.tokens.forEach((chTok) => {
          if (chTok.type === "list") {
            const { text, attrs } = new Renderer().render([chTok]);
            const delta = {
              line: this.text.length,
              character: 0,
            };
            const transformed = attrs.map((attr) =>
              transformPosition(attr, delta)
            );
            this.text.push(...text);
            this.attrs.push(...transformed);
          } else if (chTok.type === "text") {
            this.#appendText(chTok.text.replace(/(?<=\n)\s+/g, ""));
          } else {
            this.#renderOne(ensure(chTok, isMarkedToken));
          }
        });
        break;
      }
      case "html":
      case "def":
      case "escape":
        throw new NotImplementedError(`Not implemented yet: ${token.type}`);
      default:
        unreachable(token);
    }
  }
}

export function parseMarkdown(markdown: string): {
  text: string[];
  attrs: TextAttrItem[];
} {
  marked.use({ gfm: true });
  try {
    const { text, attrs } = new Renderer().render(marked.lexer(markdown));
    return {
      text: dropLastWhile(text, (v) => v === ""),
      attrs,
    };
  } catch (e: unknown) {
    if (e instanceof NotImplementedError) {
      const msg =
        `Internal error: Please report this to https://github.com/mityu/lspoints-toolkit/issues with the following error messages.`;
      throw new Error(`${e.message}\n${msg}\n${markdown}`);
    } else {
      throw e;
    }
  }
}
