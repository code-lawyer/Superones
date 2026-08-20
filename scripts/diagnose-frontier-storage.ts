import { getFrontierStorageDiagnostics } from "../lib/frontier/diagnostics.ts";

const diagnostics = await getFrontierStorageDiagnostics();
console.log(JSON.stringify({
  status: diagnostics.normalizationRecommended ? "review-normalization" : "no-application-trigger-observed",
  ...diagnostics,
}, null, 2));
