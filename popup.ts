import type { Denops } from "jsr:@denops/std@^7.1.0";
import { batch } from "jsr:@denops/std@^7.1.0/batch";
import * as autocmd from "jsr:@denops/std@^7.1.0/autocmd";
import * as lambda from "jsr:@denops/std@^7.1.0/lambda";
import * as fn from "jsr:@denops/std@^7.1.0/function";
import * as vimFn from "jsr:@denops/std@^7.1.0/function/vim";
import * as nvimFn from "jsr:@denops/std@^7.1.0/function/nvim";
import { ensure } from "jsr:@core/unknownutil@^4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";

// TODO: support zindex?
/**
 * Options to configure preview popup windows.
 */
export type OpenOptions = {
  /**
   * Text to show in preview popup.
   */
  contents: string[];

  /**
   * The line number to place popup.  Relative to the cursor position.
   */
  line: number;

  /**
   * The column number to place popup.  Relative to the cursor position.
   */
  col: number;

  /**
   * Defines which corner of the popup "line" and "col" are used for.
   */
  pos?: "topleft" | "topright" | "botleft" | "botright";

  /**
   * Maximum height of the preview popup window.
   */
  maxheight?: number;

  /**
   * Defines when the popup is closed automatically.
   * - "any": When cursor is moved.
   *
   * The popup will never be closed automatically if this property is
   * undefined.
   */
  moved?: "any";

  /**
   * Maximum width of the preview popup window.
   */
  maxwidth?: number;

  /**
   * Filetype of the popup buffer.
   */
  filetype?: string;

  // Based on:
  // https://github.com/vim-denops/deno-denops-std/blob/afa88b70d7b59c89b3bad158b6f02c4878dce2c5/popup/types.ts#L17
  /**
   * Border style of the popup:
   *
   * - "single" Single line border
   * - "double" Double line border
   * - "rounded" Rounded border
   * - "solid" White space padding
   * - [topleft, top, topright, right, botright, bottom, botleft, left] array for Custom border style
   *
   * Custom border style:
   *
   * Each character in the list is used for the corresponding position.
   * -  "topleft" top left corner
   * -  "top" top side
   * -  "topright" top right corner
   * -  "right" right side
   * -  "botright" bottom right corner
   * -  "bottom" bottom side
   * -  "botleft" bottom left corner
   * -  "left" left side
   * An empty string can be used to turn off a specific border, for instance, ["", "", "", ">", "", "", "", "<" ]
   * will only make vertical borders but not horizontal ones.
   */
  border?:
    | "single"
    | "double"
    | "rounded"
    | "solid"
    | readonly [
      topleft: string,
      top: string,
      topright: string,
      right: string,
      botright: string,
      bottom: string,
      botleft: string,
      left: string,
    ];

  // https://github.com/vim-denops/deno-denops-std/blob/afa88b70d7b59c89b3bad158b6f02c4878dce2c5/popup/types.ts#L54
  /**
   * Highlighting of the popup:
   * - "normal" Normal highlight group
   * - "border" Border highlight group
   */
  highlight?: {
    normal?: string;
    border?: string;
  };
};

/**
 * The type of callback function invoked when the popup window is closed.
 */
export type CloseCallback = (
  denops: Denops,
  winId: number,
) => void | Promise<void>;

/**
 * The interface of popup window.
 */
export interface PreviewPopup {
  /**
   * Buffer number of this popup window.
   */
  readonly bufnr: number;

  /**
   * Window-ID of this popup window.
   */
  readonly winId: number;

  /**
   * Close this popup window.  Do nothing when this popup is already closed.
   */
  close(): Promise<void>;

  /**
   * Return TRUE if this popup is opened.  Otherwise FALSE.
   */
  isOpened(): Promise<boolean>;

  /**
   * Register a callback function invoked when this popup window is closed.
   */
  subscribeClose(callback: CloseCallback): void;
}

type Require<T> = Exclude<T, undefined>;

type OpenOptionPos = Require<OpenOptions["pos"]>;
type NvimOpenWinConfigAnchor = Require<nvimFn.NvimOpenWinConfig["anchor"]>;

/**
 * Open a popup window for showing some text at the cursor position.
 */
