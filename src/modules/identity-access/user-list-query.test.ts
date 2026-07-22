import { describe, expect, it } from "vitest";
import { parseUserListQuery, USER_PAGE_SIZES } from "./user-list-query";

describe("user list query", () => {
  it("uses safe defaults", () => {
    expect(parseUserListQuery({})).toEqual({
      query: "",
      status: "ALL",
      page: 1,
      pageSize: 25,
    });
  });

  it.each(USER_PAGE_SIZES)("accepts the allowlisted page size %i", (pageSize) => {
    expect(parseUserListQuery({ pageSize: String(pageSize) }).pageSize).toBe(pageSize);
  });

  it.each(["0", "11", "250", "25items", "-10", "1.5"])(
    "rejects non-allowlisted page size %s",
    (pageSize) => {
      expect(parseUserListQuery({ pageSize }).pageSize).toBe(25);
    },
  );

  it("normalizes filters and bounds user-controlled values", () => {
    expect(
      parseUserListQuery({
        q: `  ${"a".repeat(120)}  `,
        status: "active",
        page: "20000",
        pageSize: "100",
      }),
    ).toEqual({
      query: "a".repeat(100),
      status: "ACTIVE",
      page: 10_000,
      pageSize: 100,
    });
  });

  it("ignores ambiguous array values", () => {
    expect(
      parseUserListQuery({
        q: ["first", "second"],
        status: ["ACTIVE", "SUSPENDED"],
        page: ["2", "3"],
        pageSize: ["10", "100"],
      }),
    ).toEqual({
      query: "",
      status: "ALL",
      page: 1,
      pageSize: 25,
    });
  });
});
