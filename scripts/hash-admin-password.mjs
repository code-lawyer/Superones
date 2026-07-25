import { argon2Sync, randomBytes } from "node:crypto";

const password = process.env.VAULT2077_ADMIN_PASSWORD_INPUT;
if (!password || password.length < 20) {
  throw new Error("请通过 VAULT2077_ADMIN_PASSWORD_INPUT 提供至少 20 个字符的待哈希密码。");
}

const nonce = randomBytes(16);
const parameters = { memory: 65_536, passes: 3, parallelism: 4 };
const derived = argon2Sync("argon2id", {
  message: Buffer.from(password, "utf8"),
  nonce,
  parallelism: parameters.parallelism,
  tagLength: 32,
  memory: parameters.memory,
  passes: parameters.passes,
});
console.log(
  `argon2id$v=1$m=${parameters.memory},t=${parameters.passes},p=${parameters.parallelism}`
  + `$${nonce.toString("base64url")}$${derived.toString("base64url")}`,
);
