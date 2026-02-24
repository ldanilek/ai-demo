import { generateKeyPairSync } from "crypto";
import { execFileSync } from "child_process";

const previewName = process.env.PREVIEW_NAME;
if (!previewName) {
  console.error("PREVIEW_NAME not set");
  process.exit(1);
}

const previewArgs = ["--preview-name", previewName];

// Check if JWT_PRIVATE_KEY is already set
const existing = execFileSync(
  "npx",
  ["convex", "env", "get", "JWT_PRIVATE_KEY", ...previewArgs],
  { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
).trim();

if (existing) {
  console.log("JWT_PRIVATE_KEY already set on preview deployment, skipping auth key setup.");
  process.exit(0);
}

console.log("Generating JWT key pair for preview deployment auth...");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const jwk = await crypto.subtle.importKey(
  "spki",
  Buffer.from(
    publicKey
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, ""),
    "base64"
  ),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  true,
  ["verify"]
);
const exportedJwk = await crypto.subtle.exportKey("jwk", jwk);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...exportedJwk }] });

execFileSync("npx", ["convex", "env", "set", "JWT_PRIVATE_KEY", privateKey, ...previewArgs], {
  stdio: "inherit",
});
execFileSync("npx", ["convex", "env", "set", "JWKS", jwks, ...previewArgs], {
  stdio: "inherit",
});

console.log("Auth keys configured on preview deployment.");
