import { generateKeyPairSync } from "crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

// Convert the public key to JWK format
const jwk = await crypto.subtle.importKey(
  "spki",
  Buffer.from(
    publicKey
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, ""),
    "base64"
  ),
  {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
  },
  true,
  ["verify"]
);

const exportedJwk = await crypto.subtle.exportKey("jwk", jwk);
const jwks = {
  keys: [
    {
      use: "sig",
      ...exportedJwk,
    },
  ],
};

console.log("JWT_PRIVATE_KEY:");
console.log(privateKey);
console.log("\nJWKS:");
console.log(JSON.stringify(jwks, null, 2));
