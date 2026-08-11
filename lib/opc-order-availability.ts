import "server-only";

export function opcOrderEntryAvailable(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.NODE_ENV === "production"
    ? environment.VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED === "true"
    : environment.VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED !== "false";
}
