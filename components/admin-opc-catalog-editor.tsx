"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  infrastructureGroups,
  rangerIdentities,
  specialtyDomains,
  type OpcCatalogContent,
  type OpcService,
  type RangerProfile,
} from "@/lib/opc-catalog";

type CatalogSection = keyof OpcCatalogContent;

type ManagedCatalogView = {
  revision: number;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
  draft: OpcCatalogContent;
  validation: { valid: boolean; errors: string[] };
};

type CatalogResponse = {
  error?: string;
  code?: string;
  reauthenticationUrl?: string;
  details?: string[];
  catalog?: ManagedCatalogView;
};

type AdminLoginMode = "identity-gateway" | "local-password";

const adminMutationHeaders = {
  "Content-Type": "application/json",
  "X-Vault2077-Admin-Request": "1",
};

class AdminCatalogError extends Error {
  readonly code?: string;
  readonly reauthenticationUrl?: string;

  constructor(message: string, code?: string, reauthenticationUrl?: string) {
    super(message);
    this.name = "AdminCatalogError";
    this.code = code;
    this.reauthenticationUrl = reauthenticationUrl;
  }
}

const sectionLabels: Record<CatalogSection, string> = {
  infrastructure: "基础设施",
  specialties: "专项服务",
  rangers: "游骑兵协会",
};

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null) as CatalogResponse | null;
  if (!response.ok) {
    const details = Array.isArray(body?.details) ? `\n${body.details.slice(0, 8).join("\n")}` : "";
    throw new AdminCatalogError(
      `${body?.error ?? "请求暂时无法完成。"}${details}`,
      body?.code,
      body?.reauthenticationUrl,
    );
  }
  if (!body?.catalog) throw new Error("后台返回的 OPC 服务目录无效。");
  return body.catalog;
}

function nextOrdinal(catalog: OpcCatalogContent, section: CatalogSection) {
  return catalog[section].length + 1;
}

function newService(section: "infrastructure" | "specialties", ordinal: number): OpcService {
  const infrastructure = section === "infrastructure";
  return {
    kind: infrastructure ? "infrastructure" : "specialty",
    slug: `new-${infrastructure ? "infrastructure" : "specialty"}-${ordinal}`,
    code: infrastructure ? `I-${String(ordinal).padStart(2, "0")}` : `S-00-${String(ordinal).padStart(2, "0")}`,
    name: "未命名服务",
    domain: infrastructure ? "基础设施" : specialtyDomains[0],
    group: infrastructure ? infrastructureGroups[0] : specialtyDomains[0],
    outcome: "",
    audience: "",
    includes: [],
    deliverables: [],
    materials: [],
    acceptance: [],
    boundary: "",
    price: "",
    feeNote: "",
    period: "",
    revision: "DRAFT.01",
    status: "草稿",
  };
}

function newRanger(ordinal: number): RangerProfile {
  return {
    slug: `new-ranger-${ordinal}`,
    publicName: "未命名游骑兵",
    identity: rangerIdentities[0],
    intro: "",
    tags: [],
    credential: "",
    contactLabel: "",
    contactState: "草稿",
    verificationDate: "",
    profileUpdatedAt: "",
    authorizationStatus: "本人授权待确认",
  };
}

