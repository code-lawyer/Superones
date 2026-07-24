import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGithubRankingProject } from "@/lib/sic-github-rankings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Metadata> {
  const { owner, repo } = await params;
  const project = await getGithubRankingProject(owner, repo);
  return { title: project ? `${owner}/${repo}` : "SiC 项目" };
}

export default async function ProjectPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const project = await getGithubRankingProject(owner, repo);
  if (!project) notFound();

  return (
    <article className="detail-page shell project-detail">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/sic">SiC / PROJECT</Link></div>
        <p className="project-owner mono">{project.owner}/</p>
        <h1>{project.repo}</h1>
      </header>
      <div className="detail-layout">
        <div className="detail-body">
          <section><h2>介绍</h2><p>{project.description || "该仓库未提供公开简介。"}</p></section>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow mono">REPOSITORY</p>
          <p className="mono"><a href={`https://github.com/${project.owner}/${project.repo}`} target="_blank" rel="noreferrer">https://github.com/{project.owner}/{project.repo}</a></p>
          <p className="mono">LICENSE / {project.license}</p>
        </aside>
      </div>
    </article>
  );
}
