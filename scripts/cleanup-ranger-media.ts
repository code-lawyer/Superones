import { cleanupRangerAvatarMedia } from "../lib/managed-service-catalog.ts";

const result = await cleanupRangerAvatarMedia();
console.log(JSON.stringify({
  deleted: result.deleted.length,
  retained: result.retained.length,
  deletedKeys: result.deleted,
}, null, 2));
