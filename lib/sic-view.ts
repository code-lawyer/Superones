export const SIC_VIEW_IDS = ["papers", "documents", "courses", "podcasts", "rankings"] as const;
export type SicViewId = (typeof SIC_VIEW_IDS)[number];

export function parseSicView(value: string | string[] | undefined): SicViewId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SIC_VIEW_IDS.includes(candidate as SicViewId) ? candidate as SicViewId : "papers";
}

export function sicViewHref(view: SicViewId) {
  const anchor = view === "rankings" ? "sic-rankings" : `sic-group-${view}`;
  return `/sic?view=${view}#${anchor}`;
}
