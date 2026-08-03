import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { ContentMarkup } from "@/components/content-markup";
import { getCachedPublishedServiceCatalog } from "@/lib/public-read-cache";
import { legacyRangerAvatarPublicUrl, rangerAvatarPublicUrl } from "@/lib/ranger-avatar";
import { publicRangerMediaOrigin } from "@/lib/ranger-avatar-storage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getCachedPublishedServiceCatalog();
  const profile = catalog.rangers.find((item) => item.slug === slug);
  return { title: profile ? `${profile.publicName}｜游骑兵协会` : "游骑兵协会" };
}

export default async function RangerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await getCachedPublishedServiceCatalog();
  const profile = catalog.rangers.find((item) => item.slug === slug);
  if (!profile) notFound();

  const portraitIndex = catalog.rangers.findIndex((item) => item.slug === profile.slug);
  const profileNumber = String(portraitIndex + 1).padStart(2, "0");
  const profileCount = String(catalog.rangers.length).padStart(2, "0");
  const verifiedAt = profile.verificationDate ?? "—";
  const updatedAt = profile.profileUpdatedAt ?? "—";
  const [contactLocalPart, contactDomainPart] = profile.contactLabel.split("@", 2);
  const avatarSource = profile.avatar
    ? rangerAvatarPublicUrl(profile.avatar, "large", publicRangerMediaOrigin())
    : legacyRangerAvatarPublicUrl(profile.avatarUrl);

  return (
    <>
      <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
      <article className="shell opc-ranger-dossier" aria-label={`${profile.publicName}的游骑兵公开档案`}>
        {/*
          THESIS: 把个人页变成一张可读、可核验、可直接行动的馆藏入册页，拒绝松散信息块。
          OWN-WORLD: 档案纸、碳黑脊柱、连续细线、衬线身份标题与无衬线记录字段。
          STORY: 先识别人，再理解专长与公开依据，最后直接联系专家本人。
          FIRST VIEWPORT: 编号脊柱、超大身份与姓名、右侧肖像同屏出现，主行动位于下方签发条。
          FORM: 归档台账式结构，自有候选第 3 项，surface seed 78fee9dc。
        */}
        <header className="opc-ranger-dossier__hero">
          <div className="opc-ranger-dossier__spine" aria-hidden="true">
            <span>V2077</span>
            <span>RANGER</span>
            <strong>RA / {profileNumber}</strong>
            <span>PUBLIC DOSSIER</span>
          </div>

          <div className="opc-ranger-dossier__title">
            <div className="opc-ranger-dossier__register mono">
              <span>RANGER ASSOCIATION / 公开档案</span>
              <span>{profileNumber} / {profileCount}</span>
            </div>
            <p className="opc-ranger-dossier__identity mono">IDENTITY / {profile.identity}</p>
            <h1>{profile.publicName}</h1>
            <p className="opc-ranger-dossier__intro">{profile.intro}</p>
          </div>

          <figure className={`opc-ranger-dossier__portrait opc-ranger-portrait--${portraitIndex}`}>
            <div className="opc-ranger-dossier__portrait-frame">
              {avatarSource
                ? <Image className="opc-ranger-portrait__image opc-ranger-portrait__image--custom" src={avatarSource} width={800} height={800} loading="eager" decoding="async" unoptimized alt={`${profile.publicName}的专家头像`} />
                : <span className="opc-ranger-portrait__image" role="img" aria-label={`${profile.publicName}的专家头像`} />}
            </div>
            <figcaption className="mono">
              <span>PORTRAIT / PUBLIC</span>
              <span>FILE / RA-{profileNumber}</span>
            </figcaption>
          </figure>
        </header>

        <div className="opc-ranger-dossier__ledger">
          <section className="opc-ranger-dossier__section">
            <header>
              <span className="mono">01</span>
              <h2 className="mono">EXPERTISE / 专业方向</h2>
            </header>
            <ul className="opc-ranger-dossier__expertise">
              {profile.tags.map((tag, index) => (
                <li key={tag}>
                  <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{tag}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="opc-ranger-dossier__section opc-ranger-dossier__record">
            <header>
              <span className="mono">02</span>
              <h2 className="mono">PUBLIC RECORD / 公开记录</h2>
            </header>
            <ContentMarkup
              content={profile.credential ?? "未提供公开职业记录。"}
              format="markdown"
              className="opc-ranger-dossier__credential"
            />
            <dl>
              <div><dt className="mono">VERIFIED / 核验</dt><dd>{verifiedAt}</dd></div>
              <div><dt className="mono">UPDATED / 更新</dt><dd>{updatedAt}</dd></div>
            </dl>
          </section>
        </div>

        <section className="opc-ranger-dossier__contact">
          <div className="opc-ranger-dossier__contact-label">
            <span className="mono">03</span>
            <p className="mono">DIRECT CONTACT / EMAIL</p>
          </div>
          <div className="opc-ranger-dossier__contact-action">
            <h2>直接联系专家本人</h2>
            <a href={`mailto:${profile.contactLabel}`}>
              <span>
                {contactDomainPart
                  ? <>{contactLocalPart}@<wbr />{contactDomainPart}</>
                  : profile.contactLabel}
              </span>
              <i aria-hidden="true">↗</i>
            </a>
          </div>
          <p className="opc-ranger-dossier__boundary">
            用户与专家自行建立联系。Vault2077 不参与后续咨询、定价、付款、交付或争议处理。
          </p>
        </section>

        <nav className="opc-ranger-dossier__navigation" aria-label="游骑兵档案导航">
          <Link href="/opc">← 返回 OPC 服务台</Link>
          <Link href="/opc?view=rangers">查看全部游骑兵 →</Link>
        </nav>
      </article>
    </>
  );
}
