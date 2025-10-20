import { describe, expect, it } from "vitest";
import { grafastSync } from "grafast";
import { schema } from "./addTwoNumbers";

describe("addTwoNumbers", () => {
  it("adds two numbers", () => {
    const result = grafastSync({
      schema,
      source: /* GraphQL */ `
        {
          addTwoNumbers(a: 40, b: 2)
        }
      `,
    });
    expect(result).toEqual({ data: { addTwoNumbers: 42 } });
  });
});
