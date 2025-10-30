const crypto = require('crypto');

function generateKeys() {
  const apiKey = crypto.randomBytes(16).toString("hex"); 
  const secretKey = crypto.randomBytes(32).toString("base64");

  return { apiKey, secretKey };
}

// Example usage
const { apiKey, secretKey } = generateKeys();

console.log("API Key:", apiKey);
console.log("Secret Key:", secretKey);
