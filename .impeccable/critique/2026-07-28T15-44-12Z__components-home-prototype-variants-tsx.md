---
target: 首页 refined variant
total_score: 21
max_score: 28
na_heuristics: 7,9,10
p0_count: 0
p1_count: 2
timestamp: 2026-07-28T15-44-12Z
slug: components-home-prototype-variants-tsx
---
Method: dual-agent (A: homepage_critique_design · B: homepage_critique_detector)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | 更新时间、来源、依据与空状态清楚；“0 项依据”与有依据事件的风险差异不够明显。 |
| 2 | Match System / Real World | 2 | 责任与交付语言准确，但 `SUPERONES`、OPC、SiC、PLATFORM NATIVE 对首次访问者缺少解释。 |
| 3 | User Control and Freedom | 3 | 宣言可收起，但移动端读到长文末尾后缺少就地关闭出口。 |
| 4 | Consistency and Standards | 4 | 卡片、行级链接、编号、细线和 OPC → SiC 顺序高度一致。 |
| 5 | Error Prevention | 3 | OPC 责任边界清楚；新窗口外链的 `↗` 提示不一致。 |
| 6 | Recognition Rather Than Recall | 3 | 主要入口有文字，但无文案三角要求首次用户猜测用途。 |
| 7 | Flexibility and Efficiency | n/a | Persuade 首页没有重复生产任务。 |
| 8 | Aesthetic and Minimalist Design | 3 | 视觉克制；原型切换器和 Vault 主卡的伸展空白没有服务内容。 |
| 9 | Error Recovery | n/a | 当前首页没有输入、提交或可恢复错误流程。 |
| 10 | Help and Documentation | n/a | Persuade 首页；方法与来源入口已足够。 |
| **Total** |  | **21/28** | **Good（75%）** |

## Design Specificity Verdict

**强特异性，8/10。** 当前首页不是可替换品牌名的通用资讯模板。纸张色阶、登记碳黑、细线、零圆角、编号、责任栏和边境横幅共同构成了可信的“公共档案仪器”。OPC 以责任登记而非营销卡出现，是最有产品识别度的部分。

问题不在视觉世界不够独特，而在若干局部没有完全服从这套世界：Vault 卡为追求等高制造了无意义空白；宣言语气从“准确、克制、可核验”转向绝对化阵营表达；开发态切换器持续遮挡正式内容。

自动检测对 `components/home-prototype-variants.tsx`、`components/home-refined-hero.tsx` 和 `app/page.tsx` 均返回 0 findings。没有 detector false positive。自动检测代理的浏览器运行时连接超时，因此没有可靠的用户可见 overlay；视觉结论来自独立设计代理在 1440、768、360 和宣言展开状态下的浏览器检查。

## Overall Impression

这是一个已经建立明确视觉权威的首页，整体方向不应推翻。最大的机会是消除“为了构图而存在”的空间与控件，让每一块面积都对应真实内容、真实状态或真实行动。下一轮应做结构收口，而不是增加装饰。

## What's Working

1. **信息架构已经产品化。** OPC 把“Vault 直接交付 / 外部独立顾问”放在选择点附近，建立了可信责任边界。
2. **响应式重组可靠。** 1440 的非对称瀑布在 768、360 下转为 Vault → OPC → SiC 单列，未观察到横向溢出。
3. **状态表达诚实。** `0 项依据`、`本地预览`、`正在编排`、`尚无通过验证的项目` 没有用伪数据填洞；边境横幅形成有效的页面结尾高潮。

## Priority Issues

### [P1] Vault 主卡的等高伸展制造“内容未加载完”的错觉

- **What**：桌面瀑布为匹配右侧 OPC + SiC 总高度，把 Vault 卡拉伸到约 1086px；第三条事件与 footer 之间出现大面积无结构空白。
- **Why it matters**：信息流应该是首页密度最高的频道，空白却让它看起来数据不足或加载异常。
- **Fix**：保留卡片式布局，但让 Vault 卡按内容自然高度结束；右侧两卡不必共同决定左卡高度。若必须维持齐底，只能用真实的来源摘要、更新时间线或证据概览填充，不用纯空白。
- **Suggested command**：`$impeccable layout`

### [P1] 宣言语气与产品的可信承诺发生冲突

