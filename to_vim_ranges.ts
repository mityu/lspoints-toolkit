import type { Denops } from "jsr:@denops/std@^7.1.0";
import * as LSP from "npm:vscode-languageserver-protocol@3.17.5";
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
    // Make range.end inclusive
    const end = r.end.character === 0
      ? { line: r.end.line - 1, character: -1 }
      : { line: r.end.line, character: r.end.character - 1 };
    acc.push(r.start, end);
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
