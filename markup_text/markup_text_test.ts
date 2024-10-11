import { assertType } from "jsr:@std/testing@^1.0.3/types";
import type { IsExact } from "jsr:@std/testing@^1.0.3/types";
import type { TextAttrItem } from "./markup_text.ts";
import { textAttrTypes } from "./markup_text.ts";
import { assertEquals } from "jsr:@std/assert@^1.0.6/equals";

Deno.test("Type definitions/constants in markup_text.ts", async (t) => {
  await t.step("No duplicate types in TextAttrItem", () => {
    // Check this by confirming all the elements are not optional.
    assertType<
      IsExact<TextAttrItem, Required<TextAttrItem>>
    >(true);
  });

  await t.step("No duplications in textAttrTypes entries", () => {
    const set = new Set(textAttrTypes);
    assertEquals(set.size, textAttrTypes.length);
  });

  await t.step("TypeAttrItem.type has every entry of textAttrTypes", () => {
    type Types = typeof textAttrTypes[number];
    assertType<IsExact<Types, TextAttrItem["type"]>>(true);
  });
});
