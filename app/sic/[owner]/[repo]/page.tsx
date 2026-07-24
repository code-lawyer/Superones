import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDirectGithubProject } from "@/lib/direct-rankings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Metadata> {
  const { owner, repo } = await params;
  const project = await getDirectGithubProject(owner, repo);
  return { title: project ? `${owner}/${repo}` : "SiC 项目" };
}

export default async function ProjectPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const project = await getDirectGithubProject(owner, repo);
  if (!project) notFound();

  return (
    <article className="detail-page shell project-detail">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/sic">SiC / PROJECT</Link></div>
        <p className="project-owner mono">{owner}/</p>
        <h1>{repo}</h1>
      </header>
      <div className="detail-layout">
        <div className="detail-body">
          <section><h2>介绍</h2><p>{project.description || "GitHub Trending 未提供公开简介。"}</p></section>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow mono">REPOSITORY</p>
          <p className="mono"><a href={project.itemUrl} target="_blank" rel="noreferrer">{project.itemUrl}</a></p>
          <p className="mono">VIEW / {project.providerView}</p>
          <p className="mono">CAPTURED / {project.capturedAt}</p>
        </aside>
      </div>
    </article>
  );
}
