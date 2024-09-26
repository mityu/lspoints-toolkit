import type { Denops } from "jsr:@denops/std@^7.1.0";
import type * as LSP from "npm:vscode-languageserver-protocol@3.17.5";
import { execute } from "jsr:@denops/std@^7.1.0/helper/execute";
import { ensure } from "jsr:@core/unknownutil@^4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";
import { ulid } from "jsr:@std/ulid@^1.0.0/ulid";

const cacheKey = "lspoints-toolkit/position.ts@0";

async function ensureConverter(denops: Denops): Promise<string> {
  if (is.String(denops.context[cacheKey])) {
    return denops.context[cacheKey];
  }
  const suffix = ulid();
  const fnName = `LspointsToolkitToVimPositions_${suffix}`;
  denops.context[cacheKey] = fnName;

  const script = `
  function! ${fnName}(bufnr, positions) abort
    let bufinfo = getbufinfo(a:bufnr)
    if empty(bufinfo)
      return a:positions
    endif
    let line_count = bufinfo[0].linecount

    let result = []
    for position in a:positions
      let line = position[0] + 1
      if line < 1
        let line = 1
      elseif line > line_count
        let line = line_count
      endif

      let col = 1
      let text = getbufline(a:bufnr, line)
      if !empty(text)
        let len = position[1] < 0 ? strchars(text[0]) - position[1] + 1 : position[1]
        let col = strlen(strcharpart(text[0], 0, len)) + 1
      endif

      call add(result, [line, col])
    endfor
    return result
  endfunction
  `;
  await execute(denops, script);

  return fnName;
}

/**
 * Convert LSP positions into Vim positions.  Conversion is done in only few
 * times of denops RPC call.
 */
export async function toVimPositions(
  denops: Denops,
  bufnr: number,
  positions: LSP.Position[],
): Promise<LSP.Position[]> {
  if (positions.length === 0) {
    return [];
  }

  const fnName = await ensureConverter(denops);
  const converted = ensure(
    await denops.call(
      fnName,
      bufnr,
      positions.map((p) => [p.line, p.character]),
    ),
    is.ArrayOf(is.TupleOf([is.Number, is.Number])),
  );
  return converted.map((p) => {
    return { line: p[0], character: p[1] };
  });
}
