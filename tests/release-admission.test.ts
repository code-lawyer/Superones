import assert from "node:assert/strict";
import test from "node:test";
import { isPublicInformationAdmitted, isRoutineReleaseCandidate } from "../lib/release-admission.ts";

test("routine and prerelease-style release channels are not admitted", () => {
  assert.equal(isRoutineReleaseCandidate({ originalTitle: "neovim/neovim released nightly" }), true);
  assert.equal(isRoutineReleaseCandidate({
    originalTitle: "Project build",
    sourceUrl: "https://github.com/example/project/releases/tag/canary",
  }), true);
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project snapshot" }), false);
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project v2.0", releasePrerelease: true }), false);
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project v2.0", releaseDraft: true }), false);
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project v2.0 draft" }), false);
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project v2.0 RC1" }), false);
});

test("stable releases and non-release posts remain admitted", () => {
  assert.equal(isPublicInformationAdmitted({ itemKind: "release", originalTitle: "Project v2.4.0" }), true);
  assert.equal(isPublicInformationAdmitted({ itemKind: "personal_post", originalTitle: "A nightly routine for teams" }), true);
});
