const CryptoJS = require('crypto-js');
require('dotenv').config();

// Encrypt data
const encrypt = async (data) => {
    const base64Key = await createSecret();
    const key = CryptoJS.enc.Base64.parse(base64Key);
    const iv = CryptoJS.lib.WordArray.random(16);

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    // Prepend IV to ciphertext
    const combined = iv.concat(encrypted.ciphertext);
    return CryptoJS.enc.Base64.stringify(combined);
};

// Decrypt data
const decrypt = async (base64EncryptedString) => {
    const base64Key = await createSecret();
    const key = CryptoJS.enc.Base64.parse(base64Key);

    const combined = CryptoJS.enc.Base64.parse(base64EncryptedString);
    const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), 16); // first 16 bytes
    const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - 16);

    const decrypted = CryptoJS.AES.decrypt({ ciphertext: ciphertext }, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedText);
};

// Create consistent secret
const createSecret = async () => {
    const apiKey = process.env.EDAPI_KEY ;
    const secretKey = process.env.EDSECRET_KEY ;
    const apiKeyPart = apiKey.split('-').slice(0, 2).join('');
    const combined = `${secretKey}${apiKeyPart}`;

    // Ensure 256-bit key for AES
    const hash = CryptoJS.SHA256(combined); // 256-bit hash
    return CryptoJS.enc.Base64.stringify(hash);
};

module.exports = { encrypt, decrypt };
