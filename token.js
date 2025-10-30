const jwt = require("jsonwebtoken");
require("dotenv").config();

const domain = "rckqr.freshservice.com"
const secretKey = "9eba5114-dab0-4936-adac-f85b8b43c1f4" //QR
// const secretKey = "9eba5114-dab0-4936-adac-f85b8b43c1f4" //Asset

function generateToken() {
  if (!domain) {
    throw new Error("Both domain and secretKey are required");
  }

  const token = jwt.sign(
    { domain,appCode:"QRSIGRCK", },
    // { domain,appCode:"ATRCK", },
    secretKey, // use UUID as signing secret
    { expiresIn: "1h" } // optional expiry
  );

  return token;
}

module.exports = { generateToken };


const token = generateToken({ domain: domain, secretKey: secretKey });
console.log("Bearer " + token);
