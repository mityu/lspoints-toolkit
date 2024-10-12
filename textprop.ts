import type { Denops } from "jsr:@denops/std@^7.1.0";
import { batch } from "jsr:@denops/std@^7.1.0/batch";
import * as vimFn from "jsr:@denops/std@^7.1.0/function/vim";
import * as nvimFn from "jsr:@denops/std@^7.1.0/function/nvim";
import type * as LSP from "npm:vscode-languageserver-protocol@^3.17.5";
import type { Predicate } from "jsr:@core/unknownutil@^4.3.0/type";
import { ensure } from "jsr:@core/unknownutil@^4.3.0/ensure";
import { as } from "jsr:@core/unknownutil@^4.3.0/as";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";
import { omit } from "jsr:@std/collections@^1.0.0/omit";
import { execute } from "jsr:@denops/std@^7.1.0/helper/execute";
// import { echo } from "./echo.ts";

const cacheKey = "lspoints-toolkit/textprop.ts@0";

export type TextPropTypeConfig = {
  /**
   * Type name of text property.  Will be
   * - prop-type (`:h E971`) in Vim.
   * - namespace (`:h namespace`) in Neovim.
   */
  name: string;

  /**
   * The name of highlight group to use.
   */
  highlight: string;

  /**
   * The priority of virtual texts.
   */
  priority?: {
    vim?: number;
    nvim?: number;
  };
};

export type Highlight = LSP.Range;

export type VirtualText = {
  text: string;

  /**
   * The 1-indexed line number to place virtual texts.
   */
  line: number;

  /**
   * The 1-indexed column number in byte index.
   */
  column: number;

  /**
   * Options how to place virtual texts.
   * - eol: After the end of line.
   * - right_align: Alined to the right corner of the window.
   * - inline: In-place.
   * - below: On the next line.
   * - above: On the previous line.
   */
  textPos?: "eol" | "right_align" | "inline" | "below" | "above";

  /**
   * The length of margin on the left of the virtual text.
   */
  textPaddingLeft?: number;

  /**
   * Option when virtual text width exceeds the window width.
   * - wrap: Show the exceeded part of virtual text on next line.
   * - truncate: Omit the exceeded part of virtual text.
   */
  textWrap?: "wrap" | "truncate";
};

const isTextPropTypeConfig = is.ObjectOf({
  name: is.String,
  highlight: is.String,
  priority: as.Optional(is.ObjectOf({
    vim: as.Optional(is.Number),
    nvim: as.Optional(is.Number),
  })),
}) satisfies Predicate<TextPropTypeConfig>;

type PropTypeAddParams = {
  highlight?: string;
  priority?: number;
  combine?: boolean;
  override?: boolean;
};

type PropAddParams = {
  type: string;
  bufnr: number;
  text?: string;
  text_align?: "after" | "right" | "below" | "above";
  text_wrap?: "wrap" | "truncate";
  text_padding_left?: number;
};

type NvimSetBufExtmarkParams = {
  virt_text?: [string, string][];
  virt_lines?: [string, string][][];
  virt_text_pos?: "eol" | "overlay" | "inline" | "right_align";
  virt_lines_above?: boolean;
  priority?: number;
};

/**
 * Add textprop-types in Vim or namespace in Neovim.
 * Can be called in denops's batch() function.
 */
export async function addTypes(
  denops: Denops,
  types: TextPropTypeConfig[],
) {
  if (types.length === 0) {
    return;
  }

  if (!denops.context[cacheKey]) {
    denops.context[cacheKey] = {};
  }

  const context = ensure(
    denops.context[cacheKey],
    is.RecordOf(isTextPropTypeConfig, is.String),
  );

  types.forEach((type) => {
    // Always keep existing prop types.
    if (!context[type.name]) {
      context[type.name] = type;
    }
  });

  if (denops.meta.host === "vim") {
    const propTypes = types.map((
      type,
    ) => {
      return [
        type.name,
        {
          ...omit(type, ["name"]),
          priority: type.priority?.vim,
        } satisfies PropTypeAddParams,
      ];
    });
    await execute(
      denops,
      `for [l:name, l:prop] in l:propTypes
        if empty(prop_type_get(l:name))
          call prop_type_add(l:name, l:prop)
        endif
       endfor`,
      { propTypes },
    );
  } else {
    await batch(denops, async (denops) => {
      for (const type of types) {
        await nvimFn.nvim_create_namespace(denops, type.name);
      }
    });
  }
}

