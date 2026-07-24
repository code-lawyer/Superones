import type { SicContentByGroup } from "./sic-content.ts";
import type { SicContentGroupId, SicContentItem } from "./sic-content-types.ts";
import type { SicExtensionRankings } from "./sic-extensions.ts";
import type { SicBoard, SicBoardItem } from "./sic.ts";

const boardNames: Record<SicBoard["id"], string[]> = {
  "github-trending": ["anthropics/claude-code", "microsoft/markitdown", "openai/codex", "vercel/ai", "huggingface/transformers", "shadcn-ui/ui", "microsoft/agent-lightning", "ollama/ollama", "langchain-ai/langchain", "astral-sh/uv", "pydantic/pydantic-ai", "modelcontextprotocol/servers"],
  "github-24h": ["openai/openai-agents-python", "microsoft/BitNet", "google-gemini/gemini-cli", "langgenius/dify", "facebookresearch/llama-stack", "mistralai/mistral-inference", "vllm-project/vllm", "comfyanonymous/ComfyUI", "browser-use/browser-use", "BerriAI/litellm", "All-Hands-AI/OpenHands", "getzep/graphiti"],
  "github-7d": ["google/adk-python", "unslothai/unsloth", "deepseek-ai/DeepSeek-V3", "sgl-project/sglang", "n8n-io/n8n", "microsoft/autogen", "PaddlePaddle/PaddleOCR", "NVIDIA/TensorRT-LLM", "assafelovic/gpt-researcher", "crewAIInc/crewAI", "OpenBMB/MiniCPM-V", "modal-labs/modal-client"],
  "hugging-face": ["Qwen/Qwen3-8B", "meta-llama/Llama-4-Scout", "google/gemma-3-27b-it", "deepseek-ai/DeepSeek-R1", "mistralai/Mistral-Small-3.1", "stabilityai/stable-diffusion-3.5", "sentence-transformers/all-MiniLM-L6-v2", "BAAI/bge-m3", "black-forest-labs/FLUX.1-dev", "openai/whisper-large-v3", "coqui/XTTS-v2", "microsoft/Phi-4"],
  openrouter: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-pro", "deepseek/deepseek-r1", "meta-llama/llama-4-maverick", "qwen/qwen3-235b-a22b", "x-ai/grok-3-mini", "mistralai/mistral-small-3.1", "openai/o4-mini", "moonshotai/kimi-k2", "google/gemini-2.5-flash", "anthropic/claude-3.7-sonnet"],
};

type PreviewContentSeed = {
  sourceName: string;
  title: string;
  translatedTitle: string;
  description: string;
  summary: string;
};