- **What**：“公司制失去价值”“霸权公司”“受够了愚蠢”“剩下一切交给我们”从公共档案语气跳向绝对化阵营召唤。
- **Why it matters**：用户真正关心的是交付、证据和责任边界。绝对表达会削弱前面刚建立的制度化可信度，并与 OPC 的有限责任说明形成张力。
- **Fix**：保留荒野与避难所世界观，但明确它是“欢迎辞/创始信”，不是服务承诺；下一次替换正文时，将愿景落回“保留个人判断、减少组织复杂度、明确责任边界”。在用户确认文案方向前不擅自改写。
- **Suggested command**：`$impeccable clarify`

### [P2] 无文字三角的发现性和长文退出路径不足

- **What**：入口视觉主体只有约 14px 三角，按钮为 40×44px；移动端展开正文约 1217px，末尾没有就地收起控件。
- **Why it matters**：无障碍名称解决了读屏识别，却没有解决视觉用户“不知道三角是什么”；读完长文还需要反向滚动才能关闭。
- **Fix**：遵守“不显示提示文字”的明确要求，保留纯三角，但把真实命中区扩大为至少 44×44px，并在宣言末尾加入同样克制的向上三角作为第二收起入口，保持可访问名称。
- **Suggested command**：`$impeccable audit`

### [P2] 移动端若干文字链接的触控面积不足

- **What**：360 下卡片头 CTA 约 34px 高，“查看数据源地图”约 19px 高；部分控件小于 44px。
- **Why it matters**：页面折叠后很长，单手滚动时更容易误触或漏掉小目标。
- **Fix**：统一为卡片头 CTA、来源链接和图标按钮提供至少 44px 的透明命中区；视觉字号保持不变，避免把页面做得臃肿。
- **Suggested command**：`$impeccable audit`

### [P2] 开发态原型切换器妨碍真实页面判断

- **What**：360 下固定切换器约 321×48px，持续覆盖标题和正文；768 下也会压住事件列表。
- **Why it matters**：它虽然是开发工具，但当前评审页面的阅读体验被它真实破坏，也会影响截图和空间判断。
- **Fix**：最终评审时默认隐藏切换器，改用 URL 参数切换；若必须保留，改成非覆盖式开发栏。生产逻辑无需改变。
- **Suggested command**：`$impeccable adapt`

## Persona Red Flags

**Jordan（首次访问者）**

- 能识别四个频道，却不能立即解释 `SUPERONES`、OPC、SiC 与 `PLATFORM NATIVE`。
- 纯三角可能被理解为滚动提示或装饰，而不是欢迎辞入口。
- 展开后先进入长篇立场宣言，缺少“该去信息流、服务台还是学院”的新手决策支持。

**Casey（分心的移动用户）**

- 固定切换器占据视口底部并覆盖正在阅读的内容。
- 多个 19–40px 的目标不适合单手操作。
- 宣言展开使页面显著增长，末尾没有就地收起入口，恢复主任务成本高。

**Riley（压力测试者）**

- 会追问“剩下一切交给我们”如何与游骑兵双方自行约定后续事项同时成立。
- 会发现新窗口外链符号不一致。
- 会把 `0 项依据`、本地预览、空榜单和备案待接入串联成发布成熟度问题；状态诚实，但缺少统一解释。

## Minor Observations

- `FOR YOUR，SUPERONES` 混用英文与中文全角逗号，而且英文语法不自然；如果是刻意品牌口号，应统一为一套可解释写法。
- `0 项依据` 不应仅作为普通元数据出现，可增加“待补证”文字状态，但不要使用警示红，除非它真的是阻断错误。
- 所有 `target="_blank"` 外链应统一显示 `↗`。
- 页脚 6 个链接可按“了解 / 证据 / 法务”分组，降低平级选择负担。
- 边境横幅是目前最有效的 peak-end，但真正页面末尾的备案待接入状态会削弱这个结尾。

## Questions to Consider

- 欢迎辞是一封带作者立场的信，还是 Vault2077 对服务能力的正式承诺？
- Vault 主卡必须与 OPC + SiC 齐底吗，还是这种整齐正在制造加载未完成的错觉？
- `SUPERONES / OPC / SiC` 是社群内部语言，还是首次访客也必须在五秒内理解的公共导航？
- 最终希望用户记住“参与边境计划”，还是页面末尾的待接入状态？
