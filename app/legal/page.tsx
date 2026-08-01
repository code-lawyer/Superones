import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { getLegalProfile } from "@/lib/legal-profile";

export const metadata: Metadata = { title: "经营者信息与法律文件" };

export default function LegalPage() {
  const profile = getLegalProfile();
  return (
    <ProsePage
      code="LEGAL / OPERATOR DISCLOSURE"
      title="经营者信息与法律文件"
      lead="这里集中公示网站经营主体、备案信息、联系渠道和当前有效的业务规则。"
      sections={[
        {
          title: "经营主体",
          paragraphs: [
            `企业名称：${profile.operatorName}`,
            `统一社会信用代码：${profile.unifiedSocialCreditCode}`,
          ],
        },
        {
          title: "网站与备案",
          paragraphs: [
            `ICP备案号：${profile.icpNumber}`,
          ],
        },
        {
          title: "联系与投诉",
          paragraphs: [
            `法律、隐私与知识产权联系邮箱：${profile.legalContactEmail}`,
            `客户服务与消费投诉邮箱：${profile.customerServiceEmail}`,
            "我们会在核验事项所需的合理期限内处理，并依法保障用户投诉、举报、调解、仲裁和诉讼权利。",
          ],
        },
        {
          title: "文件效力",
          paragraphs: [
            `当前文件生效日期：${profile.effectiveDate}。专项业务规则与《使用与服务条款》共同构成相关服务约定；依法不得通过格式条款排除或限制的权利不受影响。`,
          ],
        },
      ]}
      relatedLinks={[
        { href: "/terms", label: "使用与服务条款" },
        { href: "/privacy", label: "隐私政策" },
        { href: "/legal/opc-service-rules", label: "OPC 服务、取消与退款规则" },
        { href: "/legal/frontier-rules", label: "边境计划活动规则" },
        { href: "/legal/ranger-notice", label: "游骑兵名录说明" },
      ]}
    />
  );
}
