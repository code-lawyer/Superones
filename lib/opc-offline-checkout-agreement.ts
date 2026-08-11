import type { OpcService } from "./opc-catalog.ts";
import type { PublicOpcOfflinePaymentProfile } from "./opc-offline-payment-profile.ts";

export const OPC_OFFLINE_AGREEMENT_VERSION = "opc-offline-bank-transfer-v1";

export function buildOpcOfflineCheckoutAgreement(
  service: OpcService,
  profile: PublicOpcOfflinePaymentProfile,
) {
  const sections = [
    {
      title: "订单与协议成立",
      paragraphs: [
        `本订单对应“${service.name}”（${service.code}，服务版本 ${service.revision}），固定价格为 ${service.price}。用户勾选同意并提交订单后，订单及协议成立；服务启动以企业账户到账核验和必要的项目确认为条件。`,
      ],
    },
    {
      title: "线下对公转账",
      paragraphs: [
        `仅向本页展示、户名为“${profile.account.name}”的企业银行账户付款，转账金额应与订单固定金额一致，付款附言填写订单号。用户可在转账前扫描同页联系人二维码沟通确认。`,
        "服务方以企业银行账户实际入账记录为核心依据核验付款；截图或回单可协助查找，但不单独构成最终到账证据。少付、超付、分笔或第三方代付可能进入人工核验。",
      ],
    },
    {
      title: "服务、取消与退款",
      paragraphs: [
        `服务结果为“${service.outcome}”，预计周期为“${service.period}”。服务范围和边界以服务目录、订单快照及双方后续书面确认为准。`,
        "付款前可停止转账；付款后的取消与退款按服务是否启动、已完成工作、不可退成本和适用法律处理。获准退款原则上退回原付款账户或经核验的同名账户。",
      ],
    },
    {
      title: "记录与版本",
      paragraphs: [
        `本订单绑定付款资料修订号 ${profile.revision}、协议 PDF 摘要 ${profile.agreement.sha256} 和联系人二维码摘要 ${profile.contactQr.sha256}。后续替换公开资料不改变本订单已留存的版本证据。`,
      ],
    },
  ];
  const title = "OPC 服务订单及线下对公转账协议";
  const text = [title, `版本：${OPC_OFFLINE_AGREEMENT_VERSION}`, ...sections.flatMap((section) => [section.title, ...section.paragraphs])].join("\n\n");
  return { version: OPC_OFFLINE_AGREEMENT_VERSION, title, sections, text };
}
