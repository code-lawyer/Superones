import "server-only";

import {
  createOpenAICompatibleClient,
  EDITORIAL_PROFILE_IDS,
  loadEditorialProfileConfig,
  type EditorialProfileId,
  type OpenAICompatibleConfig,
} from "./openai-compatible-client.ts";

export type EditorialProviderProbe = {
  profile: EditorialProfileId;
  route: "primary" | "fallback";
  providerHost: string;
  model: string;
  status: "ok";
};

async function probeRoute(
  profile: EditorialProfileId,
  route: "primary" | "fallback",
  config: OpenAICompatibleConfig,
  fetcher: typeof fetch,
): Promise<EditorialProviderProbe> {
  const response = await createOpenAICompatibleClient(config, fetcher).completeJson({
    task: "deployment_provider_probe",
    schemaVersion: "editorial-provider-probe/v1",
    instruction: "Return exactly one JSON object with ok=true. Do not add any other field or prose.",
    input: { ok: true },
  });
  if (
    typeof response !== "object"
    || response === null
    || (response as Record<string, unknown>).ok !== true
  ) {
    throw new Error(`${profile} 的 ${route} 模型未按探针协议返回 ok=true。`);
  }
  return {
    profile,
    route,
    providerHost: new URL(config.baseUrl).hostname,
    model: config.model,
    status: "ok",
  };
}

export async function verifyEditorialProviders(
  environment: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const results: EditorialProviderProbe[] = [];
  for (const profile of EDITORIAL_PROFILE_IDS) {
    const config = loadEditorialProfileConfig(profile, environment);
    results.push(await probeRoute(profile, "primary", config.primary, fetcher));
    if (config.fallback) {
      results.push(await probeRoute(profile, "fallback", config.fallback, fetcher));
    }
  }
  return results;
}
