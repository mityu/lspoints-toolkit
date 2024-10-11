import type { Denops } from "jsr:@denops/std@^7.1.0";
import { batch } from "jsr:@denops/std@^7.1.0/batch";
import { hlset } from "jsr:@denops/std@^7.1.0/function/vim";
import { nvim_set_hl } from "jsr:@denops/std@^7.1.0/function/nvim";
import { omit } from "jsr:@std/collections@^1.0.0/omit";
import { pick } from "jsr:@std/collections@^1.0.0/pick";

type HighlightCommonParam = {
  name: string;
  overwrite?: boolean;
};

/**
 * Highlight attributes for "term", "cterm", and "gui".
 * See `:h highlight-term` for the details.
 */
export type HighlightTermAttr = {
  bold?: boolean;
  underline?: boolean;
  undercurl?: boolean;
  underdouble?: boolean;
  underdotted?: boolean;
  underdashed?: boolean;
  strikethrough?: boolean;
  reverse?: boolean;
  italic?: boolean;
  standout?: boolean;
  nocombine?: boolean;
  NONE?: boolean;
};

/**
 * Parameters to define highlights.
 *
 * - name: The highlight group name
 * - overwrite: Set this true to forcely define highlight with ignoring
 *   existing highlight definition.
 *
 * - linksto: The highlight group name to link.
 *
 * - term: Specify attributes used for both `:h highlight-cterm` and
 *   `:h highlight-gui`.
 * - term.cterm: Specify attributes used for `:h highlight-cterm`.
 * - term.gui: Specify attributes used for `:h highlight-gui`.
 * - ctermfg, ctermbg, ctermul: Please see `:h highlight-ctermfg` section.
 * - guifg, guibg, guisp: Please see `:h highlight-guifg` section.
 */
export type HighlightParam =
  | HighlightCommonParam & {
    linksto: string;
    term: never;
  }
  | HighlightCommonParam & {
    term?: HighlightTermAttr | {
      cterm?: HighlightTermAttr;
      gui?: HighlightTermAttr;
    };
    ctermbg?: string;
    ctermfg?: string;
    ctermul?: string;
    guibg?: string;
    guifg?: string;
    guisp?: string;
  };

/**
 * Define multiple highlights at once.  Can be called in batch() of @denops/std.
 */
export async function setHighlights(
  denops: Denops,
  highlights: HighlightParam[],
) {
  const set = denops.meta.host === "vim" ? setVimHighlights : setNvimHighlights;
  await set(denops, highlights);
}

function removeUndefinedEntries<T extends Record<string, unknown>>(
  param: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(param).filter(([_key, val]) => val != undefined),
  ) as Partial<T>;
}

function normalizeTermAttr(
  term: HighlightParam["term"],
): { cterm?: HighlightTermAttr; gui?: HighlightTermAttr } {
  const isLumpedAttr = (
    x: Exclude<HighlightParam["term"], undefined>,
  ): x is HighlightTermAttr => {
    return !("gui" in x && "cterm" in x);
  };

  if (term == undefined) {
    return { gui: undefined, cterm: undefined };
  } else if (isLumpedAttr(term)) {
    return { cterm: term, gui: term };
  } else {
    return term;
  }
}

function getOverriteAttr(
  hl: HighlightParam,
): { default: true } | { force: true } {
  return hl.overwrite ? { force: true } : { default: true };
}

async function setVimHighlights(denops: Denops, highlights: HighlightParam[]) {
  const params = highlights.map((hl) => {
    if ("linksto" in hl) {
      return {
        ...removeUndefinedEntries(omit(hl, ["overwrite"])),
        ...getOverriteAttr(hl),
      };
    } else {
      const { gui, cterm } = normalizeTermAttr(hl.term);
      return {
        ...removeUndefinedEntries(omit(hl, ["overwrite"])),
        ...getOverriteAttr(hl),
        gui,
        cterm,
      };
    }
  });
  await hlset(denops, params);
}

async function setNvimHighlights(
  denops: Denops,
  highlights: HighlightParam[],
) {
  const getTermAttr = (
    attr: HighlightTermAttr,
  ): Omit<HighlightTermAttr, "NONE"> => {
    if (attr.NONE) {
      return {
        bold: false,
        underline: false,
        undercurl: false,
        underdouble: false,
        underdotted: false,
        underdashed: false,
        strikethrough: false,
        reverse: false,
        italic: false,
        standout: false,
        nocombine: false,
      } satisfies Required<Omit<HighlightTermAttr, "NONE">>;
    } else {
      return omit(attr, ["NONE"]);
    }
  };
  await batch(denops, async (denops) => {
    for (const hl of highlights) {
      if ("linksto" in hl) {
        await nvim_set_hl(denops, 0, hl.name, {
          link: hl.linksto,
          ...getOverriteAttr(hl),
        });
      } else {
        const { cterm, gui } = normalizeTermAttr(hl.term);
        await nvim_set_hl(denops, 0, hl.name, {
          fg: hl.guifg,
          bg: hl.guibg,
          sp: hl.guisp,
          ...(gui ? getTermAttr(gui) : {}),
          ...(cterm ? getTermAttr(cterm) : {}),
          ...getOverriteAttr(hl),
          ...removeUndefinedEntries(pick(hl, ["ctermfg", "ctermbg"])),
        });
      }
    }
  });
}
