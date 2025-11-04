const axios = require('axios');
const jwt = require("jsonwebtoken");
const path = require("path");

const {encrypt} = require('./encDec');



const callFreshserviceAPI = async ({
  method = "GET",
  endpoint = "",
  data = null,
  apiKey,
  domain,
  maxRetries = 15,
  retryLogic
}) => {
  const url = `https://${domain}/api/v2/${endpoint}`;
  console.log(url);
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      // Handle rate limit (429)
      if (error.response?.status === 429) {
        attempt++;
        const retryAfter =
          parseInt(error.response.headers["retry-after"]) || attempt * 2;
        console.warn(
          `Rate limit hit. Retrying in ${retryAfter}s (Attempt ${attempt}/${maxRetries})`
        );
        
        if(retryLogic){
          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000)
          );
        }
        else{
          return {
            success: false,
            status: 429,
            error: error.response?.data || error.message,
            retryAfter
          };
        }

      } else {
        // Non-rate-limit errors
        console.error(
          `Freshservice API ${method} ${endpoint} failed:`,
          error.response?.data || error.message
        );
        return {
          success: false,
          status: error.response?.status || 500,
          error: error.response?.data || error.message,
        };
      }
    }
  }

  return {
    success: false,
    status: 429,
    error: "Max retry attempts reached due to rate limiting",
  };
};

const generateSignatureUrl = (domain, ticketId,requesterName,requesterId) => {
  const token = jwt.sign({ domain,ticketId,appCode:'QRSIGRCK',requesterName,requesterId }, process.env.JWT_SECRET, { expiresIn: "365d" });
  return  `${process.env.REACT_SITE}?auth=${token}` 
};

// Helper to call Freshservice API
const fetchFS = (endpoint,decAPIKey,domain) =>
  callFreshserviceAPI({
    method: "GET",
    endpoint,
    data: null,
    apiKey: decAPIKey,
    domain,
    maxRetries: 15,
    retryLogic: true,
  });


const getConsumableType = async (decAPIKey,domain) => {
  let page = 1;
  let foundItem = null;

  while (true) {
    const response = await fetchFS(`asset_types?per_page=100&page=${page}`,decAPIKey,domain);

    // Assuming response.data or response.asset_types contains the list
    const types = response?.data?.asset_types || response?.asset_types || [];

    // Check for match
    foundItem = types.find((item) => item.name === "Consumable");

    if (foundItem) {
      // console.log(`✅ Found Consumable type:`, foundItem);
      break;
    }

    // Stop if no more data
    if (types.length < 100) {
      console.log("❌ Consumable type not found in any page.");
      break;
    }

    page++;
  }

  return foundItem?.id ?? null;
};

const fetchAllPages = async (baseEndpoint, decAPIKey, domain,key,maxSize) => {
  let page = 1;
  let allResults = [];

  while (true) {
    const endpoint = `${baseEndpoint}${baseEndpoint.includes("?") ? "&" : "?"}page=${page}`;
    console.log(endpoint);
    const response = await fetchFS(endpoint, decAPIKey, domain);

    // Try to get array from response (Freshservice returns either .data or direct array)
    const pageItems = response?.data?.[key];
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break; // no more results
    }

    allResults.push(...pageItems);

    if (pageItems.length < maxSize) break; // last page reached
    page++;
  }

  console.log(`✅ Fetched ${allResults.length} total records from ${baseEndpoint}`);
  return allResults;
};

async function encryptFileName(filename) {
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const encrypted = await encrypt(name); 
    return `${encrypted}${ext}`;
}


module.exports = {callFreshserviceAPI,generateSignatureUrl,getConsumableType,fetchFS,fetchAllPages,encryptFileName}