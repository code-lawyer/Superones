import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "隐私" };

export default function PrivacyPage() {
  return <ProsePage code="PRIVACY / DRAFT" title="只收集完成当前任务所需的数据。" lead="本页为第一阶段占位文本，正式上线前须由专业人员根据真实系统与主体信息复核。" sections={[
    { title: "公开浏览", paragraphs: ["公开网站不要求注册，不建立跨站用户画像。访问统计采用自托管、无 Cookie 的最小化方案。"] },
    { title: "边境计划", paragraphs: ["报名时收集仓库地址、项目说明和联系邮箱。邮箱只用于资格确认、获奖通知与奖品发放，不出现在排行榜或公开接口中。"] },
    { title: "数据位置", paragraphs: ["用户联系方式、后台会话和运营日志存储在中国大陆服务端，不传输到境外采集节点。"] },
  ]} />;
}
