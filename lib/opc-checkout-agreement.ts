import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_OPERATOR_CREDIT_CODE,
  LEGAL_OPERATOR_NAME,
  PUBLIC_ORIGIN,
} from "./legal-profile.ts";

export const OPC_PAPER_CHECKOUT_AGREEMENT_VERSION = "opc-paper-prepayment-v2";

export type OpcPaperCheckoutAgreementService = {
  code: string;
  name: string;
  revision: string;
  price: string;
  period: string;
  outcome: string;
  scope: string;
  boundary: string;
};

export type OpcPaperCheckoutAgreement = {
  version: string;
  title: string;
  sections: Array<{ title: string; paragraphs: string[] }>;
  text: string;
};

export function buildOpcPaperCheckoutAgreement(
  service: OpcPaperCheckoutAgreementService,
): OpcPaperCheckoutAgreement {
  const title = "OPC 在线订单及纸质合同预付款协议";
  const sections = [
    {
      title: "一、交易主体与文件性质",
      paragraphs: [
        `经营者、收款方及拟签约服务方为${LEGAL_OPERATOR_NAME}，统一社会信用代码${LEGAL_OPERATOR_CREDIT_CODE}。付款方为本页填写并提交订单资料的自然人或组织。`,
        "付款方勾选确认并成功提交订单时，本在线订单及预付款协议成立，用于确认订单快照、全额预付款、纸质合同寄送及未完成纸质签约时的解除退款安排；付款完成凭证不是发票，也不替代双方拟签署的正式纸质服务合同。",
      ],
    },
    {
      title: "二、服务订单快照",
      paragraphs: [
        `服务：${service.name}（${service.code}）；公开价格：${service.price}；预计期限：${service.period}。`,
        `交付成果：${service.outcome}。服务范围：${service.scope}。服务边界：${service.boundary}。`,
      ],
    },
    {
      title: "三、付款、合同门禁与服务开始",
      paragraphs: [
        "付款方同意先通过本站生成的支付宝企业商户固定金额收银台支付订单全款；付款金额由服务器写入支付宝订单，付款方不能自行修改。",
        `支付宝到账核验后，${LEGAL_OPERATOR_NAME}按预留联系人及地址寄送正式纸质合同，并承担合同打印及往返快递费用。`,
        `在${LEGAL_OPERATOR_NAME}收到并核验双方签署的正式纸质合同之前，服务尚未开始；付款到账本身不触发服务履行。`,
      ],
    },
    {
      title: "四、未完成纸质签约的全额退款",
      paragraphs: [
        `纸质合同成功送达次日起七个自然日内，如付款方仍未将已签署合同交寄给承运人，视为付款方不同意继续订立该纸质合同；是否按时以承运人首次揽收记录为准，配送异常、法定节假日、不可抗力或双方确认的合理情形可以顺延。`,
        "在上述情形下，服务不开始，经营者通过支付宝按原支付路径退还订单全款，不扣除合同打印费或往返快递费。退款到账时间以支付宝及付款账户处理进度为准。",
      ],
    },
    {
      title: "五、双方义务",
      paragraphs: [
        "付款方应确保身份、授权、联系人和寄送地址真实、准确、完整，及时查收、审阅并寄回纸质合同；信息变化时应及时通过客服邮箱通知经营者。",
        "经营者应按订单快照生成固定金额支付请求，核验真实到账，妥善保护订单资料，并按本协议完成寄送、合同门禁或全额退款处理。",
      ],
    },
    {
      title: "六、违约与责任",
      paragraphs: [
        "一方违反本协议造成对方损失的，依法承担相应责任。因不可抗力、基础通信故障或支付机构异常造成延迟的，双方应及时沟通并采取合理减损措施。",
        "本协议不排除或限制消费者依法享有的解除、退款、投诉、调解、诉讼或损害赔偿等权利，也不免除经营者因故意或重大过失依法应承担的责任。",
      ],
    },
    {
      title: "七、法律适用与争议解决",
      paragraphs: [
        `本协议适用中华人民共和国大陆地区法律。争议发生后，双方先通过 ${LEGAL_CONTACT_EMAIL} 协商；协商不成的，任何一方可依法向有管辖权的人民法院提起诉讼。消费者亦可向消费者组织或有关行政部门投诉、请求调解。`,
        `完整服务条款、隐私说明及经营者信息见 ${PUBLIC_ORIGIN}/terms、${PUBLIC_ORIGIN}/privacy 与 ${PUBLIC_ORIGIN}/legal。`,
      ],
    },
  ];
  const text = [
    title,
    `版本：${OPC_PAPER_CHECKOUT_AGREEMENT_VERSION}`,
    "",
    ...sections.flatMap((section) => [section.title, ...section.paragraphs, ""]),
  ].join("\n").trim();
  return { version: OPC_PAPER_CHECKOUT_AGREEMENT_VERSION, title, sections, text };
}

export const OPC_PAPER_CHECKOUT_AGREEMENT_TEXT = [
  "支付宝固定金额全额预付款",
  "纸质合同寄送及合同门禁",
  "未完成纸质签约时原路全额退款",
  "服务尚未开始前不触发履行",
] as const;
