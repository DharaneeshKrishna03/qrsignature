const axios = require('axios');
const CryptoJS = require('crypto-js');

const PAYMENT_SITE_URL = process.env.PAYMENT_SITE_URL;
const RCK_PAYMENT_ENCRPT_KEY = process.env.RCK_PAYMENT_ENCRYPTION_KEY;

const encryption = (data, encryptionKey) => {

    try {
        const encryptData = CryptoJS.AES.encrypt(
            JSON.stringify(data),
            encryptionKey
        ).toString();

        return encryptData;
    } catch (error) {
        console.error(`Encryption error - `, error);
    }
}

function decryption(encryptedData, key, block) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);

        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

        // Check if decryption was successful
        if (!decryptedText || decryptedText === "") {
            console.error(`Decryption failed: Empty result in ${block}`);
            return;
        }
        // Parse the decrypted data
        const decrypted = JSON.parse(decryptedText);
        return decrypted;
    } catch (error) {
        console.error(`Decryption error - ${block}`, error);
    }
}

const configureSubscription = async (payload) => {
    try {

        const encryptedPayload = encryption(payload, RCK_PAYMENT_ENCRPT_KEY);

        const api_paylod = {
            encryptedData: encryptedPayload
        }

        // const res = 
        await axios.post(
            `${PAYMENT_SITE_URL}api/payment-app/register`, api_paylod
        );

        // console.log("res ",res);


    } catch (err) {
        console.error("Error checking user:", err.response?.data || err.message, err.status);
        return {
            status: err.status,
            data: err.response?.data || err.message
        };
    }
}

module.exports = {configureSubscription}