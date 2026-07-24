import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { getRangerProfile, rangerProfiles } from "@/lib/opc-catalog";

export function generateStaticParams() {
  return rangerProfiles.map((profile) => ({ slug: profile.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = getRangerProfile(slug);
  return { title: profile ? `${profile.publicName}｜游骑兵协会` : "游骑兵协会" };
}

export default async function RangerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getRangerProfile(slug);
  if (!profile) notFound();

  const portraitIndex = rangerProfiles.findIndex((item) => item.slug === profile.slug);

  return (
    <>
      <PageIntro
        code="OPC / RANGER PROFILE"
        title={profile.publicName}
        lead={profile.intro}
        meta={`${profile.identity} / ${profile.contactState}`}
      />
      <ChannelRibbon identity="SUPERONES" slogan="ALL IS ONE. ONE IS ALL." />
      <main className="opc-ranger-profile-page">
        <figure className={`opc-ranger-profile-page__portrait opc-ranger-portrait--${portraitIndex}`}>
          <span className="opc-ranger-portrait__image" role="img" aria-label={`${profile.publicName}的专家头像`} />
        </figure>

        <article className="opc-ranger-profile-page__record">
          <div className="opc-ranger-profile-page__identity">
            <p className="mono">IDENTITY / 专家身份</p>
            <h2>{profile.identity}</h2>
          </div>

          <section>
            <p className="mono">EXPERTISE / 专业方向</p>
            <ul>{profile.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
          </section>

          <section>
            <p className="mono">PUBLIC RECORD / 公开记录</p>
            <p>{profile.credential ?? "公开职业记录将在专家本人确认后展示。"}</p>
          </section>

          <section className="opc-ranger-profile-page__contact">
            <p className="mono">DIRECT CONTACT / {profile.contactState}</p>
            <h3>{profile.contactLabel}</h3>
            <p>用户与专家自行建立联系。Vault2077 不参与后续咨询、定价、付款、交付或争议处理。</p>
          </section>

          <footer>
            <Link href="/opc">← 返回 OPC 服务台</Link>
            <Link href="/opc/rangers">查看全部游骑兵 →</Link>
          </footer>
        </article>
      </main>
    </>
  );
}
