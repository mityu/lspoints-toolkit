import type { Denops } from "jsr:@denops/std@^7.1.0";
import { is } from "jsr:@core/unknownutil@4.3.0/is";

/**
 * Option entries for `echo` function.
 *
 * - record: If this is true, the message will be shown with `:echomsg`.
 * - highlight: The highlight group name applied to the message.
 * - prefix: The prefix text added at the every head of line.
 */
export type EchoOptions = {
  record?: boolean;
  highlight?: string;
  prefix?: string;
};

/**
 * Utility function for lspoints plugins to show messages on echo area.
 *
 * ```typescript
 * import type { Denops } from "jsr:@denops/std";
 * import { echo } from "jsr:@mityu/lspoints-toolkit/echo";
 *
 * async function example(denops: Denops) {
 *   await echo(denops, "This is normal :echo message");
 *   await echo(denops, "This is normal :echomsg message", { record: true });
 *   await echo(denops, "This is :echo message with Error color", {
 *     highlight: "Error",
 *   });
 *   await echo(denops, "This is :echomsg message with WarningMsg color", {
 *     record: true,
 *     highlight: "WarningMsg",
 *   });
 *   await echo (denops, "This message is prefixed by '[myplugin]'", {
 *     prefix: "[myplugin]" ,
 *   });
 * }
 * ```
 */
export async function echo(
  denops: Denops,
  message: string | string[],
  options?: EchoOptions,
) {
  const prefix = options?.prefix ? options.prefix : "[lspoints] ";
  let msgs = is.String(message) ? message.split("\n") : message;
  if (prefix.length > 0) {
    msgs = msgs.map((v) => `${prefix}${v}`);
  }

  const cmds = [] as string[];
  const echocmd = options?.record ? "echomsg" : "echo";
  if (options?.highlight) {
    cmds.push(`echohl ${options.highlight}`);
  }
  cmds.push("for l:msg in l:msgs");
  cmds.push(`${echocmd} l:msg`);
  cmds.push("endfor");
  if (options?.highlight) {
    cmds.push("echohl None");
  }

  await denops.cmd("call execute(l:cmds, '')", { cmds, msgs });
}