export async function openPreviewPopup(
  denops: Denops,
  options: OpenOptions,
): Promise<PreviewPopup> {
  const popup = new PreviewPopupImpl(denops);
  await popup.open(options);
  return popup;
}

class PreviewPopupImpl implements PreviewPopup {
  bufnr: number = 0;
  winId: number = 0;
  #denops: Denops;
  #closeHandlers: CloseCallback[];

  constructor(denops: Denops) {
    this.#denops = denops;
    this.#closeHandlers = [];
  }

  async open(options: OpenOptions) {
    const open = this.#denops.meta.host === "vim"
      ? openVimPopup
      : openNvimFloating;
    const onClose = async () => await this.#onClose();
    const [bufnr, winId] = await open(this.#denops, onClose, options);
    this.bufnr = bufnr;
    this.winId = winId;
  }

  async close() {
    const close = this.#denops.meta.host === "vim"
      ? closeVimPopup
      : closeNvimFloating;
    await close(this.#denops, this.winId);
  }

  async isOpened(): Promise<boolean> {
    return await fn.winbufnr(this.#denops, this.winId) !== -1;
  }

  subscribeClose(callback: CloseCallback) {
    this.#closeHandlers.push(callback);
  }

  async #onClose() {
    for (const handler of this.#closeHandlers) {
      await handler(this.#denops, this.winId);
    }
  }
}

async function openVimPopup(
  denops: Denops,
  callbackOnClose: () => Promise<void>,
  options: OpenOptions,
): Promise<[number, number]> {
  const numberToString = (n: number) => (n >= 0 ? "+" : "") + n.toString();
  const createOptions = {
    line: `cursor${numberToString(options.line)}`,
    col: `cursor${numberToString(options.col)}`,
    pos: options.pos,
    maxheight: options.maxheight,
    maxwidth: options.maxwidth,
    moved: options.moved,
    highlight: options.highlight?.normal,
    borderhighlight: options.highlight?.border
      ? [options.highlight.border]
      : undefined,
    ...(options.border ? toVimBorder(options.border) : {}),
  } satisfies Omit<vimFn.PopupCreateOptions, "callback">;

  const onClose = lambda.add(denops, async () => {
    onClose.dispose();
    await autocmd.group(denops, "lspoints.internal.previewpopup", (helper) => {
      helper.remove("*", "<buffer>");
    });
    await callbackOnClose();
  });

  const winId = ensure(
    await denops.eval(
      `popup_create(l:contents, extend(l:createOptions, {'callback': {-> l:denopsCallback}}, 'force'))`,
      {
        contents: options.contents,
        createOptions,
        denopsCallback: onClose.notify(),
      },
    ),
    is.Number,
  );
  const bufnr = await fn.winbufnr(denops, winId);

  if (options.filetype) {
    await fn.setbufvar(denops, bufnr, "&filetype", options.filetype);
  }

  await autocmd.group(denops, "lspoints.internal.previewpopup", (helper) => {
    helper.define("WinScrolled", "<buffer>", `call popup_close(${winId})`);
  });

  return [bufnr, winId];
}

async function closeVimPopup(denops: Denops, winId: number) {
  await vimFn.popup_close(denops, winId);
}

async function openNvimFloating(
  denops: Denops,
  callbackOnClose: () => Promise<void>,
  options: OpenOptions,
): Promise<[number, number]> {
  const maxTextWidth = ensure(
    await denops.eval("l:contents->map('strdisplaywidth(v:val)')->max()", {
      contents: options.contents,
    }),
    is.Number,
  );
  const createOptions = {
    relative: "cursor",
    anchor: options.pos ? toNvimAnchor(options.pos) : undefined,
    width: maxTextWidth,
    height: options.contents.length,
    row: options.line + 1, // Make positioning same to Vim.
    col: options.col,
    border: options.border ? toNvimBorder(options.border) : undefined,
    zindex: 99,
  } satisfies nvimFn.NvimOpenWinConfig;

  const curBufnr = await fn.bufnr(denops);
  const bufnr = await fn.bufadd(denops, "");
  const winId = await nvimFn.nvim_open_win(denops, bufnr, false, createOptions);

  const onClose = lambda.add(denops, async () => {
    onClose.dispose();
    await autocmd.group(denops, "lspoints.internal.previewpopup", (helper) => {
      helper.remove("*", `<buffer=${curBufnr}>`);
    });
    await callbackOnClose();
  });

  await batch(denops, async (denops) => {
    const winhighlight = toNvimWinhighlight(options.highlight);
    if (winhighlight) {
      await nvimFn.nvim_set_option_value(
        denops,
        winId,
        "winhighlight",
        winhighlight,
      );
    }

    await nvimFn.nvim_buf_set_lines(
      denops,
      bufnr,
      0,
      -1,
      true,
      options.contents,
    );
    await fn.setbufvar(denops, bufnr, "&buftype", "nofile");
    if (options.filetype) {
      await fn.setbufvar(denops, bufnr, "&filetype", options.filetype);
    }

    await autocmd.group(denops, "lspoints.internal.previewpopup", (helper) => {
      if (options.moved === "any") {
        helper.define(
          ["WinScrolled", "CursorMoved", "CursorMovedI", "InsertCharPre"],
          `<buffer=${curBufnr}>`,
          `call nvim_win_close(${winId}, 1)`,
          { nested: true },
        );
      }
      helper.define(
        "WinClosed",
        winId.toString(),
        `call ${onClose.notify()}`,
        { once: true, nested: true },
      );
    });
  });

  return [bufnr, winId];
}

async function closeNvimFloating(denops: Denops, winId: number) {
  if (await nvimFn.nvim_win_is_valid(denops, winId)) {
    await nvimFn.nvim_win_close(denops, winId, true);
  }
}

// toVimBorder is based on:
// https://github.com/vim-denops/deno-denops-std/blob/afa88b70d7b59c89b3bad158b6f02c4878dce2c5/popup/vim.ts#L88-L120
function toVimBorder(
  border: Require<OpenOptions["border"]>,
): {
  border: vimFn.PopupCreateOptions["border"];
  borderchars: vimFn.PopupCreateOptions["borderchars"];
} | { padding: vimFn.PopupCreateOptions["padding"] } {
  if (typeof border === "string") {
    switch (border) {
      case "single":
        return {
          border: [],
          borderchars: ["─", "│", "─", "│", "┌", "┐", "┘", "└"],
        };
      case "double":
        return {
          border: [],
          borderchars: ["═", "║", "═", "║", "╔", "╗", "╝", "╚"],
        };
      case "rounded":
        return {
          border: [],
          borderchars: ["─", "│", "─", "│", "╭", "╮", "╯", "╰"],
        };
      case "solid":
        return {
          padding: [1, 1, 1, 1],
        };
      default:
        border satisfies never;
    }
  }
  const [lt, t, rt, r, rb, b, lb, l] = border;
  return {
    border: [t ? 1 : 0, r ? 1 : 0, b ? 1 : 0, l ? 1 : 0],
    borderchars: [t, r, b, l, lt, rt, rb, lb],
  };
}

function toNvimAnchor(pos: OpenOptionPos): NvimOpenWinConfigAnchor {
  switch (pos) {
    case "topleft":
      return "NW";
    case "topright":
      return "NE";
    case "botleft":
      return "SW";
    case "botright":
      return "SE";
  }
}

// toNvimBorder and toNvimWinhighlight are based on:
// https://github.com/vim-denops/deno-denops-std/blob/afa88b70d7b59c89b3bad158b6f02c4878dce2c5/popup/nvim.ts#L99-L127
function toNvimBorder(
  border: Require<OpenOptions["border"]>,
): nvimFn.NvimOpenWinConfig["border"] {
  if (typeof border === "string") {
    return border;
  }
  const [lt, t, rt, r, rb, b, lb, l] = border;
  return [lt, t, rt, r, rb, b, lb, l];
}

function toNvimWinhighlight(
  highlight: OpenOptions["highlight"],
): string | undefined {
  if (!highlight) {
    return undefined;
  }
  const {
    normal = "FloatNormal",
    border = "FloatBorder",
  } = highlight;
  if (normal && border) {
    return `Normal:${normal},FloatBorder:${border}`;
  } else if (normal) {
    return `Normal:${normal}`;
  } else if (border) {
    return `FloatBorder:${border}`;
  }
  return undefined;
}
