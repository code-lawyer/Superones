import "server-only";

export type GitHubRepository = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  stars: number;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  license: string | null;
};

export function parseGitHubRepository(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的 GitHub 仓库地址。");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("只接受 https://github.com/owner/repository 格式的公开仓库地址。");
  }
  if (url.search || url.hash) {
    throw new Error("仓库地址不能包含查询参数或页面锚点。");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment))) {
    throw new Error("仓库地址必须精确指向一个 owner/repository，不能包含子路径或查询参数。");
  }
  if (segments[1].endsWith(".git")) {
    throw new Error("请使用 GitHub 页面地址，不要使用 .git 克隆地址。");
  }
  return { owner: segments[0], repo: segments[1] };
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Vault2077-MVP",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubFetch(url: string) {
  let response: Response;
  try {
    response = await fetch(url, { headers: githubHeaders(), cache: "no-store" });
  } catch {
    throw new Error("暂时无法连接 GitHub。请稍后重试。");
  }
  if (response.status === 404) throw new Error("没有找到该公开 GitHub 仓库。");
  if (response.status === 403 || response.status === 429) throw new Error("GitHub 请求额度暂不可用，请稍后重试。");
  if (!response.ok) throw new Error("GitHub 暂时无法返回仓库信息，请稍后重试。");
  return response;
}

export async function inspectGitHubRepository(owner: string, repo: string): Promise<GitHubRepository> {
  const response = await githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  const data = await response.json() as {
    full_name?: unknown; default_branch?: unknown; stargazers_count?: unknown; fork?: unknown; archived?: unknown; private?: unknown; license?: { spdx_id?: unknown } | null;
  };
  if (typeof data.full_name !== "string" || typeof data.default_branch !== "string" || typeof data.stargazers_count !== "number") {
    throw new Error("GitHub 返回的仓库数据不完整。");
  }
  return {
    owner,
    repo,
    fullName: data.full_name,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    isFork: data.fork === true,
    isArchived: data.archived === true,
    isPrivate: data.private === true,
    license: data.license && typeof data.license.spdx_id === "string" ? data.license.spdx_id : null,
  };
}

export async function readGitHubChallengeFile(owner: string, repo: string, branch: string, filePath: string) {
  const safePath = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await githubFetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${safePath}`);
  return response.text();
}
