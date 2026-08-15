"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatNumber } from "@/lib/number-format";
import type { SicBoard } from "@/lib/sic";

function capturedAtLabel(value: string | null | undefined) {
  if (!value) return "时间未记录";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(parsed).replaceAll("/", ".");
}

export function SicRankings({
  boards,
  unavailable = false,
}: {
  boards: SicBoard[];
  unavailable?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedIndex = boards.findIndex((board) => board.id === searchParams.get("board"));
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const boardCount = boards.length;

  if (unavailable) {
    return <p className="sic-overview-ranking__status" role="status">趋势榜读取失败；没有把故障伪装成空榜，请稍后重试。</p>;
  }
  if (!boardCount) return <p className="sic-overview-ranking__status">当前平台榜单暂不可用。</p>;

  const move = (direction: -1 | 1) => {
    const nextIndex = (activeIndex + direction + boardCount) % boardCount;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.set("board", boards[nextIndex].id);
    router.push(`${pathname}?${params.toString()}#sic-rankings`, { scroll: false });
  };
  const previousBoard = boards[(activeIndex - 1 + boardCount) % boardCount];
  const activeBoard = boards[activeIndex];
  const nextBoard = boards[(activeIndex + 1) % boardCount];

  return (
    <div className="sic-overview-ranking" aria-label="平台趋势榜横向浏览">
      <div className="sic-overview-ranking__controls">
        <button type="button" onClick={() => move(-1)} aria-label={`查看上一个榜单：${previousBoard.title}`}>
          <span className="sic-overview-ranking__triangle sic-overview-ranking__triangle--previous" aria-hidden="true" />
        </button>
        <span className="sic-overview-ranking__position" aria-live="polite">
          <small title={previousBoard.title}>{previousBoard.title}</small>
          <span>
            <b title={activeBoard.title}>{activeBoard.title}</b>
            <em>{String(activeIndex + 1).padStart(2, "0")} / {String(boardCount).padStart(2, "0")}</em>
          </span>
          <small title={nextBoard.title}>{nextBoard.title}</small>
        </span>
        <button type="button" onClick={() => move(1)} aria-label={`查看下一个榜单：${nextBoard.title}`}>
          <span className="sic-overview-ranking__triangle sic-overview-ranking__triangle--next" aria-hidden="true" />
        </button>
      </div>
      <div className="sic-overview-ranking__viewport">
        <div className="sic-overview-ranking__track" style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}>
          {boards.map((board, boardIndex) => (
            <section
              className="sic-overview-ranking__slide"
              aria-current={boardIndex === activeIndex ? "true" : undefined}
              aria-hidden={boardIndex !== activeIndex}
              key={board.id}
            >
              <header>
                <span>{board.eyebrow}</span>
                <h3>{board.title}</h3>
                <div className="sic-overview-ranking__trust">
                  <b>{board.stale ? "更新延迟" : "已采集"}</b>
                  <time dateTime={board.capturedAt}>{capturedAtLabel(board.capturedAt)}</time>
                  {board.sourceUrl ? (
                    <a
                      href={board.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      tabIndex={boardIndex === activeIndex ? 0 : -1}
                      aria-label={`${board.title}原始榜单（在新标签页打开）`}
                    >原始榜单 ↗</a>
                  ) : null}
                </div>
                <small>TOP {Math.min(5, board.items.length)} · {board.metric}</small>
              </header>
              {board.items.length ? (
                <ol>
                  {board.items.slice(0, 5).map((item, itemIndex) => (
                    <li key={item.id}>
                      <span>{String(itemIndex + 1).padStart(2, "0")}</span>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        tabIndex={boardIndex === activeIndex ? 0 : -1}
                        aria-label={`${item.name}（在新标签页打开）`}
                      >{item.name}</a>
                      <b>{item.value === null ? "—" : formatNumber(item.value)}</b>
                    </li>
                  ))}
                </ol>
              ) : <p className="sic-overview-ranking__empty">{board.emptyMessage}</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
