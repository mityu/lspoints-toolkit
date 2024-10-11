import { test } from "jsr:@denops/test@^3.0.4";
import { assertMatch } from "jsr:@std/assert@^1.0.6/match";
import { setHighlights } from "./highlight.ts";
import { batch } from "jsr:@denops/std@^7.1.0/batch";
import { is } from "jsr:@core/unknownutil@^4.3.0/is";
import { assert as assertType } from "jsr:@core/unknownutil@^4.3.0/assert";

test({
  mode: "all",
  name: "highlight/setHighlights()",
  fn: async (denops, t) => {
    await t.step("define a highlight", async () => {
      await denops.cmd("highlight clear");
      await setHighlights(denops, [{
        name: "TestHighlightGroup",
        guifg: "#000000",
        guibg: "#ffffff",
      }]);
      const hl = await denops.eval(
        "execute('0verbose highlight TestHighlightGroup')",
      );
      assertType(hl, is.String);
      assertMatch(
        hl.trim(),
        /^TestHighlightGroup\s+xxx\s+guifg=#000000\s+guibg=#ffffff(?:\s+guisp=#000000)?$/,
      );
    });

    await t.step("define a highlight-link", async () => {
      await denops.cmd("highlight clear");
      await setHighlights(denops, [{
        name: "TestHighlightGroup",
        linksto: "Error",
      }]);
      const hl = await denops.eval(
        "execute('0verbose highlight TestHighlightGroup')",
      );
      assertType(hl, is.String);
      assertMatch(hl.trim(), /^TestHighlightGroup\s+xxx\s+links\s+to\s+Error$/);
    });

    await t.step(
      "does not overwrite existing highlight in default",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd(
          "highlight TestHighlightGroup ctermfg=white ctermbg=black",
        );
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          linksto: "Todo",
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(hl.trim(), /^TestHighlightGroup\s+xxx\s+cterm/);
      },
    );

    await t.step(
      "does not overwrite existing highlight-link in default",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd("highlight link TestHighlightGroup Error");
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          linksto: "Todo",
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+links\s+to\s+Error$/,
        );
      },
    );

    await t.step(
      "does not overwrite existing highlight in default",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd(
          "highlight TestHighlightGroup ctermfg=white ctermbg=black",
        );
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          linksto: "Todo",
          overwrite: false,
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(hl.trim(), /^TestHighlightGroup\s+xxx\s+cterm/);
      },
    );

    await t.step(
      "does not overwrite existing highlight-link in default",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd("highlight link TestHighlightGroup Error");
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          linksto: "Todo",
          overwrite: false,
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+links\s+to\s+Error$/,
        );
      },
    );

    await t.step(
      "overrides existing highlight when force is true",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd("highlight TestHighlightGroup guifg=#987654 guibg=#456789");
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          guifg: "#123456",
          guibg: "#fedcba",
          overwrite: true,
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+guifg=#123456\s+guibg=#fedcba(?:\s+guisp=#000000)?$/,
        );
      },
    );

    await t.step(
      "overrides existing highlight-link when force is true",
      async () => {
        await denops.cmd("highlight clear");
        await denops.cmd("highlight link TestHighlightGroup Error");
        await setHighlights(denops, [{
          name: "TestHighlightGroup",
          guifg: "#654321",
          guibg: "#abcdef",
          overwrite: true,
        }]);
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+guifg=#654321\s+guibg=#abcdef(?:\s+guisp=#000000)?$/,
        );
      },
    );

    await t.step("when called in batch()", async (t) => {
      await t.step("define a highlight", async () => {
        await batch(denops, async (denops) => {
          await denops.cmd("highlight clear");
          await setHighlights(denops, [{
            name: "TestHighlightGroup",
            guifg: "#000000",
            guibg: "#ffffff",
          }]);
        });
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+guifg=#000000\s+guibg=#ffffff(?:\s+guisp=#000000)?$/,
        );
      });
      await t.step("define a highlight-link", async () => {
        await batch(denops, async (denops) => {
          await denops.cmd("highlight clear");
          await setHighlights(denops, [{
            name: "TestHighlightGroup",
            linksto: "Error",
          }]);
        });
        const hl = await denops.eval(
          "execute('0verbose highlight TestHighlightGroup')",
        );
        assertType(hl, is.String);
        assertMatch(
          hl.trim(),
          /^TestHighlightGroup\s+xxx\s+links\s+to\s+Error$/,
        );
      });
    });
  },
});