const contentSeeds: Record<SicContentGroupId, PreviewContentSeed[]> = {
  papers: [
    { sourceName: "AI Papers of the Week", title: "Reasoning Models as Verifiers", translatedTitle: "推理模型作为验证器", description: "从可验证推理切入，重新审视长链推理的训练与评估。", summary: "论文研究如何让推理模型检查候选答案与推导过程，并比较不同验证策略对准确率、计算成本和错误发现能力的影响。" },
    { sourceName: "Hugging Face Daily Papers", title: "Language Models Learn to Compress Their Own Context", translatedTitle: "语言模型学会压缩自己的上下文", description: "以压缩替代截断，为长上下文处理寻找新的工程路径。", summary: "研究让模型主动提炼历史上下文中的关键信息，在有限窗口内保留任务所需状态，并分析压缩率与下游质量之间的关系。" },
    { sourceName: "Papers with Code", title: "A Survey of Agent Memory", translatedTitle: "智能体记忆研究综述", description: "系统整理智能体记忆的表示、检索与评测问题。", summary: "综述比较短期、长期与情景记忆的主要实现路线，归纳常用基准，并指出真实长期任务中仍未解决的可靠性问题。" },
    { sourceName: "Semantic Scholar", title: "World Models for Generalist Robotics", translatedTitle: "通用机器人世界模型", description: "面向具身任务，讨论世界模型训练与数据构造。", summary: "论文将视觉、动作和语言信号统一到可预测的环境表示中，用于跨任务规划，并评估模型在未见场景中的迁移表现。" },
  ],
  archive: [
    { sourceName: "Google DeepMind", title: "Scaling language models with efficient inference", translatedTitle: "用高效推理扩展语言模型", description: "官方研究更新，讨论推理阶段的计算分配与系统效率。", summary: "文章梳理推理计算如何转化为模型能力，重点讨论批处理、缓存、动态计算预算以及硬件利用率之间的系统权衡。" },
    { sourceName: "Anthropic", title: "Building effective agents", translatedTitle: "构建有效的智能体", description: "官方工程文章，说明可控智能体工作流的设计原则。", summary: "文章区分工作流与自主智能体，结合路由、并行、编排和评估模式，说明何时应该增加系统复杂度。" },
    { sourceName: "OpenAI", title: "Evaluating model behavior", translatedTitle: "评估模型行为", description: "官方发布的模型行为评测方法与边界说明。", summary: "文档介绍如何构造代表性任务、记录失败模式并持续回归测试，强调评测结果必须结合部署场景解释。" },
    { sourceName: "Microsoft Research", title: "Research directions for AI systems", translatedTitle: "人工智能系统的研究方向", description: "来自研究团队的系统与基础模型协同展望。", summary: "研究团队总结模型、数据、基础设施与人机协作的交叉问题，并讨论未来系统研究需要解决的效率和可靠性挑战。" },
  ],
  courses: [
    { sourceName: "Google ML Courses", title: "Introduction to machine learning problem framing", translatedTitle: "机器学习问题定义入门", description: "从问题定义到数据与评估，建立可复用的实践框架。", summary: "本节课程讲解如何把业务目标转化为可学习的任务，选择标签与成功指标，并在建模前识别数据偏差和不可行假设。" },
    { sourceName: "Stanford HAI", title: "Foundation models: methods and applications", translatedTitle: "基础模型：方法与应用", description: "公开课程梳理基础模型研究与现实应用之间的关系。", summary: "课程覆盖预训练、适配、评估和社会影响，通过典型系统案例解释基础模型在不同领域中的能力与限制。" },
    { sourceName: "NVIDIA Developer", title: "Efficient LLM inference", translatedTitle: "高效大模型推理", description: "工程课程聚焦吞吐、延迟与部署之间的权衡。", summary: "课程介绍批处理、量化、KV Cache 与并行策略，演示如何依据服务负载选择优化路径并验证性能收益。" },
    { sourceName: "MIT CSAIL", title: "Robotics and embodied intelligence seminar", translatedTitle: "机器人与具身智能研讨课", description: "研究课程讨论机器人学习与真实环境交互。", summary: "本节从感知、控制和数据采集出发，分析具身智能系统如何在不确定环境中学习可复用技能。" },
  ],
  podcasts: [
    { sourceName: "Dwarkesh Podcast", title: "How frontier models change scientific work", translatedTitle: "前沿模型如何改变科学工作", description: "与研究者讨论基础模型、科学发现与计算基础设施。", summary: "对话围绕模型是否能够提出假设、设计实验和辅助证明展开，并讨论算力、数据与科研组织方式可能发生的变化。" },
    { sourceName: "Latent Space", title: "The engineering of durable AI agents", translatedTitle: "可靠智能体的工程实践", description: "从开发者视角讨论上下文、工具与系统可靠性。", summary: "节目复盘长期运行智能体的主要失败模式，讨论状态管理、工具契约、可观测性和恢复机制的工程选择。" },
    { sourceName: "Cognitive Revolution", title: "The economics of intelligence", translatedTitle: "智能的经济学", description: "讨论模型能力扩散后对产业与组织的长期影响。", summary: "对话分析智能成本下降可能如何改变软件、研究与专业服务，并区分短期自动化收益和长期组织重构。" },
    { sourceName: "Google DeepMind Podcast", title: "AI for science", translatedTitle: "人工智能推动科学发现", description: "研究团队分享人工智能在科学问题中的实践。", summary: "节目介绍从蛋白质结构到材料发现的代表性项目，重点讨论模型预测如何与实验验证形成闭环。" },
  ],
};