/**
 * Get list of alread added types (textprop-types in Vim or namespace in
 * Neovim).
 */
export async function getTypes(denops: Denops): Promise<string[]> {
  if (denops.meta.host === "vim") {
    return ensure(await vimFn.prop_type_list(denops), is.ArrayOf(is.String));
  } else {
    const namespaces = ensure(
      await nvimFn.nvim_get_namespaces(denops),
      is.RecordOf(is.Number, is.String),
    );
    return Object.keys(namespaces);
  }
}

/**
 * Add highlights given by `highlights`.
 * `type` must be the type which previously defined by addTypes() function.
 *
 * Can be called in denops's batch() function.
 */
export async function addHighlights(
  denops: Denops,
  bufnr: number,
  type: string,
  highlights: Highlight[], // Must be 1-indexed byte index.
) {
  if (highlights.length === 0) {
    return;
  }

  const context = ensure(
    denops.context[cacheKey],
    is.RecordOf(isTextPropTypeConfig, is.String),
  );
  if (!context[type]) {
    throw Error(`Property type not registered: ${type}`);
  }

  const add = denops.meta.host === "vim" ? addVimHighlights : addNvimHighlights;
  await add(denops, bufnr, context[type], highlights);
}

/**
 * Add virtual texts given by `virtualTexts`.
 * `type` must be the type which previously defined by addTypes() function.
 *
 * Can be called in denops's batch() function.
 */
export async function addVirtualTexts(
  denops: Denops,
  bufnr: number,
  type: string,
  virtualTexts: VirtualText[],
) {
  if (virtualTexts.length === 0) {
    return;
  }

  const context = ensure(
    denops.context[cacheKey],
    is.RecordOf(isTextPropTypeConfig, is.String),
  );
  if (!context[type]) {
    throw Error(`Property type not registered: ${type}`);
  }

  const add = denops.meta.host === "vim"
    ? addVimVirtualTexts
    : addNvimVirtualTexts;
  await add(denops, bufnr, context[type], virtualTexts);
}

/**
 * Clear all the highlights and virtual texts belonging to `types` which are
 * textprop-types in Vim or namespaces in Neovim.
 *
 * Can be called in denops's batch() function.
 */
export async function clearByTypes(
  denops: Denops,
  bufnr: number,
  types: string[],
) {
  if (types.length === 0) {
    return;
  }

  if (denops.meta.host === "vim") {
    await vimFn.prop_remove(denops, {
      types: types,
      bufnr: bufnr,
      all: true,
    });
  } else {
    execute(
      denops,
      `
      for l:ns in l:namespaces
        call nvim_buf_clear_namespace(${bufnr}, nvim_create_namespace(l:ns), 0, -1)
      endfor
      `,
      { namespaces: types },
    );
  }
}

async function addVimHighlights(
  denops: Denops,
  bufnr: number,
  config: TextPropTypeConfig,
  highlights: Highlight[],
) {
  const items = highlights.map((
    prop,
  ) =>
    [
      prop.start.line,
      prop.start.character,
      prop.end.line,
      prop.end.character,
    ] satisfies vimFn.PropAddListItem
  );
  await vimFn.prop_add_list(denops, { type: config.name, bufnr }, items);
}

