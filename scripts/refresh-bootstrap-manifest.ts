import { refreshBootstrapManifest } from "./bootstrap-manifest.ts";

const manifest = await refreshBootstrapManifest();
console.log(JSON.stringify(manifest, null, 2));
