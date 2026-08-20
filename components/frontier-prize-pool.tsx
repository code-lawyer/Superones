"use client";

import { useState } from "react";
import type { PublicPrizeDonation } from "@/lib/frontier/prizes";

const COLLAPSED_PRIZE_COUNT = 3;

function statusLabel(status: PublicPrizeDonation["status"]) {
  const labels: Record<PublicPrizeDonation["status"], string> = {
    available: "AVAILABLE",
    assigned: "ASSIGNED",
    carried_over: "CARRIED OVER",
  };
  return labels[status];
}

export function FrontierPrizePool({ prizes }: { prizes: PublicPrizeDonation[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = prizes.length > COLLAPSED_PRIZE_COUNT;
  const visiblePrizes = expanded ? prizes : prizes.slice(0, COLLAPSED_PRIZE_COUNT);

  return (
    <>
      <ol className="frontier-pool-list" id="frontier-prize-pool-list">
        {visiblePrizes.map((prize, index) => (
          <li key={prize.id}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{prize.name}</strong><p>{prize.description}</p></div>
            <span className="mono muted">{statusLabel(prize.status)}</span>
          </li>
        ))}
      </ol>
      {hasMore ? (
        <button
          className="frontier-pool-more"
          type="button"
          aria-expanded={expanded}
          aria-controls="frontier-prize-pool-list"
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? "收起奖池" : `查看全部 ${prizes.length} 件奖品`}</span>
          <span className="frontier-pool-more__icon" aria-hidden="true">↓</span>
        </button>
      ) : null}
    </>
  );
}
