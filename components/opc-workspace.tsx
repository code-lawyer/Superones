"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { OpcFeeNotePopover } from "@/components/opc-fee-note-popover";
import {
  infrastructureGroups,
  specialtyDomains,
  type OpcService,
  type RangerIdentity,
  type RangerProfile,
  type ServiceCategoryDescription,
} from "@/lib/opc-catalog";
import { legacyRangerAvatarPublicUrl, rangerAvatarPublicUrl } from "@/lib/ranger-avatar";
import { buildRangerShelfEntries } from "@/lib/ranger-shelf-order";

type WorkspaceView = "infrastructure" | "specialties" | "rangers";

type OpcWorkspaceProps = {
  infrastructure: OpcService[];
  specialties: OpcService[];
  serviceCategoryDescriptions: ServiceCategoryDescription[];
  rangerIdentities: RangerIdentity[];
  rangers: RangerProfile[];
  orderingAvailable: boolean;
  rangerMediaOrigin: string;
  initialView?: WorkspaceView;
  initialServiceSlug?: string;
};

type ServiceGroup = {
  id: string;
  label: string;
  note: string;
  items: OpcService[];
};

type RangerGroup = {
  id: string;
  label: string;
  note: string;
  items: RangerProfile[];
};

const viewCopy: Record<WorkspaceView, { code: string; title: string; note: string }> = {
  infrastructure: { code: "01", title: "基础设施", note: "建立持续经营的完整底座" },
  specialties: { code: "02", title: "专项服务", note: "解决一个边界明确的专业事项" },
  rangers: { code: "03", title: "游骑兵协会", note: "直接联系外部独立顾问" },
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function revealHeading(heading: HTMLHeadingElement | null) {
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

export function OpcWorkspace({
  infrastructure,
  specialties,
  serviceCategoryDescriptions,
  rangerIdentities,
  rangers,
  orderingAvailable,
  rangerMediaOrigin,
  initialView = "infrastructure",
  initialServiceSlug,
}: OpcWorkspaceProps) {
  const router = useRouter();
  const serviceCategoryDescriptionByKey = useMemo(() => new Map(
    serviceCategoryDescriptions.map((category) => [`${category.section}:${category.name}`, category.description]),
  ), [serviceCategoryDescriptions]);
  const groupedInfrastructure = useMemo<ServiceGroup[]>(() => infrastructureGroups.map((group) => {
    const items = infrastructure.filter((service) => service.group === group);
    return {
      id: group,
      label: group,
      note: serviceCategoryDescriptionByKey.get(`infrastructure:${group}`) ?? "",
      items,
    };
  }), [infrastructure, serviceCategoryDescriptionByKey]);
  const specialtyGroups = useMemo<ServiceGroup[]>(() => specialtyDomains.map((domain) => ({
    id: domain,
    label: domain,
    note: serviceCategoryDescriptionByKey.get(`specialties:${domain}`) ?? "",
    items: specialties.filter((service) => service.domain === domain),
  })), [specialties, serviceCategoryDescriptionByKey]);
  const rangerGroups = useMemo<RangerGroup[]>(() => rangerIdentities.map((identity) => {
    const items = rangers.filter((profile) => profile.identityId === identity.id);
    return {
      id: identity.id,
      label: identity.name,
      note: identity.description,
      items,
    };
  }), [rangerIdentities, rangers]);

  const initialServices = initialView === "specialties" ? specialties : infrastructure;
  const initialService = initialView === "rangers" || !initialServiceSlug
    ? null
    : initialServices.find((service) => service.slug === initialServiceSlug) ?? null;
  const initialGroups = initialView === "specialties" ? specialtyGroups : groupedInfrastructure;
  const initialOpenGroup = initialService
    ? initialGroups.find((group) => group.items.some((service) => service.slug === initialService.slug))?.id
    : initialGroups[0]?.id;

  const [view, setView] = useState<WorkspaceView>(initialView);
  const [openGroup, setOpenGroup] = useState(initialView === "rangers" ? rangerGroups[0]?.id ?? "" : initialOpenGroup ?? "");
  const [selectedService, setSelectedService] = useState<OpcService | null>(initialService);
  const [announcement, setAnnouncement] = useState("");
  const focusDetailOnChangeRef = useRef(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const serviceGroups = view === "infrastructure" ? groupedInfrastructure : specialtyGroups;
  const visibleServices = view === "specialties" ? specialties : infrastructure;
  const selectedServiceIndex = selectedService
    ? visibleServices.findIndex((service) => service.code === selectedService.code)
    : -1;
  const previousService = selectedServiceIndex > 0 ? visibleServices[selectedServiceIndex - 1] : null;
  const nextService = selectedServiceIndex >= 0 && selectedServiceIndex < visibleServices.length - 1
    ? visibleServices[selectedServiceIndex + 1]
    : null;

  useEffect(() => {
    if (!focusDetailOnChangeRef.current || !selectedService) return;
    focusDetailOnChangeRef.current = false;
    revealHeading(detailHeadingRef.current);
  }, [selectedService]);

  function pushWorkspaceLocation(nextView: WorkspaceView, service?: OpcService | null) {
    const parameters = new URLSearchParams({ view: nextView });
    if (service) parameters.set("service", service.slug);
    router.push(`/opc?${parameters.toString()}`, { scroll: false });
  }

  function changeView(nextView: WorkspaceView) {
    if (nextView === view) return;
    setView(nextView);
    setSelectedService(null);
    setAnnouncement(`已切换至${viewCopy[nextView].title}，请从服务目录选择具体项目。`);
    if (nextView === "infrastructure") {
      setOpenGroup(groupedInfrastructure[0]?.id ?? "");
      pushWorkspaceLocation(nextView);
    }
    if (nextView === "specialties") {
      setOpenGroup(specialtyGroups[0]?.id ?? "");
      pushWorkspaceLocation(nextView);
    }
    if (nextView === "rangers") {
      setOpenGroup(rangerGroups[0]?.id ?? "");
      pushWorkspaceLocation(nextView);
    }
  }

  function selectService(service: OpcService, revealDetail = false) {
    focusDetailOnChangeRef.current = revealDetail;
    const owningGroup = serviceGroups.find((group) => group.items.some((item) => item.slug === service.slug));
    if (owningGroup) setOpenGroup(owningGroup.id);
    setSelectedService(service);
    setAnnouncement(`已选择${service.name}。`);
    pushWorkspaceLocation(view, service);
  }

  function revealSelectedService() {
    if (!selectedService) return;
    revealHeading(detailHeadingRef.current);
  }

  return <>
    <section className="opc-service-browser" id="opc-service-browser" aria-label="OPC 服务目录">
      <aside className="opc-service-browser__primary">
        <div className="opc-service-browser__sticky">
          <nav aria-label="OPC 一级入口">
            {(Object.keys(viewCopy) as WorkspaceView[]).map((item) => (
              <button className={view === item ? "is-active" : ""} type="button" onClick={() => changeView(item)} key={item}>
                <strong>{viewCopy[item].title}</strong>
                <small>{viewCopy[item].note}</small>
              </button>
            ))}
          </nav>
          <div className="opc-service-browser__boundary">
            <span>{view === "rangers"
              ? "外部独立顾问；用户与专家自行建立联系"
              : "Vault2077 直接交付；先确认范围，再开始服务"}</span>
          </div>
        </div>
      </aside>

      <aside className="opc-service-browser__secondary">
        <div className="opc-service-browser__sticky">
          <header>
            <p className="mono">{viewCopy[view].code} / DIRECTORY</p>
            <h2>{viewCopy[view].title}</h2>
            <p className="opc-service-browser__secondary-lede">{viewCopy[view].note}</p>
          </header>
          {view === "rangers" ? (
            <RangerNavigation groups={rangerGroups} openGroup={openGroup} onToggle={setOpenGroup} />
          ) : (
            <ServiceNavigation
              groups={serviceGroups}
              openGroup={openGroup}
              selected={selectedService}
              onToggle={setOpenGroup}
              onSelect={selectService}
              onRevealSelected={revealSelectedService}
            />
          )}
        </div>
      </aside>

      <section
        className={view === "rangers"
          ? "opc-service-browser__content opc-service-browser__content--rangers"
          : "opc-service-browser__content"}
        aria-label={`${viewCopy[view].title}详情`}
      >
        {view === "rangers"
          ? <RangerShelf identities={rangerIdentities} profiles={rangers} mediaOrigin={rangerMediaOrigin} />
          : selectedService
            ? <ServiceReadingPane
              service={selectedService}
              previousService={previousService}
              nextService={nextService}
              headingRef={detailHeadingRef}
              onSelect={(service) => selectService(service, true)}
              orderingAvailable={orderingAvailable}
            />
            : <ServiceEmptyPane title={viewCopy[view].title} />}
      </section>
      <p className="opc-service-browser__announcement" aria-live="polite">{announcement}</p>
    </section>
  </>;
}

function ServiceNavigation({ groups, openGroup, selected, onToggle, onSelect, onRevealSelected }: {
  groups: ServiceGroup[];
  openGroup: string;
  selected: OpcService | null;
  onToggle: (id: string) => void;
  onSelect: (service: OpcService) => void;
  onRevealSelected: () => void;
}) {
  return <div className="opc-accordion">{groups.map((group) => {
    const open = openGroup === group.id;
    return <AccordionGroup
      id={group.id}
      label={group.label}
      note={group.note}
      count={group.items.length}
      open={open}
      onToggle={onToggle}
      key={group.id}
    >
        {group.items.map((service) => {
          const selectedItem = selected?.code === service.code;
          return <button
            className={selectedItem ? "opc-accordion__item is-selected" : "opc-accordion__item"}
            type="button"
            aria-current={selectedItem ? "true" : undefined}
            onClick={() => onSelect(service)}
            key={service.code}
          >
            <span className="mono">{service.code.split("/").at(-1)}</span>
            <span className="opc-accordion__item-copy">
              <strong>{service.name}</strong>
            </span>
            <i aria-hidden="true">→</i>
          </button>;
        })}
    </AccordionGroup>;
  })}
    {selected ? <div className="opc-service-browser__selected">
      <p className="mono">SELECTED / 已选择</p>
      <strong>{selected.name}</strong>
      <button type="button" onClick={onRevealSelected}>查看服务详情 <span aria-hidden="true">↓</span></button>
    </div> : null}
  </div>;
}

function RangerNavigation({ groups, openGroup, onToggle }: {
  groups: RangerGroup[];
  openGroup: string;
  onToggle: (id: string) => void;
}) {
  return <div className="opc-accordion">{groups.map((group) => {
    const open = openGroup === group.id;
    return <AccordionGroup
      id={group.id}
      label={group.label}
      note={group.note}
      count={group.items.length}
      open={open}
      onToggle={onToggle}
      key={group.id}
    >
        {group.items.length > 0
          ? group.items.map((profile) => <Link className="opc-accordion__item" href={`/opc/rangers/${profile.slug}`} key={profile.slug}>
            <span className="mono">PROFILE</span><strong>{profile.publicName}</strong><i aria-hidden="true">→</i>
          </Link>)
          : <div className="opc-accordion__placeholder">
            <span className="mono">TEMPLATE</span>
            <strong>真实顾问档案待补充</strong>
          </div>}
    </AccordionGroup>;
  })}</div>;
}

function AccordionGroup({ id, label, note, count, open, onToggle, children }: {
  id: string;
  label: string;
  note: string;
  count: number;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return <section className={open ? "opc-accordion__group is-open" : "opc-accordion__group"}>
    <button className="opc-accordion__trigger" type="button" aria-expanded={open} onClick={() => onToggle(open ? "" : id)}>
      <span><strong>{label}</strong><small>{note}</small></span>
      <i className="mono">{String(count).padStart(2, "0")} {open ? "−" : "+"}</i>
    </button>
    <div className="opc-accordion__drawer" aria-hidden={!open}><div>{children}</div></div>
  </section>;
}

function ServiceEmptyPane({ title }: { title: string }) {
  return <section className="opc-reading-empty">
    <p className="mono">SERVICE BRIEF / 服务说明</p>
    <div>
      <span aria-hidden="true">↘</span>
      <h2>选择一项服务，<br />再查看正式说明。</h2>
      <p>请从中栏浏览「{title}」下的具体项目。系统不会替你默认选择；范围、价格、材料、交付成果和验收标准将在选择后完整展开。</p>
    </div>
  </section>;
}

function ServiceReadingPane({ service, previousService, nextService, headingRef, onSelect, orderingAvailable }: {
  service: OpcService;
  previousService: OpcService | null;
  nextService: OpcService | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSelect: (service: OpcService) => void;
  orderingAvailable: boolean;
}) {
  return <article className="opc-reading-pane">
    <header>
      <div className="opc-reading-pane__meta mono">
        <span><b>服务编号</b>{service.code}</span>
        <span><b>目录分类</b>{service.group}</span>
      </div>
      <h2 ref={headingRef} tabIndex={-1}>{service.name}</h2>
      <p>{service.outcome}</p>
    </header>
    <div className="opc-reading-pane__fact-register" aria-label="当前服务价格和周期">
      <div className="opc-reading-pane__facts">
        <div className="opc-reading-pane__fact opc-reading-pane__fact--price">
          <b className="mono">标准价格</b>
          <div className="opc-reading-pane__price">
            <strong>{service.price}</strong>
            {service.feeNote ? (
              <OpcFeeNotePopover
                key={service.slug}
                id={`opc-fee-note-${service.slug}`}
                note={service.feeNote}
              />
            ) : null}
          </div>
          {orderingAvailable ? (
            <Link className="opc-reading-pane__purchase" href={`/opc/order?kind=${service.kind}&service=${encodeURIComponent(service.slug)}`}>
              <span>立即下单</span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button
              className="opc-reading-pane__purchase"
              type="button"
              aria-describedby={`opc-order-availability-${service.slug}`}
              disabled
            >
              <span>立即下单</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
        <div className="opc-reading-pane__fact">
          <b className="mono">预计周期</b>
          <strong>{service.period}</strong>
        </div>
      </div>
      <p className="opc-reading-pane__fact-note">
        <span>Vault2077 直接交付</span>
        <span id={`opc-order-availability-${service.slug}`}>
          {orderingAvailable ? "独立付款页面" : "付款服务配置完成后可提交订单"}
        </span>
      </p>
    </div>
    <div className="opc-reading-pane__body">
      <section>
        <p className="mono">适用范围</p>
        <h3>适用对象</h3>
        <p>{service.audience}</p>
      </section>
      <section>
        <p className="mono">服务范围</p>
        <h3>标准服务包含</h3>
        <ul>{service.includes.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section>
        <p className="mono">启动条件</p>
        <h3>用户需提交的材料</h3>
        <ul>{service.materials.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className="opc-reading-pane__delivery">
        <p className="mono">完成定义</p>
        <h3>交付成果和验收标准</h3>
        <div className="opc-reading-pane__delivery-sections">
          <div><h4>交付成果</h4><ul>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>
          {service.acceptance?.length ? <div><h4>验收标准</h4><ul>{service.acceptance.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        </div>
      </section>
      <section className="opc-reading-pane__limits">
        <p className="mono">责任边界</p>
        <h3>范围限定说明</h3>
        <p>{service.boundary}</p>
        <Link href="/opc?view=rangers">转至游骑兵协会 <span aria-hidden="true">↗</span></Link>
      </section>
      {(previousService || nextService) ? <nav className="opc-reading-pane__pagination" aria-label="切换服务">
        {previousService
          ? <button type="button" onClick={() => onSelect(previousService)}><span className="mono">← PREVIOUS</span><strong>{previousService.name}</strong></button>
          : <span />}
        {nextService
          ? <button type="button" onClick={() => onSelect(nextService)}><span className="mono">NEXT →</span><strong>{nextService.name}</strong></button>
          : <span />}
      </nav> : null}
    </div>
  </article>;
}

const RANGER_SHELF_PAGE_SIZE = 6;

function RangerShelf({ identities, profiles, mediaOrigin }: {
  identities: RangerIdentity[];
  profiles: RangerProfile[];
  mediaOrigin: string;
}) {
  const entries = buildRangerShelfEntries(profiles, identities);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const previousPagerRef = useRef<HTMLButtonElement>(null);
  const nextPagerRef = useRef<HTMLButtonElement>(null);
  const pendingPagerFocusRef = useRef<"previous" | "next" | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const pendingShelfMotionRef = useRef<{ rects: Map<string, DOMRect>; duration: number } | null>(null);
  const shelfAnimationsRef = useRef<Animation[]>([]);
  const keyboardModalityRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(entries.length / RANGER_SHELF_PAGE_SIZE));
  const pageStart = pageIndex * RANGER_SHELF_PAGE_SIZE;
  const visibleEntries = entries.slice(pageStart, pageStart + RANGER_SHELF_PAGE_SIZE);
  const fillerCount = Math.max(0, RANGER_SHELF_PAGE_SIZE - visibleEntries.length);
  const canPageBackward = pageIndex > 0;
  const canPageForward = pageIndex < pageCount - 1;

  useEffect(() => {
    const handleKeyboardModality = () => {
      keyboardModalityRef.current = true;
    };
    const handlePointerModality = () => {
      keyboardModalityRef.current = false;
    };
    document.addEventListener("keydown", handleKeyboardModality, true);
    document.addEventListener("pointerdown", handlePointerModality, true);
    return () => {
      document.removeEventListener("keydown", handleKeyboardModality, true);
      document.removeEventListener("pointerdown", handlePointerModality, true);
    };
  }, []);

  useEffect(() => {
    const preferredDirection = pendingPagerFocusRef.current;
    if (!preferredDirection) return;

    const preferredPager = preferredDirection === "next" ? nextPagerRef.current : previousPagerRef.current;
    const fallbackPager = preferredDirection === "next" ? previousPagerRef.current : nextPagerRef.current;
    (preferredPager ?? fallbackPager)?.focus();
    pendingPagerFocusRef.current = null;
  }, [pageIndex]);

  useLayoutEffect(() => {
    const pendingMotion = pendingShelfMotionRef.current;
    if (!pendingMotion) return;
    pendingShelfMotionRef.current = null;

    const measurements = [...itemRefs.current].flatMap(([key, element]) => {
      const previous = pendingMotion.rects.get(key);
      if (!previous) return [];
      const next = element.getBoundingClientRect();
      if (next.width <= 0 || previous.width <= 0) return [];
      return [{ element, previous, next }];
    });

    shelfAnimationsRef.current = measurements.flatMap(({ element, previous, next }) => {
      const translateX = previous.left - next.left;
      const scaleX = previous.width / next.width;
      if (Math.abs(translateX) < .5 && Math.abs(scaleX - 1) < .005) return [];
      const outer = element.animate([
        { transform: `translateX(${translateX}px) scaleX(${scaleX})`, transformOrigin: "left center" },
        { transform: "none", transformOrigin: "left center" },
      ], {
        duration: pendingMotion.duration,
        easing: "cubic-bezier(.16, 1, .3, 1)",
      });
      const innerAnimations = [...element.children].map((child) => child.animate([
        { transform: `scaleX(${1 / scaleX})`, transformOrigin: "left center" },
        { transform: "none", transformOrigin: "left center" },
      ], {
        duration: pendingMotion.duration,
        easing: "cubic-bezier(.16, 1, .3, 1)",
      }));
      return [outer, ...innerAnimations];
    });
  }, [activeKey]);

  useEffect(() => () => {
    shelfAnimationsRef.current.forEach((animation) => animation.cancel());
  }, []);

  function changeActiveKey(nextKey: string | null) {
    if (nextKey === activeKey) return;
    const currentRects = prefersReducedMotion()
      ? null
      : new Map([...itemRefs.current].map(([key, element]) => [key, element.getBoundingClientRect()]));
    shelfAnimationsRef.current.forEach((animation) => animation.cancel());
    shelfAnimationsRef.current = [];
    if (currentRects) {
      pendingShelfMotionRef.current = {
        rects: currentRects,
        duration: nextKey ? 1_250 : 560,
      };
    }
    setActiveKey(nextKey);
  }

  function focusedShelfKey() {
    if (!keyboardModalityRef.current) return null;
    const focusedElement = document.activeElement;
    if (!(focusedElement instanceof HTMLElement)) return null;
    for (const [key, element] of itemRefs.current) {
      if (element.contains(focusedElement)) return key;
    }
    return null;
  }

  const turnPage = (nextPage: number) => {
    pendingPagerFocusRef.current = nextPage > pageIndex ? "next" : "previous";
    pendingShelfMotionRef.current = null;
    shelfAnimationsRef.current.forEach((animation) => animation.cancel());
    shelfAnimationsRef.current = [];
    setActiveKey(null);
    setPageIndex(nextPage);
  };

  return <section className="opc-ranger-wall">
    <header className="opc-ranger-wall__intro">
      <h2>有些问题，不必一个人扛。</h2>
      <p>认识能与你并肩解决问题的独立顾问。找到合适的人，直接开始对话。</p>
      <small>游骑兵是外部独立顾问，合作由你们直接约定。</small>
    </header>
    <div className={`opc-ranger-shelf-stage${canPageBackward && canPageForward ? " has-bidirectional-pagers" : ""}`}>
      <div
        className={activeKey ? "opc-ranger-shelf has-active" : "opc-ranger-shelf"}
        role="list"
        aria-label={`游骑兵姓名书架，第 ${pageIndex + 1} 页，共 ${pageCount} 页`}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") changeActiveKey(focusedShelfKey());
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) changeActiveKey(null);
        }}
      >
        {visibleEntries.map((entry, index) => {
          const entryIndex = pageStart + index;
          const active = entry.key === activeKey;
          const profile = entry.profile;
          const publicName = profile?.publicName ?? "待公开";
          const panelId = `opc-ranger-shelf-panel-${entryIndex}`;
          return <article
            className={`opc-ranger-shelf__item${active ? " is-active" : ""}${profile ? "" : " is-template"}`}
            role="listitem"
            key={entry.key}
            ref={(element) => {
              if (element) itemRefs.current.set(entry.key, element);
              else itemRefs.current.delete(entry.key);
            }}
          >
            <button
              className="opc-ranger-shelf__spine"
              type="button"
              aria-expanded={active}
              aria-controls={panelId}
              aria-label={`查看${publicName}`}
              onClick={() => changeActiveKey(entry.key)}
              onFocus={() => changeActiveKey(entry.key)}
              onPointerEnter={() => changeActiveKey(focusedShelfKey() ?? entry.key)}
            >
              <strong>{publicName}</strong>
            </button>
            <div
              className="opc-ranger-shelf__panel"
              id={panelId}
              aria-hidden={!active}
            >
              {profile ? (
                <Link
                  className="opc-ranger-shelf__profile-link"
                  href={`/opc/rangers/${profile.slug}`}
                  tabIndex={active ? 0 : -1}
                  aria-label={`查看${profile.publicName}的顾问详情`}
                >
                  <figure className={`opc-ranger-shelf__portrait opc-ranger-portrait--${entryIndex % Math.max(1, identities.length)}`}>
                    <RangerPortraitImage profile={profile} mediaOrigin={mediaOrigin} />
                    <figcaption>
                      <span>{entry.identity.name}</span>
                      <strong>{publicName}</strong>
                      {profile.signature ? <p>{profile.signature}</p> : null}
                    </figcaption>
                  </figure>
                </Link>
              ) : (
                <figure className={`opc-ranger-shelf__portrait opc-ranger-portrait--${entryIndex % Math.max(1, identities.length)}`}>
                  <span className="opc-ranger-portrait__image" aria-hidden="true" />
                  <figcaption>
                    <span>{entry.identity.name}</span>
                    <strong>{publicName}</strong>
                  </figcaption>
                </figure>
              )}
            </div>
          </article>;
        })}
        {Array.from({ length: fillerCount }, (_, index) => (
          <span className="opc-ranger-shelf__filler" aria-hidden="true" key={`filler-${index}`} />
        ))}
      </div>
      {canPageBackward ? <button
        ref={previousPagerRef}
        className="opc-ranger-shelf__pager opc-ranger-shelf__pager--previous"
        type="button"
        aria-label="查看上一页顾问"
        onClick={() => turnPage(pageIndex - 1)}
      ><span aria-hidden="true" /></button> : null}
      {canPageForward ? <button
        ref={nextPagerRef}
        className="opc-ranger-shelf__pager opc-ranger-shelf__pager--next"
        type="button"
        aria-label="查看更多顾问"
        onClick={() => turnPage(pageIndex + 1)}
      ><span aria-hidden="true" /></button> : null}
    </div>
  </section>;
}

function RangerPortraitImage({ profile, mediaOrigin }: { profile: RangerProfile; mediaOrigin: string }) {
  const source = profile.avatar
    ? rangerAvatarPublicUrl(profile.avatar, "large", mediaOrigin)
    : legacyRangerAvatarPublicUrl(profile.avatarUrl);
  return source
    ? <Image className="opc-ranger-portrait__image opc-ranger-portrait__image--custom" src={source} width={800} height={800} loading="lazy" decoding="async" unoptimized alt="" />
    : <span className="opc-ranger-portrait__image" aria-hidden="true" />;
}
