export type MarketplaceFilters = {
  q?: string;
  category?: string;
  sort?: string;
  campus?: string;
  cursor?: string;
};

export function buildMarketplaceHref(
  current: MarketplaceFilters,
  updates: Partial<Record<keyof MarketplaceFilters, string | null>>,
) {
  const next = { ...current, ...updates };
  const params = new URLSearchParams();
  for (const key of ["q", "category", "sort", "campus", "cursor"] as const) {
    const value = next[key];
    if (value && !(key === "sort" && value === "newest") && !(key === "campus" && value === "my")) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}
