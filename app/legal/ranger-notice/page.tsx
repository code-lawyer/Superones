import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { getLegalProfile } from "@/lib/legal-profile";

export const metadata: Metadata = { title: "游骑兵名录说明" };

export default function RangerNoticePage() {
  const profile = getLegalProfile();
  return (
    <ProsePage
      code="RANGER / DIRECTORY NOTICE"
      title="游骑兵名录说明"
      lead="游骑兵名录是经授权的职业资料目录；现阶段不代收顾问费用，不撮合站内交易，也不对外部顾问服务结果作保证。"
      sections={[
        {
          title: "名录性质",
          paragraphs: [
            "名录用于帮助访问者发现独立专业人士及其公开联系入口。除页面或另行书面合同明确说明外，运营主体不参与访问者与顾问之间的报价、签约、收款、交付或争议处理。",
          ],
        },
        {
          title: "资料来源与授权",
          paragraphs: [
            "展示姓名或称谓、职业简介、擅长领域、代表作品和联系方式前，应取得本人授权或确认其他合法依据。顾问应保证提交信息真实、合法，不侵犯第三方权利，并在信息变化时及时申请更新。",
          ],
        },
        {
          title: "不构成背书",
          paragraphs: [
            "收录仅表示资料通过基础核验，不构成对顾问资格、持续执业状态、服务质量、适合特定目的或结果的保证。访问者应自行核验身份、资质、利益冲突、合同条款和付款安排。",
          ],
        },
        {
          title: "外部交易安全",
          paragraphs: [
            "请在独立合同中明确服务范围、价格、交付、保密、知识产权、退款和争议解决。不要向未经核验的联系人发送密码、支付验证码、完整银行卡信息或与服务无关的敏感资料。",
          ],
        },
        {
          title: "更正、退出与投诉",
          paragraphs: [
            `顾问本人或权利人可通过 ${profile.legalContactEmail} 申请更正、更新、暂停展示或删除非依法必须保留的资料。冒用身份、虚假资质、侵权或违法内容经核实后将及时处理。`,
          ],
        },
      ]}
      relatedLinks={[
        { href: "/terms", label: "使用与服务条款" },
        { href: "/privacy", label: "隐私政策" },
        { href: "/legal", label: "经营者信息" },
      ]}
    />
  );
}
