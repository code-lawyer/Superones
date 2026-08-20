import type { OpcPaymentReceiptView } from "./opc-payment-receipt-image.ts";

export type AdminFrontierSubmission = {
  id: string;
  repository: string;
  email: string;
  note: string;
  status: "pending" | "rejected" | "verified" | "settled" | "ineligible_at_settlement";
  createdAt: string;
  verifiedAt: string | null;
  baselineStars: number | null;
  currentStars: number | null;
  lastSnapshotAt: string | null;
};

export type AdminFrontierDonation = {
  id: string;
  season: string;
  name: string;
  description: string;
  email: string;
  status: "pending_confirmation" | "available" | "rejected" | "withdrawn" | "assigned" | "carried_over";
  createdAt: string;
  confirmedAt: string | null;
};

export type AdminFrontierSeasonConfiguration = {
  season: string;
  officialReward: string;
  rewardProvider: "边境计划管理局";
  taxNotice: "依法归属于获奖者的税费由获奖者承担；依法需代扣代缴的，由运营主体依法办理";
  rewardProcessOpenWithinDays: 7;
  status: "draft" | "published";
  updatedAt: string;
  publishedAt: string | null;
};

export type AdminContentState = {
  mode: "demo" | "live" | "degraded";
  updatedAt: string | null;
  sourceCount: number;
  eventCount: number;
  projectCount: number;
};

export type AdminOpcOrderStatus = "awaiting_signature" | "awaiting_payment" | "payment_exception" | "paid_pending_contract" | "paid" | "refund_pending" | "completed" | "cancelled" | "refunded";

export const ADMIN_OPC_ORDER_STATUS_LABELS: Record<AdminOpcOrderStatus, string> = {
  awaiting_signature: "待签署",
  awaiting_payment: "待付款",
  payment_exception: "到账异常（签约未放行）",
  paid_pending_contract: "已付款，待确认纸质合同",
  paid: "已到账",
  refund_pending: "全额退款处理中",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

export type AdminOpcOrder = {
  id: string;
  reference: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  signatureMethod: "paper" | "electronic" | "online";
  payment: {
    provider: "retired_online" | "bank_transfer";
    amount: { currency: "CNY"; minorUnits: number; decimal: string };
    tradeNo: string | null;
    tradeStatus: string | null;
    requestCreatedAt: string | null;
    notifiedAt: string | null;
    checkedAt: string | null;
    offlineProfileRevision: string | null;
    accountName: string | null;
    bankName: string | null;
    branchName: string | null;
    accountNumber: string | null;
    cnapsCode: string | null;
    transferMemo: string | null;
    agreementSha256: string | null;
    contactQrSha256: string | null;
  };
  contactAvailable: boolean;
  signature: {
    provider: "mock" | "esign" | "legacy";
    status: string;
    flowId: string | null;
    fileId: string | null;
    templateId: string | null;
    templateVersion: string | null;
    notifiedAt: string | null;
    checkedAt: string | null;
    completedAt: string | null;
    failureReason: string | null;
    archive: {
      status: "pending" | "archived" | "failed";
      sha256: string | null;
      sizeBytes: number | null;
      archivedAt: string | null;
      retainUntil: string | null;
      failureReason: string | null;
    };
  };
  status: AdminOpcOrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  contactDeletedAt: string | null;
  paymentReceipt: OpcPaymentReceiptView | null;
  refund: { status: "pending" | "succeeded"; requestNo: string; reason: string; amount: { decimal: string }; requestedAt: string; completedAt: string | null } | null;
  refundApplication: { status: "requested"; requestedAt: string } | null;
  notifications: Array<{ eventId: string; recipient: string; status: string; attempts: number; sentAt: string | null }>;
};

export type AdminOpcOrderDossier = {
  id: string;
  reference: string;
  status: AdminOpcOrderStatus;
  service: { code: string; name: string; revision: string; quotedPrice: string; period: string; outcome: string; scope: string; boundary: string };
  contact: { name: string; phone: string; email: string; wechat: string; note: string; identityDocumentNumberMasked?: string };
  signer: { type: "individual" | "organization"; name: string; organizationName: string; organizationCreditCode: string; legalRepresentativeName: string };
  delivery: { recipientName: string; phone: string; province: string; city: string; district: string; addressLine: string } | null;
  payment: AdminOpcOrder["payment"];
  paymentReceipt: OpcPaymentReceiptView | null;
  checkoutAgreement: { version: string; title: string; text: string; sha256: string; acceptedAt: string } | null;
  refund: AdminOpcOrder["refund"];
  refundApplication: { status: "requested"; reason: string; requestedAt: string } | null;
  notifications: AdminOpcOrder["notifications"];
  auditTrail: Array<{ occurredAt: string; actorHash: string; action: string; result: "success" | "rejected" | "failed"; reason: string | null; diff: Record<string, unknown> }>;
};

export type AdminBankVerificationField = "bankTransactionId" | "payerName" | "paidAt" | "evidenceConfirmed";
export type AdminBankVerificationDraft = {
  orderId: string;
  bankTransactionId: string;
  payerName: string;
  paidAt: string;
  evidenceConfirmed: boolean;
  errors: Partial<Record<AdminBankVerificationField, string>>;
};

export type AdminLoginMode = "passkey" | "local-password";

export type AdminPasskeyCredential = {
  credentialId: string;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type AdminApiResponse = {
  error?: unknown;
  code?: unknown;
  reauthenticationUrl?: unknown;
  submissions?: AdminFrontierSubmission[];
  donations?: AdminFrontierDonation[];
  seasonConfiguration?: AdminFrontierSeasonConfiguration;
  state?: AdminContentState;
  orders?: AdminOpcOrder[];
  dossier?: AdminOpcOrderDossier;
  order?: Partial<AdminOpcOrder>;
  refreshed?: unknown;
  failed?: unknown;
};
