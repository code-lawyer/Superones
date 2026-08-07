import "server-only";

// Compatibility facade. Production callers use the focused modules under
// lib/opc-orders; existing integrations can keep their stable import path.
export * from "./opc-orders/index.ts";
