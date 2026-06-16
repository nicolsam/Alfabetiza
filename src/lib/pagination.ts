export const DEFAULT_PAGE_SIZE = 30
export const PAGE_SIZE_OPTIONS = [30, 40, 60] as const

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]

export type PaginationParams = {
  page: number
  pageSize: PageSizeOption
  skip: number
  take: PageSizeOption
}

export type PaginationMeta = {
  page: number
  pageSize: PageSizeOption
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export function hasPaginationParams(searchParams: URLSearchParams): boolean {
  return searchParams.has('page') || searchParams.has('pageSize')
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1)
  const rawPageSize = Number.parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize as PageSizeOption)
    ? rawPageSize as PageSizeOption
    : DEFAULT_PAGE_SIZE

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}

export function hasNamedPaginationParams(
  searchParams: URLSearchParams,
  pageParam: string,
  pageSizeParam: string
): boolean {
  return searchParams.has(pageParam) || searchParams.has(pageSizeParam)
}

export function parseNamedPaginationParams(
  searchParams: URLSearchParams,
  pageParam: string,
  pageSizeParam: string
): PaginationParams {
  const paginationParams = new URLSearchParams()
  const page = searchParams.get(pageParam)
  const pageSize = searchParams.get(pageSizeParam)

  if (page) paginationParams.set('page', page)
  if (pageSize) paginationParams.set('pageSize', pageSize)

  return parsePaginationParams(paginationParams)
}

export function buildPaginationMeta(params: {
  page: number
  pageSize: PageSizeOption
  totalItems: number
}): PaginationMeta {
  const totalItems = Math.max(params.totalItems, 0)
  const totalPages = Math.max(Math.ceil(totalItems / params.pageSize), 1)
  const page = Math.min(Math.max(params.page, 1), totalPages)

  return {
    page,
    pageSize: params.pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}
