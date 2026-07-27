"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
  infrastructure: { code: "01", title: "基础设施", note: "完整经营能力" },
  specialties: { code: "02", title: "专项服务", note: "单一专业结果" },
  rangers: { code: "03", title: "游骑兵协会", note: "外部独立专家" },
};

export function OpcWorkspace({
  infrastructure,
  specialties,
  rangers,
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
      note: items.flatMap((profile) => profile.tags).slice(0, 2).join(" / "),
      items,
    };
  }), [rangers]);

  const initialServices = initialView === "specialties" ? specialties : infrastructure;
  const initialService = initialView === "rangers"
    ? null
    : initialServices.find((service) => service.slug === initialServiceSlug) ?? initialServices[0] ?? null;
  const initialGroups = initialView === "specialties" ? specialtyGroups : groupedInfrastructure;
  const initialOpenGroup = initialService
    ? initialGroups.find((group) => group.items.some((service) => service.slug === initialService.slug))?.id
    : initialGroups[0]?.id;

  const [view, setView] = useState<WorkspaceView>(initialView);
  const [openGroup, setOpenGroup] = useState(initialView === "rangers" ? rangerGroups[0]?.id ?? "" : initialOpenGroup ?? "");
  const [selectedService, setSelectedService] = useState<OpcService | null>(initialService);
  const serviceGroups = view === "infrastructure" ? groupedInfrastructure : specialtyGroups;

  function replaceWorkspaceLocation(nextView: WorkspaceView, service?: OpcService | null) {
    const parameters = new URLSearchParams({ view: nextView });
    if (service) parameters.set("service", service.slug);
    router.replace(`/opc?${parameters.toString()}`, { scroll: false });
  }

  function changeView(nextView: WorkspaceView) {
    setView(nextView);
    if (nextView === "infrastructure") {
      setOpenGroup(groupedInfrastructure[0]?.id ?? "");
      const service = infrastructure[0] ?? null;
      setSelectedService(service);
      replaceWorkspaceLocation(nextView, service);
    }
    if (nextView === "specialties") {
      setOpenGroup(specialtyGroups[0]?.id ?? "");
      const service = specialties[0] ?? null;
      setSelectedService(service);
      replaceWorkspaceLocation(nextView, service);
    }
    if (nextView === "rangers") {
      setOpenGroup(rangerGroups[0]?.id ?? "");
      setSelectedService(null);
      replaceWorkspaceLocation(nextView);
    }
  }

  function selectService(service: OpcService) {
    setSelectedService(service);
    replaceWorkspaceLocation(view, service);
  }

  return (
    <section className="opc-service-browser" aria-label="OPC 服务目录">
      <aside className="opc-service-browser__primary">
        <p className="mono">OPC / INDEX</p>
        <nav aria-label="OPC 一级入口">
          {(Object.keys(viewCopy) as WorkspaceView[]).map((item) => (
            <button className={view === item ? "is-active" : ""} type="button" onClick={() => changeView(item)} key={item}>
              <span className="mono">{viewCopy[item].code}</span>
              <strong>{viewCopy[item].title}</strong>
              <small>{viewCopy[item].note}</small>
            </button>
          ))}
        </nav>
        <div className="opc-service-browser__boundary">
          <p className="mono">{view === "rangers" ? "EXTERNAL / DIRECT CONTACT" : "VAULT2077 / DIRECT DELIVERY"}</p>
          <span>{view === "rangers" ? "用户与专家自行建立联系" : "先确认范围，再开始服务"}</span>
        </div>
      </aside>

      <aside className="opc-service-browser__secondary">
        <header>
          <p className="mono">{viewCopy[view].code} / DIRECTORY</p>
          <h2>{viewCopy[view].title}</h2>
        </header>
        {view === "rangers" ? (
          <RangerNavigation groups={rangerGroups} openGroup={openGroup} onToggle={setOpenGroup} />
        ) : (
          <ServiceNavigation groups={serviceGroups} openGroup={openGroup} selected={selectedService} onToggle={setOpenGroup} onSelect={selectService} />
        )}
      </aside>

      <section
        className="opc-service-browser__content"
        aria-live="polite"
        aria-label={`${viewCopy[view].title}详情`}
      >
        {view === "rangers"
          ? <RangerWall profiles={rangers} />
          : selectedService
            ? <ServiceReadingPane service={selectedService} />
            : <ServiceEmptyPane title={viewCopy[view].title} />}
      </section>
    </section>
  );
}

