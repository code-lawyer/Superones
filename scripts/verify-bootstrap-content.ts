import { verifyBootstrapManifest } from "./bootstrap-manifest.ts";

const manifest = await verifyBootstrapManifest();
console.log(JSON.stringify({
  ok: true,
  counts: manifest.counts,
  files: manifest.files,
}, null, 2));
