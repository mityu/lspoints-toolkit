import type { Denops } from "jsr:@denops/std@^7.1.0";
import type * as LSP from "npm:vscode-languageserver-protocol@^3.17.5";
import { chunk } from "jsr:@std/collections@^1.0.0/chunk";
import { toVimPositions } from "./to_vim_positions.ts";

// TODO: measure performance.
// TODO: Compare with the version of using flatMap instead of reduce
/**
 * Convert LSP ranges into Vim ranges.  Conversion is done in only few times of
 * denops RPC call.
 */
export async function toVimRanges(
  denops: Denops,
  bufnr: number,
  ranges: LSP.Range[],
): Promise<LSP.Range[]> {
  const positions = ranges.reduce((acc, r) => {
    const { start, end } = getInclusiveRange(r);
    acc.push(start, end);
    return acc;
  }, [] as LSP.Position[]);
  const converted = await toVimPositions(denops, bufnr, positions);
  return chunk(converted, 2).map((r) => {
    return {
      start: r[0],
      end: { line: r[1].line, character: r[1].character + 1 }, // Make range.end exclusive
    };
  });
}

function getInclusiveRange(src: LSP.Range): LSP.Range {
  const isZeroWidth = src.start.line === src.end.line &&
    src.start.character === src.end.character;

  const end = src.end.character === 0
    ? { line: src.end.line - 1, character: -1 }
    : { line: src.end.line, character: src.end.character - 1 };

  if (isZeroWidth) {
    return { start: end, end };
  } else {
    return { start: src.start, end };
  }
}