function previewItems(board: SicBoard): SicBoardItem[] {
  return boardNames[board.id].map((name, index) => {
    const address = board.id.startsWith("github-")
      ? `https://github.com/${name}`
      : board.id === "hugging-face"
        ? `https://huggingface.co/${name}`
        : `https://openrouter.ai/${name}`;
    return {
      id: `preview-${board.id}-${index}`,
      name,
      value: board.id === "openrouter" ? null : Math.round((12 - index) * (board.id === "github-trending" ? 19_430 : 1_830)),
      href: address,
      address,
    };
  });
}

function previewContent(group: SicContentGroupId): SicContentItem[] {
  return contentSeeds[group].map(({ sourceName, title, translatedTitle, description, summary }, index) => ({
    id: `preview-${group}-${index}`,
    sourceId: `preview-${group}-${index}`,
    group,
    sourceName,
    publisher: sourceName,
    title,
    translatedTitle,
    description,
    summary: description,
    contentSummary: summary,
    url: "https://example.com/preview",
    publishedAt: `2026-07-${String(23 - index).padStart(2, "0")}T08:00:00.000Z`,
    collectedAt: "2026-07-23T08:00:00.000Z",
  }));
}

const previewSkillNames = [
  "OpenAI Docs",
  "React Best Practices",
  "Frontend Design",
  "Playwright",
  "Postgres Patterns",
  "Next.js App Router",
  "Agent Skills",
  "Web Accessibility",
  "TypeScript Patterns",
  "Prompt Engineering",
  "Python Tooling",
  "API Design",
  "Security Review",
  "Database Migrations",
  "Testing Strategy",
  "GitHub Actions",
  "Performance Audit",
  "Documentation",
  "Code Review",
  "Deployment Checks",
];

const previewMcpNames = [
  "Exa Search",
  "GitHub",
  "Playwright",
  "Filesystem",
  "PostgreSQL",
  "Slack",
  "Notion",
  "Google Drive",
  "Sequential Thinking",
  "Memory",
  "Fetch",
  "Sentry",
  "Linear",
  "Supabase",
  "Cloudflare",
  "Stripe",
  "Docker",
  "Kubernetes",
  "Redis",
  "SQLite",
];

function previewExtensionItems(names: string[], base: number, hrefBase: string) {
  return names.map((name, index) => {
    const slug = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
    return {
      id: `preview-${slug}`,
      name,
      value: Math.max(1, Math.round(base * (1 - index / 25))),
      href: hrefBase.includes("smithery") ? `${hrefBase}/${slug}` : hrefBase,
    };
  });
}

const previewExtensions: SicExtensionRankings = {
  capturedAt: "2026-07-23T08:00:00.000Z",
  skills: {
    selected: previewExtensionItems(previewSkillNames, 18420, "https://skills.sh/"),
    surging: previewExtensionItems(previewSkillNames, 1260, "https://skills.sh/"),
    surgingReady: true,
  },
  mcps: {
    selected: previewExtensionItems(previewMcpNames, 48200, "https://smithery.ai/servers"),
    surging: previewExtensionItems(previewMcpNames, 2940, "https://smithery.ai/servers"),
    surgingReady: true,
  },
};

export function localSicVisualPreview(
  githubBoards: SicBoard[],
  modelBoards: SicBoard[],
  content: SicContentByGroup,
  extensionRankings: SicExtensionRankings,
) {
  const contentEmpty = [...githubBoards, ...modelBoards].every((board) => board.items.length === 0)
    && Object.values(content).every((items) => items.length === 0);
  const extensionsEmpty = extensionRankings.skills.selected.length === 0 && extensionRankings.mcps.selected.length === 0;
  if (process.env.NODE_ENV === "production") return { enabled: false, githubBoards, modelBoards, content, extensionRankings };
  if (!contentEmpty || !extensionsEmpty) {
    return { enabled: false, githubBoards, modelBoards, content, extensionRankings };
  }

  const withItems = (board: SicBoard): SicBoard => ({ ...board, items: previewItems(board) });
  return {
    enabled: true,
    githubBoards: githubBoards.map(withItems),
    modelBoards: modelBoards.map(withItems),
    content: {
      papers: previewContent("papers"),
      archive: previewContent("archive"),
      courses: previewContent("courses"),
      podcasts: previewContent("podcasts"),
    },
    extensionRankings: previewExtensions,
  };
}