async function addNvimHighlights(
  denops: Denops,
  bufnr: number,
  config: TextPropTypeConfig,
  highlights: Highlight[],
) {
  // A hack to be able to make this function callable in batch().
  const addHighlight = async (
    denops: Denops,
    line: number,
    start_col: number,
    end_col: number,
  ) => {
    await denops.eval(
      `nvim_buf_add_highlight(
          l:bufnr,
          nvim_create_namespace(l:namespace),
          l:highlight,
          l:line,
          l:start_col,
          l:end_col
        )`.replace(/\r|\n/g, ""),
      {
        bufnr,
        namespace: config.name,
        highlight: config.highlight,
        line,
        start_col,
        end_col,
      },
    );
  };
  await batch(denops, async (denops) => {
    for (const highlight of highlights) {
      if (highlight.start.line === highlight.end.line) {
        // Single-line highlight.
        await addHighlight(
          denops,
          highlight.start.line - 1,
          highlight.start.character - 1,
          highlight.end.character - 1,
        );
      } else {
        // Multi-line highlight.
        await addHighlight(
          denops,
          highlight.start.line - 1,
          highlight.start.character - 1,
          -1,
        );

        for (
          let line = highlight.start.line + 1;
          line < highlight.end.line;
          line++
        ) {
          await addHighlight(denops, line - 1, 0, -1);
        }

        await addHighlight(
          denops,
          highlight.end.line - 1,
          0,
          highlight.end.character - 1,
        );
      }
    }
  });
}

async function addVimVirtualTexts(
  denops: Denops,
  bufnr: number,
  config: TextPropTypeConfig,
  virtualTexts: VirtualText[],
) {
  const getTextAlign = (pos?: VirtualText["textPos"]) => {
    if (pos === "eol") {
      return "after";
    } else if (pos === "right_align") {
      return "right";
    } else if (pos === "inline") {
      // Discard "inline" option on Vim.  In this case, column must not be 0.
      return undefined;
    } else {
      return pos;
    }
  };
  await batch(denops, async (denops) => {
    for (const virtText of virtualTexts) {
      await vimFn.prop_add(
        denops,
        virtText.line,
        virtText.column,
        {
          type: config.name,
          text: virtText.text,
          bufnr: bufnr,
          text_align: getTextAlign(virtText.textPos),
          text_padding_left: virtText.textPaddingLeft,
          text_wrap: virtText.textWrap,
        } satisfies PropAddParams,
      );
    }
  });
}

async function addNvimVirtualTexts(
  denops: Denops,
  bufnr: number,
  config: TextPropTypeConfig,
  virtualTexts: VirtualText[],
) {
  const extmarks = virtualTexts.map((v) => {
    return {
      line: v.line - 1,
      column: v.column - 1,
      opts: toNvimVirtualTextConfig(config, v),
    };
  });
  await execute(
    denops,
    `
    const l:id = nvim_create_namespace(l:name)
    for l:v in l:extmarks
      call nvim_buf_set_extmark(l:bufnr, l:id, l:v.line, l:v.column, l:v.opts)
    endfor
    `,
    { name: config.name, bufnr: bufnr, extmarks },
  );
}

function toNvimVirtualTextConfig(
  config: TextPropTypeConfig,
  virtText: VirtualText,
) {
  // TODO: text_wrap?
  const getTextConfig = ():
    | Pick<NvimSetBufExtmarkParams, "virt_text" | "virt_text_pos">
    | Pick<NvimSetBufExtmarkParams, "virt_lines" | "virt_lines_above"> => {
    const padding = " ".repeat(virtText.textPaddingLeft ?? 0);
    const vtext = [
      [padding, "Normal"],
      [virtText.text, config.highlight],
    ] satisfies NvimSetBufExtmarkParams["virt_text"];

    const textPos = virtText.textPos;
    switch (textPos) {
      case "below":
        return {
          virt_lines: [vtext],
        };
      case "above":
        return {
          virt_lines: [vtext],
          virt_lines_above: true,
        };
      case "eol":
      case "right_align":
      case "inline":
      case undefined:
        return { virt_text: vtext, virt_text_pos: textPos };
      default:
        return textPos satisfies never;
    }
  };

  return {
    ...getTextConfig(),
    priority: config.priority?.nvim,
  } satisfies NvimSetBufExtmarkParams;
}
