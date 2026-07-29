"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { OpcOrderEntry } from "@/components/opc-order-entry";
import {
  infrastructureGroups,
  rangerIdentities,
  specialtyDomains,
  type OpcService,
  type RangerProfile,
} from "@/lib/opc-catalog";

type WorkspaceView = "infrastructure" | "specialties" | "rangers";

type OpcWorkspaceProps = {
  infrastructure: OpcService[];
  specialties: OpcService[];
  rangers: RangerProfile[];
  initialView?: WorkspaceView;
  initialServiceSlug?: string;
  orderingAvailable?: boolean;
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
  initialView = "infrastructure",
  initialServiceSlug,
  orderingAvailable = false,
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
      note: items.flatMap((profile) => profile.tags).slice(0, 2).join(" / "),
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

  return (
    <section className="opc-service-browser" aria-label="OPC 服务目录">
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
            rangers.length > 0
              ? <RangerNavigation groups={rangerGroups} openGroup={openGroup} onToggle={setOpenGroup} />
              : <p className="opc-service-browser__directory-empty">真实授权档案录入后开放；不会展示样例身份或未经核验的联系方式。</p>
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
          ? <RangerWall profiles={rangers} />
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
  );
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
    return <section className={open ? "opc-accordion__group is-open" : "opc-accordion__group"} key={group.id}>
      <button className="opc-accordion__trigger" type="button" aria-expanded={open} onClick={() => onToggle(open ? "" : group.id)}>
        <span><strong>{group.label}</strong><small>{group.note}</small></span>
        <i className="mono">{String(group.items.length).padStart(2, "0")} {open ? "−" : "+"}</i>
      </button>
      <div className="opc-accordion__drawer" aria-hidden={!open}><div>
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
              {selectedItem ? <small>{service.outcome}</small> : null}
            </span>
            <i aria-hidden="true">→</i>
          </button>;
        })}
      </div></div>
    </section>;
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
    return <section className={open ? "opc-accordion__group is-open" : "opc-accordion__group"} key={group.id}>
      <button className="opc-accordion__trigger" type="button" aria-expanded={open} onClick={() => onToggle(open ? "" : group.id)}>
        <span><strong>{group.label}</strong><small>{group.note}</small></span>
        <i className="mono">{String(group.items.length).padStart(2, "0")} {open ? "−" : "+"}</i>
      </button>
      <div className="opc-accordion__drawer" aria-hidden={!open}><div>
        {group.items.map((profile) => <Link className="opc-accordion__item" href={`/opc/rangers/${profile.slug}`} key={profile.slug}>
          <span className="mono">PROFILE</span><strong>{profile.publicName}</strong><i aria-hidden="true">→</i>
        </Link>)}
      </div></div>
    </section>;
  })}</div>;
}

function ServiceEmptyPane({ title }: { title: string }) {
  return <section className="opc-reading-empty">
    <p className="mono">SERVICE BRIEF / 服务说明</p>
    <div>
      <span aria-hidden="true">↘</span>
      <h2>选择一项服务，<br />再查看正式说明。</h2>
      <p>请从中栏浏览「{title}」下的具体项目。系统不会替你默认选择；范围、价格、材料和交付边界将在选择后完整展开。</p>
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
        <span><b>目录版本</b>{service.revision}</span>
      </div>
      <h2 ref={headingRef} tabIndex={-1}>{service.name}</h2>
      <p>{service.outcome}</p>
    </header>
    <div className="opc-reading-pane__fact-register" aria-label="当前服务关键事实">
      <div className="opc-reading-pane__facts">
        <span><b className="mono">价格</b><strong>{service.price}</strong></span>
        <span><b className="mono">周期</b><strong>{service.period}</strong></span>
      </div>
      <p className="opc-reading-pane__fact-note">责任主体：Vault2077 直接交付。公开价格对应当前服务修订；第三方费用按费用说明另计。订单提交后跳转支付宝官方收银台，到账状态通过支付宝服务器通知自动核验。</p>
    </div>
    <OpcOrderEntry key={service.slug} service={service} enabled={orderingAvailable} />
    <div className="opc-reading-pane__body">
      <section><p className="mono">WHO IT IS FOR / 适用对象</p><h3>适用对象</h3><p>{service.audience}</p></section>
      <section><p className="mono">SERVICE SCOPE / 服务范围</p><h3>标准服务包含</h3><ol>{service.includes.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <section><p className="mono">REQUIRED MATERIALS / 所需材料</p><h3>用户需提交的材料</h3><ol>{service.materials.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <section><p className="mono">DELIVERABLES / 交付成果</p><h3>Vault2077 交付成果</h3><ol>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ol></section>
      {service.acceptance?.length ? <section><p className="mono">ACCEPTANCE / 验收标准</p><h3>服务验收标准</h3><ol>{service.acceptance.map((item) => <li key={item}>{item}</li>)}</ol></section> : null}
      {service.feeNote ? <section><p className="mono">FEE NOTE / 费用说明</p><h3>公开价格包含与不包含</h3><p>{service.feeNote}</p></section> : null}
      <section className="opc-reading-pane__boundary">
        <div className="opc-reading-pane__boundary-title">
          <p className="mono">OUT OF SCOPE / 转交边界</p>
          <h3>不包含与转交范围</h3>
        </div>
        <div className="opc-reading-pane__boundary-copy">
          <p>{service.boundary}</p>
          <Link href="/opc?view=rangers">转至游骑兵协会 <span aria-hidden="true">↗</span></Link>
        </div>
        <span className="opc-reading-pane__boundary-mark" aria-hidden="true">↗</span>
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

function RangerWall({ profiles }: { profiles: RangerProfile[] }) {
  return <section className="opc-ranger-wall">
    <header>
      <p className="mono">RANGER ASSOCIATION / PORTRAIT WALL</p>
      <h2>{profiles.length > 0 ? "找到具体的人。" : "宁缺毋滥，等待真实档案。"}</h2>
      <p>{profiles.length > 0
        ? "按身份浏览外部独立专家。公开档案只展示顾问本人已授权的资料与联系信息。"
        : "当前没有完成本人授权、职业资料核验和公开联系方式确认的顾问。真实档案通过后台发布后会在这里出现；Vault2077 不使用虚构姓名或样例联系方式填充名录。"}</p>
    </header>
    <div className="opc-ranger-wall__portraits">
      {profiles.map((profile, index) => <Link className={`opc-ranger-portrait opc-ranger-portrait--${index}`} href={`/opc/rangers/${profile.slug}`} aria-label={`查看 ${profile.publicName} 的专家档案`} key={profile.slug}>
        <span className="opc-ranger-portrait__image" aria-hidden="true" />
        <span className="opc-ranger-portrait__copy"><strong>{profile.publicName}</strong><small>{profile.identity}</small></span>
      </Link>)}
    </div>
  </section>;
}
