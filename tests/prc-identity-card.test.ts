import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidPrcIdentityCard,
  maskPrcIdentityCard,
  normalizePrcIdentityCard,
} from "../lib/prc-identity-card.ts";
import {
  isValidOpcOrderReference,
  normalizeOpcOrderReference,
} from "../lib/opc-order-reference.ts";

test("PRC identity card validation normalizes case and verifies date and checksum", () => {
  assert.equal(normalizePrcIdentityCard("110105 19491231002x"), "11010519491231002X");
  assert.equal(isValidPrcIdentityCard("11010519491231002x"), true);
  assert.equal(isValidPrcIdentityCard("11010519491331002X"), false);
  assert.equal(isValidPrcIdentityCard("110105194912310021"), false);
  assert.equal(isValidPrcIdentityCard("00000019491231002X"), false);
  assert.equal(maskPrcIdentityCard("11010519491231002X"), "110105********002X");
});

test("OPC order references share one normalization and validation contract", () => {
  assert.equal(normalizeOpcOrderReference(" opc-20260811-abcdef123456 "), "OPC-20260811-ABCDEF123456");
  assert.equal(isValidOpcOrderReference(" opc-20260811-abcdef123456 "), true);
  assert.equal(isValidOpcOrderReference("OPC-20260811-TOO-SHORT"), false);
});
