import type { Denops } from "jsr:@denops/std@^7.1.0";
import { batch } from "jsr:@denops/std@^7.1.0/batch";
import { hlset } from "jsr:@denops/std@^7.1.0/function/vim";
import { nvim_set_hl } from "jsr:@denops/std@^7.1.0/function/nvim";

export type HighlightLinkParams = [string, string][];
export async function defineDefaultLinks(
  denops: Denops,
  highlights: HighlightLinkParams,
) {
  if (denops.meta.host === "vim") {
    await hlset(
      denops,
      highlights.map((v) => {
        return {
          name: v[0],
          linksto: v[1],
          default: true,
        };
      }),
    );
  } else {
    await batch(denops, async (denops) => {
      for (const hl of highlights) {
        await nvim_set_hl(denops, 0, hl[0], { link: hl[1], default: true });
      }
    });
  }
}
