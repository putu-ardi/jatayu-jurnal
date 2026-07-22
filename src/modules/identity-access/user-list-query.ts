export const USER_PAGE_SIZES = [10, 25, 50, 100] as const;
export type UserPageSize = (typeof USER_PAGE_SIZES)[number];

const DEFAULT_PAGE_SIZE: UserPageSize = 25;
const STATUS_FILTERS = ["ALL", "INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatusFilter = (typeof STATUS_FILTERS)[number];

export type UserListQuery = {
  query: string;
  status: UserStatusFilter;
  page: number;
  pageSize: UserPageSize;
};

export function parseUserListQuery(
  input: Record<string, string | string[] | undefined>,
): UserListQuery {
  const rawStatus = typeof input.status === "string" ? input.status.toUpperCase() : "ALL";
  const status = STATUS_FILTERS.includes(rawStatus as UserStatusFilter)
    ? (rawStatus as UserStatusFilter)
    : "ALL";
  const rawPage = typeof input.page === "string" ? Number(input.page) : 1;
  const rawPageSize = typeof input.pageSize === "string" ? Number(input.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = USER_PAGE_SIZES.includes(rawPageSize as UserPageSize)
    ? (rawPageSize as UserPageSize)
    : DEFAULT_PAGE_SIZE;

  return {
    query: typeof input.q === "string" ? input.q.trim().slice(0, 100) : "",
    status,
    page: Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1,
    pageSize,
  };
}
