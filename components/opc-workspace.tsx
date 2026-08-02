"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { OpcFeeNotePopover } from "@/components/opc-fee-note-popover";
import {
  infrastructureGroups,
  rangerIdentities,
  specialtyDomains,
  type OpcService,
  type RangerProfile,
} from "@/lib/opc-catalog";
import { legacyRangerAvatarPublicUrl, rangerAvatarPublicUrl } from "@/lib/ranger-avatar";

type WorkspaceView = "infrastructure" | "specialties" | "rangers";

type OpcWorkspaceProps = {
  infrastructure: OpcService[];
  specialties: OpcService[];
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

function revealHeading(heading: HTMLHeadingElement | null) {
  if (!heading) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export function OpcWorkspace({
  infrastructure,
  specialties,
  rangers,
  orderingAvailable,
  rangerMediaOrigin,
  initialView = "infrastructure",
  initialServiceSlug,
}: OpcWorkspaceProps) {
  const router = useRouter();
  const groupedInfrastructure = useMemo<ServiceGroup[]>(() => infrastructureGroups.map((group) => {
    const items = infrastructure.filter((service) => service.group === group);
    return {
      id: group,
      label: group,
      note: `${items.length} 项完整经营能力`,
      items,
    };
  }), [infrastructure]);
  const specialtyGroups = useMemo<ServiceGroup[]>(() => specialtyDomains.map((domain) => ({
    id: domain,
    label: domain,
    note: `${specialties.filter((service) => service.domain === domain).length} 项固定范围服务`,
    items: specialties.filter((service) => service.domain === domain),
  })), [specialties]);
  const rangerGroups = useMemo<RangerGroup[]>(() => rangerIdentities.map((identity) => {
    const items = rangers.filter((profile) => profile.identity === identity);
    return {
      id: identity,
      label: identity,
      note: items.length > 0
        ? items.flatMap((profile) => profile.tags).slice(0, 2).join(" / ")
        : "档案待补充",
      items,
    };
  }), [rangers]);

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
        className="opc-service-browser__content"
        aria-label={`${viewCopy[view].title}详情`}
      >
        {view === "rangers"
          ? <RangerWall profiles={rangers} mediaOrigin={rangerMediaOrigin} />
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

function RangerWall({ profiles, mediaOrigin }: { profiles: RangerProfile[]; mediaOrigin: string }) {
  const representedIdentities = new Set(profiles.map((profile) => profile.identity));
  const templateIdentities = rangerIdentities.filter((identity) => !representedIdentities.has(identity));
  return <section className="opc-ranger-wall">
    <header>
      <p className="mono">RANGER ASSOCIATION / PORTRAIT WALL</p>
      <h2>{profiles.length > 0 ? "找到具体的人。" : "顾问档案模板。"}</h2>
      <p>{profiles.length > 0
        ? "按身份浏览外部独立专家。没有真实档案的身份继续保留模板位置，待本人授权资料发布后替换。"
        : "按十类顾问身份保留版式位置。模板不代表真实顾问，不包含姓名或联系方式；本人授权档案发布后将替换对应位置。"}</p>
    </header>
    <div className="opc-ranger-wall__portraits">
      {profiles.map((profile, index) => <Link className={`opc-ranger-portrait opc-ranger-portrait--${index}`} href={`/opc/rangers/${profile.slug}`} aria-label={`查看 ${profile.publicName} 的专家档案`} key={profile.slug}>
        <RangerPortraitImage profile={profile} mediaOrigin={mediaOrigin} />
        <span className="opc-ranger-portrait__copy"><strong>{profile.publicName}</strong><small>{profile.identity}</small></span>
      </Link>)}
      {templateIdentities.map((identity, index) => <article
        className={`opc-ranger-portrait opc-ranger-portrait--placeholder opc-ranger-portrait--${(profiles.length + index) % rangerIdentities.length}`}
        aria-label={`${identity}档案模板，等待本人授权资料`}
        key={identity}
      >
        <span className="opc-ranger-portrait__image" aria-hidden="true" />
        <span className="opc-ranger-portrait__copy"><strong>档案待补充</strong><small>{identity}</small></span>
      </article>)}
    </div>
  </section>;
}

function RangerPortraitImage({ profile, mediaOrigin }: { profile: RangerProfile; mediaOrigin: string }) {
  const source = profile.avatar
    ? rangerAvatarPublicUrl(profile.avatar, "small", mediaOrigin)
    : legacyRangerAvatarPublicUrl(profile.avatarUrl);
  return source
    ? <Image className="opc-ranger-portrait__image opc-ranger-portrait__image--custom" src={source} width={320} height={320} loading="lazy" decoding="async" unoptimized alt="" />
    : <span className="opc-ranger-portrait__image" aria-hidden="true" />;
}
