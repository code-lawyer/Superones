import "server-only";

import {
  getOpcPaymentReceipt,
  verifyOpcBankTransfer,
} from "./opc-orders/payment.ts";
import {
  getAdminOpcOrderDossier,
  getAdminOpcOrderSensitiveDossier,
  updateOpcOrderStatus,
} from "./opc-orders/admin.ts";
import { getOpcOrderByResumeToken } from "./opc-orders/signature.ts";
export function createOpcOrderLifecycle() {
  return {
    async verifyBankTransfer(input: Parameters<typeof verifyOpcBankTransfer>[0]) {
      return verifyOpcBankTransfer(input);
    },
    async readPaymentReceipt(input: { reference: string; resumeToken: string }) {
      return getOpcPaymentReceipt(input.reference, input.resumeToken);
    },
    async readResumedOrder(input: { reference: string; resumeToken: string }) {
      return getOpcOrderByResumeToken(input.reference, input.resumeToken);
    },
    async readAdminOrderDossier(input: { id: string }) {
      return getAdminOpcOrderDossier(input.id);
    },
    async readAdminSensitiveDossier(input: { id: string }) {
      return getAdminOpcOrderSensitiveDossier(input.id);
    },
    async completeOrder(input: { id: string }) {
      return updateOpcOrderStatus(input.id, "completed");
    },
  };
}