export function AdminOpcCatalogEditor() {
  const [state, setState] = useState<ManagedCatalogView | null>(null);
  const [draft, setDraft] = useState<OpcCatalogContent | null>(null);
  const [section, setSection] = useState<CatalogSection>("infrastructure");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessMode, setAccessMode] = useState<AdminLoginMode>("local-password");
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [reauthenticationUrl, setReauthenticationUrl] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");

  const load = useCallback(async () => {
    const [response, accessResponse] = await Promise.all([
      fetch("/api/admin/opc", { cache: "no-store" }),
      fetch("/api/admin/login", { cache: "no-store" }),
    ]);
    const access = await accessResponse.json().catch(() => null) as { mode?: AdminLoginMode } | null;
    if (access?.mode === "identity-gateway" || access?.mode === "local-password") setAccessMode(access.mode);
    const catalog = await responseBody(response);
    setState(catalog);
    setDraft(structuredClone(catalog.draft));
    setSelectedIndex(0);
    setDirty(false);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void load().catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取 OPC 服务目录。"));
    });
    return () => { active = false; };
  }, [load]);

  const items = draft?.[section] ?? [];
  const selected = items[selectedIndex];
  const counts = useMemo(() => draft ? {
    infrastructure: draft.infrastructure.length,
    specialties: draft.specialties.length,
    rangers: draft.rangers.length,
  } : null, [draft]);

  function replaceItems(nextItems: OpcCatalogContent[CatalogSection]) {
    if (!draft) return;
    setDraft({ ...draft, [section]: nextItems } as OpcCatalogContent);
    setDirty(true);
  }

  function selectSection(next: CatalogSection) {
    setSection(next);
    setSelectedIndex(0);
  }

  function addItem() {
    if (!draft) return;
    const ordinal = nextOrdinal(draft, section);
    const item = section === "rangers" ? newRanger(ordinal) : newService(section, ordinal);
    const next = [...items, item] as OpcCatalogContent[CatalogSection];
    replaceItems(next);
    setSelectedIndex(next.length - 1);
  }

  function removeItem() {
    if (!selected || !window.confirm(`从当前草稿中移除“${"name" in selected ? selected.name : selected.publicName}”？只有发布后才会影响前台。`)) return;
    const next = items.filter((_, index) => index !== selectedIndex) as OpcCatalogContent[CatalogSection];
    replaceItems(next);
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  }

  function moveItem(direction: -1 | 1) {
    const target = selectedIndex + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items] as Array<OpcService | RangerProfile>;
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    replaceItems(next as OpcCatalogContent[CatalogSection]);
    setSelectedIndex(target);
  }

  function updateSelected(next: OpcService | RangerProfile) {
    const nextItems = items.map((item, index) => index === selectedIndex ? next : item) as OpcCatalogContent[CatalogSection];
    replaceItems(nextItems);
  }

  async function submit(action: "save-draft" | "publish") {
    if (!draft || !state) return;
    const wording = action === "publish"
      ? "发布会立即替换 OPC 前台的服务目录。确认当前目录内容可以公开并发布？"
      : "确认保存当前 OPC 服务目录草稿？该操作会写入不可变审计日志。";
    if (!window.confirm(wording)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/opc", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({
          action,
          expectedRevision: state.revision,
          catalog: draft,
          confirm: true,
        }),
      });
      const catalog = await responseBody(response);
      setState(catalog);
      setDraft(structuredClone(catalog.draft));
      setDirty(false);
      setNotice(action === "publish" ? "OPC 服务目录已发布并写入审计记录。" : "OPC 服务目录草稿已保存。");
    } catch (cause) {
      if (cause instanceof AdminCatalogError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法更新 OPC 服务目录。");
    } finally {
      setPending(false);
    }
  }

  async function reauthenticate() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/reauthenticate", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify(accessMode === "local-password" ? { password: reauthenticationPassword } : {}),
      });
      const body = await response.json().catch(() => null) as {
        error?: string;
        reauthenticationUrl?: string;
      } | null;
      if (!response.ok) {
        setReauthenticationUrl(body?.reauthenticationUrl ?? reauthenticationUrl);
        throw new Error(body?.error ?? "身份重新验证失败。");
      }
      setReauthenticationRequired(false);
      setReauthenticationPassword("");
      setNotice("发布权限已重新验证，有效期五分钟。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "身份重新验证失败。");
    } finally {
      setPending(false);
    }
  }

  if (!state || !draft || !counts) {
    return <section className="admin-opc-editor"><p className="ranking-empty">{error || "正在读取 OPC 服务目录…"}</p></section>;
  }

  return (
    <section className="admin-opc-editor" id="admin-opc" aria-labelledby="admin-opc-title">
      <header className="admin-opc-editor__header">
        <div>
          <p className="eyebrow mono">OPC / MANAGED SERVICE CATALOG</p>
          <h2 id="admin-opc-title">服务目录</h2>
          <p>这里只维护面向用户的人工服务。资讯、来源、平台榜单和 Frontier 排名不会进入此编辑器。</p>
        </div>
        <div className="admin-opc-editor__status mono">
          <span>REVISION <strong>{state.revision}</strong></span>
          <span>DRAFT <strong>{state.draftUpdatedAt ? new Date(state.draftUpdatedAt).toLocaleString("zh-CN", { hour12: false }) : "INITIAL"}</strong></span>
          <span>PUBLISHED <strong>{state.publishedAt ? new Date(state.publishedAt).toLocaleString("zh-CN", { hour12: false }) : "INITIAL PREVIEW"}</strong></span>
        </div>
      </header>

      {error ? <pre className="form-error admin-opc-editor__error" role="alert">{error}</pre> : null}
      {notice ? <p className="admin-notice" role="status">{notice}</p> : null}
      {!state.validation.valid ? (
        <details className="admin-opc-editor__validation">
          <summary>当前草稿尚有 {state.validation.errors.length} 项发布前检查未通过</summary>
          <ul>{state.validation.errors.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}

      <nav className="admin-opc-editor__sections" aria-label="OPC 目录分区">
        {(Object.keys(sectionLabels) as CatalogSection[]).map((key) => (
          <button className={section === key ? "is-active" : ""} type="button" onClick={() => selectSection(key)} key={key}>
            <strong>{sectionLabels[key]}</strong><span className="mono">{counts[key]}</span>
          </button>
        ))}
      </nav>

      <div className="admin-opc-editor__workspace">
        <aside className="admin-opc-editor__records">
          <div className="admin-opc-editor__records-actions">
            <button className="text-action" type="button" onClick={addItem}>新增项目</button>
          </div>
          {items.length === 0 ? <p className="ranking-empty">当前草稿没有项目。</p> : items.map((item, index) => (
            <button className={selectedIndex === index ? "is-active" : ""} type="button" onClick={() => setSelectedIndex(index)} key={`${"slug" in item ? item.slug : index}-${index}`}>
              <span className="mono">{"code" in item ? item.code : item.identity}</span>
              <strong>{"name" in item ? item.name : item.publicName}</strong>
            </button>
          ))}
        </aside>

        <div className="admin-opc-editor__form">
          {selected ? (
            <>
              <div className="admin-opc-editor__item-actions">
                <button type="button" onClick={() => moveItem(-1)} disabled={selectedIndex === 0}>上移</button>
                <button type="button" onClick={() => moveItem(1)} disabled={selectedIndex === items.length - 1}>下移</button>
                <button className="is-danger" type="button" onClick={removeItem}>从草稿移除</button>
              </div>
              {"kind" in selected
                ? <ServiceFields service={selected} onChange={updateSelected} />
                : <RangerFields ranger={selected} onChange={updateSelected} />}
            </>
          ) : <p className="ranking-empty">新增一个项目，或从左侧选择现有项目。</p>}
        </div>
      </div>

      <footer className="admin-opc-editor__footer">
        <div>
          <p className="form-note">{dirty ? "有尚未保存的修改。" : "当前编辑内容已与服务器草稿同步。"}</p>
          {reauthenticationRequired ? (
            <div className="admin-opc-editor__reauth">
              <strong>发布前需要重新验证身份</strong>
              {accessMode === "identity-gateway" ? (
                <>
                  <p>先通过身份网关完成 Passkey/MFA，再返回这里刷新发布权限。</p>
                  {reauthenticationUrl ? <a className="text-link" href={reauthenticationUrl}>进入安全身份验证 ↗</a> : null}
                </>
              ) : (
                <div className="form-field">
                  <label htmlFor="admin-opc-reauth-password">本地开发密码</label>
                  <input id="admin-opc-reauth-password" type="password" autoComplete="current-password" value={reauthenticationPassword} onChange={(event) => setReauthenticationPassword(event.target.value)} />
                </div>
              )}
              <button className="text-action" type="button" disabled={pending || (accessMode === "local-password" && !reauthenticationPassword)} onClick={() => void reauthenticate()}>
                {accessMode === "identity-gateway" ? "身份已更新，刷新权限" : "验证发布权限"}
              </button>
            </div>
          ) : null}
        </div>
        <div className="admin-actions">
          <button className="text-link" type="button" disabled={pending || !dirty} onClick={() => void load()}>放弃本地修改</button>
          <button className="text-action" type="button" disabled={pending || !dirty} onClick={() => void submit("save-draft")}>{pending ? "正在处理" : "保存草稿"}</button>
          <button className="text-action" type="button" disabled={pending} onClick={() => void submit("publish")}>{pending ? "正在处理" : "校验并发布"}</button>
        </div>
      </footer>
    </section>
  );
}

function TextField({ label, value, onChange, multiline = false, help }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  help?: string;
}) {
  const id = useId();
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    {multiline
      ? <textarea id={id} rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
    {help ? <p>{help}</p> : null}
  </div>;
}

function ListField({ label, value, onChange }: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return <TextField
    label={label}
    value={value.join("\n")}
    multiline
    help="每行一项；空行会在保存时自动忽略。"
    onChange={(next) => onChange(next.split("\n"))}
  />;
}

function ServiceFields({ service, onChange }: { service: OpcService; onChange: (value: OpcService) => void }) {
  const change = <K extends keyof OpcService>(key: K, value: OpcService[K]) => onChange({ ...service, [key]: value });
  return <div className="admin-opc-editor__fields">
    <TextField label="稳定路径 slug" value={service.slug} onChange={(value) => change("slug", value)} help="发布后不建议修改，只能使用小写字母、数字和连字符。" />
    <TextField label="服务编号" value={service.code} onChange={(value) => change("code", value)} />
    <TextField label="服务名称" value={service.name} onChange={(value) => change("name", value)} />
    {service.kind === "infrastructure" ? (
      <div className="form-field"><label>浏览分组<select value={service.group} onChange={(event) => change("group", event.target.value)}>{infrastructureGroups.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    ) : (
      <div className="form-field"><label>专项领域<select value={service.domain} onChange={(event) => onChange({ ...service, domain: event.target.value, group: event.target.value })}><option value="" disabled>请选择</option>{specialtyDomains.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    )}
    <TextField label="一句话结果" value={service.outcome} multiline onChange={(value) => change("outcome", value)} />
    <TextField label="适用对象" value={service.audience} multiline onChange={(value) => change("audience", value)} />
    <ListField label="包含内容" value={service.includes} onChange={(value) => change("includes", value)} />
    <ListField label="交付成果" value={service.deliverables} onChange={(value) => change("deliverables", value)} />
    <ListField label="所需材料" value={service.materials} onChange={(value) => change("materials", value)} />
    <ListField label="验收标准" value={service.acceptance ?? []} onChange={(value) => change("acceptance", value)} />
    <TextField label="超出范围与转交边界" value={service.boundary} multiline onChange={(value) => change("boundary", value)} />
    <TextField label="公开价格或计价单位" value={service.price} onChange={(value) => change("price", value)} />
    <TextField label="费用说明" value={service.feeNote ?? ""} multiline onChange={(value) => change("feeNote", value)} />
    <TextField label="标准周期" value={service.period} onChange={(value) => change("period", value)} />
    <TextField label="修订编号" value={service.revision} onChange={(value) => change("revision", value)} />
    <TextField label="公开状态" value={service.status} onChange={(value) => change("status", value)} />
  </div>;
}

function RangerFields({ ranger, onChange }: { ranger: RangerProfile; onChange: (value: RangerProfile) => void }) {
  const change = <K extends keyof RangerProfile>(key: K, value: RangerProfile[K]) => onChange({ ...ranger, [key]: value });
  return <div className="admin-opc-editor__fields">
    <TextField label="稳定路径 slug" value={ranger.slug} onChange={(value) => change("slug", value)} help="发布后不建议修改，只能使用小写字母、数字和连字符。" />
    <TextField label="公开名称" value={ranger.publicName} onChange={(value) => change("publicName", value)} />
    <div className="form-field"><label>主要顾问身份<select value={ranger.identity} onChange={(event) => change("identity", event.target.value)}>{rangerIdentities.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <TextField label="一句话介绍" value={ranger.intro} multiline onChange={(value) => change("intro", value)} />
    <ListField label="专长标签" value={ranger.tags} onChange={(value) => change("tags", value)} />
    <TextField label="公开资质或职业记录" value={ranger.credential ?? ""} multiline onChange={(value) => change("credential", value)} />
    <TextField label="本人授权的公开联系方式" value={ranger.contactLabel} multiline onChange={(value) => change("contactLabel", value)} />
    <TextField label="核验 / 联系状态" value={ranger.contactState} onChange={(value) => change("contactState", value)} />
    <TextField label="核验日期" value={ranger.verificationDate ?? ""} onChange={(value) => change("verificationDate", value)} />
    <TextField label="资料更新时间" value={ranger.profileUpdatedAt ?? ""} onChange={(value) => change("profileUpdatedAt", value)} />
    <TextField label="本人授权状态" value={ranger.authorizationStatus ?? ""} onChange={(value) => change("authorizationStatus", value)} />
  </div>;
}
