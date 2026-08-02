import "server-only";

import { createHash } from "node:crypto";
import {
  applyOpcSignatureStatusByFlow,
  claimOpcSignatureArchive,
  completeOpcSignatureArchive,
  getOpcSignatureArchivePreparationByFlow,
  markOpcSignatureArchiveFailed,
} from "./opc-order-store.ts";
import {
  downloadAndVerifyOpcEsignContract,
  queryOpcEsignFlow,
  type OpcEsignFlowVerification,
} from "./opc-esign.ts";
import { putOpcContractArchive } from "./opc-contract-archive.ts";

function mockPdf(reference: string) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n% Mock signed OPC contract ${reference}\n%%EOF\n`,
    "utf8",
  );
}

export async function reconcileOpcSignatureFlow(flowId: string) {
  const preparation = await getOpcSignatureArchivePreparationByFlow(flowId);
  if (preparation.archive.status === "archived") return preparation;
  let verification: OpcEsignFlowVerification;
  if (preparation.provider === "mock") {
    verification = preparation.signatureStatus === "completed"
      ? { status: "completed", fullySigned: true, signerCount: 2 }
      : { status: "awaiting_signer", fullySigned: false, signerCount: 0 };
  } else {
    verification = await queryOpcEsignFlow(flowId);
  }
  await applyOpcSignatureStatusByFlow(flowId, verification.status);
  if (verification.status !== "completed" || !verification.fullySigned) {
    return getOpcSignatureArchivePreparationByFlow(flowId);
  }
  const claim = await claimOpcSignatureArchive(flowId);
  if (!claim.claimed || !claim.claimId) return getOpcSignatureArchivePreparationByFlow(flowId);

  try {
    const verified = preparation.provider === "mock"
      ? (() => {
          const pdf = mockPdf(preparation.reference);
          return {
            pdf,
            sha256: createHash("sha256").update(pdf).digest("hex"),
            verifiedAt: new Date().toISOString(),
            signerCount: 2,
            evidence: [],
          };
        })()
      : await downloadAndVerifyOpcEsignContract(flowId, preparation.fileId, verification.signerCount);
    const archived = await putOpcContractArchive({
      reference: preparation.reference,
      pdf: verified.pdf,
      manifest: {
        schemaVersion: 1,
        orderReference: preparation.reference,
        signFlowId: flowId,
        providerFileId: preparation.fileId,
        sha256: verified.sha256,
        verifiedAt: verified.verifiedAt,
        signerCount: verified.signerCount,
        evidence: verified.evidence,
      },
    });
    await completeOpcSignatureArchive(flowId, claim.claimId, {
      objectKey: archived.objectKey,
      manifestKey: archived.manifestKey,
      sha256: verified.sha256,
      sizeBytes: archived.sizeBytes,
      verifiedAt: verified.verifiedAt,
      archivedAt: archived.archivedAt,
      retainUntil: archived.retainUntil,
      evidence: verified.evidence,
    });
    return getOpcSignatureArchivePreparationByFlow(flowId);
  } catch (error) {
    await markOpcSignatureArchiveFailed(flowId, claim.claimId);
    throw error;
  }
}