function ServiceNavigation({ groups, openGroup, selected, onToggle, onSelect }: {
  groups: ServiceGroup[];
  openGroup: string;
  selected: OpcService | null;
  onToggle: (id: string) => void;
  onSelect: (service: OpcService) => void;
}) {
  return <div className="opc-accordion">{groups.map((group) => {
    const open = openGroup === group.id;
    return <section className={open ? "opc-accordion__group is-open" : "opc-accordion__group"} key={group.id}>
      <button className="opc-accordion__trigger" type="button" aria-expanded={open} onClick={() => onToggle(open ? "" : group.id)}>
        <span><strong>{group.label}</strong><small>{group.note}</small></span>
        <i className="mono">{String(group.items.length).padStart(2, "0")} {open ? "−" : "+"}</i>
      </button>
      <div className="opc-accordion__drawer" aria-hidden={!open}><div>
        {group.items.map((service) => <button className={selected?.code === service.code ? "opc-accordion__item is-selected" : "opc-accordion__item"} type="button" onClick={() => onSelect(service)} key={service.code}>
          <span className="mono">{service.code.split("/").at(-1)}</span><strong>{service.name}</strong><i aria-hidden="true">→</i>
        </button>)}
      </div></div>
    </section>;
  })}</div>;
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
    <p className="mono">SELECT A SERVICE / 选择具体项目</p>
    <div>
      <span aria-hidden="true">↘</span>
      <h2>从中栏展开「{title}」分类，<br />选择一个具体项目。</h2>
      <p>项目范围、适用对象、所需材料、交付成果与转交边界将在这里完整展开。</p>
    </div>
  </section>;
}

function ServiceReadingPane({ service }: { service: OpcService }) {
  return <article className="opc-reading-pane">
    <header>
      <div className="opc-reading-pane__meta mono"><span>{service.code}</span><span>{service.domain}</span><span>{service.status} / {service.revision}</span></div>
      <h2>{service.name}</h2>
      <p>{service.outcome}</p>
      <div className="opc-reading-pane__facts"><span><b className="mono">价格</b>{service.price}</span><span><b className="mono">周期</b>{service.period}</span></div>
    </header>
    <div className="opc-reading-pane__body">
      <section><p className="mono">WHO IT IS FOR / 适合谁</p><h3>适用对象</h3><p>{service.audience}</p></section>
      <section><p className="mono">WHAT IS INCLUDED / 包含内容</p><h3>{service.kind === "infrastructure" ? "建立这套能力" : "完成这个结果"}</h3><ol>{service.includes.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <section><p className="mono">MATERIALS / 开始条件</p><h3>需要准备</h3><ol>{service.materials.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <section><p className="mono">DELIVERABLES / 交付成果</p><h3>最终获得</h3><ol>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ol></section>
      {service.deliveryRoles?.length ? <section><p className="mono">DELIVERY TEAM / 交付协作</p><h3>由谁完成</h3><ol>{service.deliveryRoles.map((item) => <li key={item}>{item}</li>)}</ol></section> : null}
      {service.acceptance?.length ? <section><p className="mono">ACCEPTANCE / 验收标准</p><h3>怎样算完成</h3><ol>{service.acceptance.map((item) => <li key={item}>{item}</li>)}</ol></section> : null}
      {service.feeNote ? <section><p className="mono">FEE NOTE / 费用说明</p><h3>价格口径</h3><p>{service.feeNote}</p></section> : null}
      <section><p className="mono">REVIEW / 专业复核</p><h3>复核与生效</h3><p>{service.reviewNote}</p><p className="mono muted">{service.effectiveAt}</p></section>
      <section className="opc-reading-pane__boundary">
        <div className="opc-reading-pane__boundary-title">
          <p className="mono">OUT OF SCOPE / 转交边界</p>
          <h3>超出标准范围时</h3>
        </div>
        <div className="opc-reading-pane__boundary-copy">
          <p>{service.boundary}</p>
          <Link href="/opc?view=rangers">转至游骑兵协会 <span aria-hidden="true">↗</span></Link>
        </div>
        <span className="opc-reading-pane__boundary-mark" aria-hidden="true">↗</span>
      </section>
    </div>
  </article>;
}

function RangerWall({ profiles }: { profiles: RangerProfile[] }) {
  return <section className="opc-ranger-wall">
    <header>
      <p className="mono">RANGER ASSOCIATION / PORTRAIT WALL</p>
      <h2>找到具体的人。</h2>
      <p>按身份浏览外部独立专家。公开档案只展示顾问本人已授权的资料与联系信息。</p>
    </header>
    <div className="opc-ranger-wall__portraits">
      {profiles.map((profile, index) => <Link className={`opc-ranger-portrait opc-ranger-portrait--${index}`} href={`/opc/rangers/${profile.slug}`} aria-label={`查看 ${profile.publicName} 的专家档案`} key={profile.slug}>
        <span className="opc-ranger-portrait__image" aria-hidden="true" />
        <span className="opc-ranger-portrait__copy"><strong>{profile.publicName}</strong><small>{profile.identity}</small></span>
      </Link>)}
    </div>
  </section>;
}
