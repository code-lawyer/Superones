import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "隐私" };

export default function PrivacyPage() {
  return <ProsePage code="PRIVACY / DATA MINIMIZATION" title="只收集完成当前任务所需的数据。" lead="公开浏览不要求创建账户；需要联系、付款核验或业务处理时，页面会在提交前说明具体用途。" sections={[
    { title: "公开浏览", paragraphs: ["公开网站不要求注册，不建立跨站用户画像。访问统计采用自托管、无 Cookie 的最小化方案。"] },
    { title: "OPC 服务订单", paragraphs: ["下单时收集联系人姓名，以及手机号、邮箱或微信号中的至少一种。联系方式只用于订单联系、支付宝到账核验和后续交付，不公开，也不进入境外采集任务。订单完成、取消或退款满 24 个月后清除联系方式；订单号、服务修订、价格快照、支付宝交易号和必要的核验时间作为最小业务记录保留。", "Vault2077 不收集支付宝登录信息、支付密码、银行卡号或付款验证码。付款在支付宝官方收银台完成；Vault2077 仅接收支付宝签名通知和交易查询结果。"] },
    { title: "边境计划", paragraphs: ["报名时收集仓库地址、项目说明和联系邮箱。邮箱只用于资格确认、获奖通知与奖品发放，不出现在排行榜或公开接口中。"] },
    { title: "数据位置", paragraphs: ["用户联系方式、后台会话和运营日志存储在中国大陆服务端，不传输到境外采集节点。"] },
  ]} />;
}
