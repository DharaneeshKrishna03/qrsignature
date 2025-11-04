const QRCode = require("qrcode");
const cheerio  = require('cheerio');
const axios = require('axios');
const FormData = require("form-data")


const { uploadBase64ToBlob,updateItemFieldsInCosmos,upsertDataToCosmos, getTicketsByAsset,getAssetTicketCount,getAssetQuantityCount,getDataFromCosmos } = require("../Functions/cosmos");
const { callFreshserviceAPI,generateSignatureUrl,getConsumableType,fetchFS,fetchAllPages,encryptFileName } = require("../Utils/freshservice");
const { decrypt } = require("../Utils/encDec");
const { all } = require("axios");


const generateQRSign = async (req, res) => {
  try {
    const { ticketId, domain, type, requesterName, requesterId } = req.body;

    if (!ticketId || !domain || !type) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields in request body.",
      });
    }

    const ticketUrl = `https://${domain}/a/tickets/${ticketId}`;
    const qrBase64 = await QRCode.toDataURL(ticketUrl);

    const fileName = `QR-${ticketId}.png`;
    const encFileName = await encryptFileName(fileName);

    const cfUrl = await uploadBase64ToBlob(
      qrBase64,
      `QRImages/${domain}`,
      encFileName
    );
    console.log("✅ CloudFront URL:", cfUrl);

    res.status(200).json({
      status: 200,
      message: "QR Generated successfully.",
      data: {
        qrUrl: cfUrl,
      },
    });

    const updatedDescription = `<img id="qrImage" src="${cfUrl}" width="70px" height="70px"/>`;
    const updatePayload = {
      ticketId,
      type,
      fieldValues: { description: updatedDescription },
      requesterName,
      requesterId
    };

    const updateBody = {
      body: updatePayload,
      client: req.client,
      needQr : req.body.needQr,
      needSign : req.body.needSign,
      signType : req.body.signType
    };

    await updateTicket(updateBody);
  } catch (error) {
    console.error("Error in generateQRSign:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const updateTicket = async (req) => {
  try {
    const { ticketId, type, fieldValues,requesterName,requesterId } = req.body;

    const clientData = req.client;
    const encAPIKey = clientData?.fsApiKey;
    const decAPIKey = await decrypt(encAPIKey);
    const clientDomain = clientData?.domain;

    const fieldKeys = Object.keys(fieldValues);

    let updationPayload = fieldValues;

    if (fieldKeys.includes("description")) {
      const rawTicketData = await callFreshserviceAPI({
        method: "GET",
        endpoint: `tickets/${ticketId}`,
        data: null,
        apiKey: decAPIKey,
        domain: clientDomain,
        maxRetries: 15,
        retryLogic: true,
      });

      let ticketDescription = rawTicketData?.data?.ticket?.description;

      let signatureUrl;

      const needQr = req.needQr;
      const needSign = req.needSign;
      const signType = req.signType;

      if(type === 'Service Request'){
        signatureUrl = await generateSignatureUrl(clientDomain, ticketId,requesterName,requesterId);
      }

      const $ = cheerio.load(ticketDescription);

      // Remove the div only if it exists
      if ($("#serviceBlock").length > 0) {
        console.log("Yes");
        $("#serviceBlock").remove();
        console.log($.html());
        ticketDescription = $.html()
      }


      const updatedDescription =
                              type === "Service Request"
                                ? `
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                              <div style="width:85%;word-break:break-word;">
                                ${ticketDescription}
                              </div>
                              <div id="serviceBlock" style="width:15%;display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;">
                                <div style="margin-bottom:10px;">${fieldValues["description"]}</div>
                                ${needSign
                                  ? signType === "get"
                                    ? `<div id="signatureBlock" style="text-align:center;">
                                        <a id="signaturePresent" href="${signatureUrl}" target="_blank" rel="noreferrer"
                                          style="display:inline-block;padding:8px 15px;background-color:#1b3e59;color:#ffffff;
                                                text-decoration:none;font-size:13px;border-radius:5px;font-weight:500;">
                                          Get Signature
                                        </a>
                                      </div>`
                                    : `<div style="
                                        display:inline-flex;
                                        align-items:center;
                                        background-color:#ffffff;
                                        color:#1b3e59;
                                        padding:10px 15px;
                                        border-radius:5px;
                                        font-size:13px;
                                        font-weight:500;
                                        box-shadow:0 1px 3px rgba(0,0,0,0.1);
                                        margin-bottom:10px;
                                      ">
                                        <span id="signaturePresent" style="color:#28a745;font-size:16px;margin-right:8px;">✔</span>
                                        Signed
                                      </div>`
                                  : ""}       
                              </div>
                            </div>`
                                : `
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                              <div style="width:90%;word-break:break-word;">
                                ${ticketDescription}
                              </div>
                              <div id="serviceBlock" style="width:10%;display:flex;justify-content:flex-end;align-items:flex-start;flex-shrink:0;">
                                ${fieldValues["description"]}
                              </div>
                            </div>`;

      updationPayload.description = updatedDescription;
    }


    const updateTicketRes = await callFreshserviceAPI({
      method: "PUT",
      endpoint: `tickets/${ticketId}?bypass_mandatory=true`,
      data: updationPayload,
      apiKey: decAPIKey,
      domain: clientDomain,
      retryLogic: true,
    });

    if (updateTicketRes.status === 200 || updateTicketRes.status === 201) {
      return {
        status: 200,
        message: "Ticket Updated Successfully.",
      };
    } else {
      return {
        status: 500,
        message: "Ticket Update Failed.",
      };
    }
  } catch (error) {
    console.error("Error in updateticket:", error);
    return {
      status: 500,
      message: "Internal server error.",
      error: error.message,
    };
  }
};

const triggerSignature = async (req,res) => {
  try{
    const {name,domain,ticketId,signature,requesterId,signUrl} = req.body;

    const response = await axios.post(signUrl,{
      name,
      domain,
      ticketId,signature,
      requesterId
    });

    if(response.status === 200){
      return res.status(200).json({message : "Triggered Signature Successfully.",status:200});
    }
    else{
      console.log("Error Occured : ",response);
      return res.status(500).json({message : "Signature Trigger Failed.",status:200});
    }
  }
  catch(error){
    console.error("Error in triggerSignature:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }




}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const addSignatureNote = async ({
  name,
  base64Data,
  cfUrl,
  fileName = "signature.png",
  ticketId,
  requesterId,
  decAPIKey,
  domain,
  maxRetries = 15,
  baseDelay = 60000, // ms
}) => {
  try {
    const noteBody = `
      <div style="text-align: left;">
              <h3 style="font-weight: 500; margin-bottom: 20px;">${name}</h3>
              <img src="${cfUrl}" alt="Inline Image" style="display: inline-block; width: 250px; height: auto;">
            </div>
    `;

    // Extract base64 parts
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid base64 image data");

    const buffer = Buffer.from(matches[2], "base64");
    const mimeType = matches[1];

    const url = `https://${domain}/api/v2/tickets/${ticketId}/notes`;
    const auth = Buffer.from(`${decAPIKey}:X`).toString("base64");
    

    let attempt = 0;
    let hasRetriedWithoutUser = false;

    while (attempt < maxRetries) {
      try {

        const form = new FormData();
        form.append("body", noteBody);
        if (requesterId && !hasRetriedWithoutUser) {
          form.append("user_id", requesterId);
        }
        form.append("attachments[]", buffer, {
          filename: fileName,
          contentType: mimeType,
        });

        const response = await axios.post(url, form, {
          headers: {
            Authorization: `Basic ${auth}`,
            ...form.getHeaders(),
          },
        });

        console.log("✅ Note created successfully:", response.data);
        return {
          success: true,
          data: response.data,
          status: response.status,
        };
      } catch (error) {
        const status = error.response?.status;
        const responseData = error.response?.data;

        console.log(error);

        // 403 handling — retry once without user_id
        if (status === 403 && !hasRetriedWithoutUser && requesterId) {
          console.warn("⚠️ 403 Forbidden — retrying note creation without user_id...");
          hasRetriedWithoutUser = true;
          continue;
        }

        // 429 handling — rate limit
        if (status === 429) {
          const retryAfterHeader = error.response?.headers["retry-after"];
          const retryAfter =
            retryAfterHeader && !isNaN(retryAfterHeader)
              ? parseInt(retryAfterHeader) * 1000
              : baseDelay * Math.pow(2, attempt);

          console.warn(
            `⏳ Rate limit hit (429). Retrying in ${retryAfter / 1000}s (attempt ${
              attempt + 1
            }/${maxRetries})...`
          );
          await sleep(retryAfter);
          attempt++;
          continue;
        }

        // For any other error, stop retries and throw
        console.error(
          `❌ Freshservice note creation failed (status ${status}):`,
          responseData || error.message
        );
        return {
          success: false,
          status: status || 500,
          error: responseData || error.message,
        };
      }
    }

    return {
      success: false,
      status: 429,
      error: "Max retry attempts reached due to rate limiting",
    };
  } catch (error) {
    console.error("❌ Error adding signature note:", error);
    return {
          success: false,
          status: 500,
          error: error.message,
        };
  }
};

const addSignature = async (req, res) => {
  try {
    const { ticketId, domain, name, signature, requesterId } = req.body;

    if (!ticketId || !domain || !name || !signature) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields in request body.",
      });
    }

    const clientData = req.client;
    const encAPIKey = clientData?.fsApiKey;
    const decAPIKey = await decrypt(encAPIKey);

    const fileName = `Sign-${ticketId}.png`;
    const encFileName = await encryptFileName(fileName);

    const cfUrl = await uploadBase64ToBlob(
      signature,
      `SignatureImages/${domain}`,
      encFileName
    );

    console.log("✅ CloudFront URL:", cfUrl);

    res.status(200).json({
      status: 200,
      message: "Signature added successfully.",
    });


    let noteResponse = await addSignatureNote({
      name,
      base64Data : signature,
      cfUrl,
      fileName,
      ticketId,
      requesterId,
      decAPIKey,
      domain,
      maxRetries : 15,
      baseDelay : 60000, 
    });

    if (noteResponse.status === 200 || noteResponse.status === 201) {
      console.log("Note Created Successfully.");

      // Fetch raw ticket data
      const rawTicketData = await callFreshserviceAPI({
        method: "GET",
        endpoint: `tickets/${ticketId}`,
        data: null,
        apiKey: decAPIKey,
        domain,
        maxRetries: 15,
        retryLogic: true,
      });

      const ticketDescription = rawTicketData?.data?.ticket?.description;

      const $ = cheerio.load(ticketDescription);

      $('#signatureBlock').html(`
        <div id="signatureBlock" style="
          display: inline-flex;
          align-items: center;
          background-color: #ffffff;
          color: #1b3e59;
          padding: 10px 15px;
          border-radius: 5px;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        ">
          <span style="color: #28a745; font-size: 16px; margin-right: 8px;">✔</span>
          Signed
        </div>
      `);

      // Replace signature block with signed success
      const modifiedDescription = $.html();

      // Update ticket
      const updateTicketRes = await callFreshserviceAPI({
        method: "PUT",
        endpoint: `tickets/${ticketId}?bypass_mandatory:true`,
        data: { description: modifiedDescription },
        apiKey: decAPIKey,
        domain,
        retryLogic: true,
      });

      if (updateTicketRes.status === 200 || updateTicketRes.status === 201) {
        console.log("Ticket Updated Successfully.");
      } else {
        console.warn("Ticket Update Failed.");
      }
    } else {
      console.warn("Note creation failed, ticket not updated.");
    }

  } catch (error) {
    console.error("Error in addSignature:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

//Asset Tracker
const getAssociations = async (req, res) => {
  const { displayId, page, nextIds = [] } = req.body;
  const perPage = 10;
  const batchSize = 10;

  if (!displayId || !page) {
    return res.status(400).json({
      status: 400,
      message: "Missing required fields in request body.",
    });
  }

  try {
    const clientData = req.client;
    const decAPIKey = await decrypt(clientData?.fsApiKey);
    const domain = clientData?.domain;

    let fetchNextPage = true;
    let nextIdsOut = [];
    let fetchIds = [];
    let retryAfter = null;
    const fetchedTickets = [];

    // Helper to call Freshservice API
    const fetchFS = (endpoint) =>
      callFreshserviceAPI({
        method: "GET",
        endpoint,
        data: null,
        apiKey: decAPIKey,
        domain,
        maxRetries: 15,
        retryLogic: false,
      });

    // STEP 1: Determine which IDs to fetch
    if (nextIds.length === 0) {
      const associations = await fetchFS(
        `assets/${displayId}/requests?per_page=${perPage}&page=${page}`
      );
      if (associations.status === 429) {
        return res.status(200).json({
          status: 429,
          message: `Rate limit reached. Retry after ${associations?.retryAfter} seconds.`,
          retryAfter: associations?.retryAfter,
          data: [],
          nextPage: page,
          isLast: false,
          nextIdsOut: [],
        });
      }

      if (associations.status !== 200) {
        return res.status(associations.status).json({
          status: associations.status,
          message: "Failed to fetch associations.",
        });
      }

      const requests = associations?.data?.requests || [];
      fetchNextPage = requests.length >= perPage;

      fetchIds = requests
        .map((r) => r.request_id)
        .filter((id) => id.includes("SR-"))
        .map((id) => Number(id.replace("SR-", "")));
    } else {
      fetchIds = nextIds;
    }

    // STEP 2: Fetch ticket details in batches
    for (let i = 0; i < fetchIds.length; i += batchSize) {
      const batch = fetchIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((id) => fetchFS(`tickets/${id}?include=requester,assets`))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const resData = result.value;
          if (resData.status === 200) {
            const t = resData.data?.ticket;
            const assetInfo = t?.assets?.find(
              (a) => a.display_id === displayId
            );

            fetchedTickets.push({
              ticketId: `SR#${t?.id}`,
              requesterName: t?.requester?.name,
              requesterEmail: t?.requester?.email,
              assetQuantity: assetInfo?.quantity || 0,
            });
          } else if (resData.status === 429) {
            retryAfter = resData.retryAfter || 60;
            break;
          }
        }
      }
      if (retryAfter) break;
    }

    // STEP 3: Fetch next page IDs if needed
    if (fetchNextPage && !retryAfter) {
      const nextPageNum = page + 1;
      const nextResp = await fetchFS(
        `assets/${displayId}/requests?per_page=${perPage}&page=${nextPageNum}`
      );

      if (nextResp.status === 429) {
        return res.status(200).json({
          status: 429,
          message: `Rate limit reached. Retry after ${nextResp?.retryAfter} seconds.`,
          retryAfter: nextResp?.retryAfter,
          data: fetchedTickets,
          nextPage: page,
          isLast: false,
          nextIdsOut: [],
        });
      }

      if (nextResp.status === 200) {
        const nextReqs = nextResp?.data?.requests || [];
        fetchNextPage = nextReqs.length >= perPage;
        nextIdsOut = nextReqs
          .map((r) => r.request_id)
          .filter((id) => id.includes("SR-"))
          .map((id) => Number(id.replace("SR-", "")));
      }
    }

    // STEP 4: Final Response
    const nextPage = retryAfter ? page : page + 1;

    return res.status(200).json({
      status: retryAfter ? 429 : 200,
      message: retryAfter
        ? `Rate limit reached. Retry after ${retryAfter} seconds.`
        : "Tickets fetched successfully.",
      retryAfter: retryAfter || null,
      data: fetchedTickets,
      nextPage: nextIdsOut.length > 0 ? nextPage : null,
      isLast: nextIdsOut.length === 0,
      nextIdsOut,
    });
  } catch (error) {
    console.error("Error fetching associations:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const initialScan = async (req,res) => {
  const {domain} = req.body;

  const clientData = req.client;
  const encAPIKey = clientData?.fsApiKey;
  const decAPIKey = await decrypt(encAPIKey);

  res.status(200).json({
    message: "Scan Triggered Successfully",
    status : 200
  });

  //Get Consumable Type ID
  const consumableAssetId = await getConsumableType(decAPIKey,domain);

  // console.log(consumableAssetId);

  if(consumableAssetId){
    let newClient = clientData;
    // delete newClient.domain;

    newClient.consumableId = consumableAssetId;

    const updationStatus = await updateItemFieldsInCosmos({
          containerId: process.env.ASSET_CLIENT_TABLE, 
          id : clientData?.id,
          partitionKey : domain,
          updates : newClient,
        });
    // await updateDynamoItem(process.env.ASSET_CLIENT_TABLE,'domain',domain,null,null,newClient);

    if(updationStatus.status === 200){
      //Get All Consumable Assets
      const allConsumableAssets = await fetchAllPages(`assets?filter="asset_type_id:${consumableAssetId}"`,decAPIKey,domain,'assets',30);

      const consumableAssetIds = allConsumableAssets.map(item => item.display_id);

      for(const assetId of consumableAssetIds){
        const allAssociations = await fetchAllPages(`assets/${assetId}/requests?per_page=100`,decAPIKey,domain,'requests',100);
        // console.log(allAssociations);

        const fetchIds = allAssociations.map((r) => r.request_id)
        .filter((id) => id.includes("SR-"))
        .map((id) => Number(id.replace("SR-", "")));

        const BATCH_SIZE = 10;

        let ASSET_TOTAL_QUANTITY = 0;

        for (let i = 0; i < fetchIds.length; i += BATCH_SIZE) {
          const batch = fetchIds.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(
            batch.map(async (ticketId) => {
              const rawTicketData = await fetchFS(
                `tickets/${ticketId}?include=requester,assets`,
                decAPIKey,
                domain
              );

              if (rawTicketData.status === 200) {
                const ticketData = rawTicketData.data?.ticket;
                const assetInfo = ticketData?.assets?.find(
                  (a) => a.display_id === assetId
                );

                const rowData = {
                  domain,
                  assetId: `A#${assetId}#T${ticketData?.id}`,
                  assetNo: assetId,
                  ticketId: ticketData?.id,
                  ticketData: {
                    ticketId: `SR#${ticketData?.id}`,
                    requesterName: ticketData?.requester?.name,
                    requesterEmail: ticketData?.requester?.email,
                    assetQuantity: assetInfo?.quantity || 0,
                  },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                ASSET_TOTAL_QUANTITY += assetInfo?.quantity || 0;

                await upsertDataToCosmos({
                      containerId: process.env.ASSET_USER_DATA_TABLE, 
                      item : rowData,
                      partitionKey : domain});
              }
            })
          );

        }

        const countPayload = {
          domain,
          assetId: assetId,
          count : ASSET_TOTAL_QUANTITY
        }
        await upsertDataToCosmos({
                      containerId: process.env.ASSET_COUNT_TABLE, 
                      item : countPayload,
                      partitionKey : domain});
      }
    }
  }
}

const getAssetsUsers = async (req,res) => {
  try{
    const {domain,assetId,nextPageToken} = req.body;

    const [ticketCount,ticketQuantityCount,ticketsData] = await Promise.all([
      getAssetTicketCount(domain, assetId),
      getAssetQuantityCount(domain,assetId),
      getTicketsByAsset(domain, assetId, nextPageToken, Number(process.env.PAGE_LIMIT)),
    ]);

    return res.status(200).json({status:200,ticketQuantityCount, count:ticketCount, ...ticketsData})
  } 
  catch(error){
    console.error("Error fetching assetusers:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }

};

const insertAssetUser = async (req,res) => {
  const {domain,ticketId,requesterEmail,requesterName} = req.body;

  const clientData = req.client;
  const encAPIKey = clientData?.fsApiKey;
  const decAPIKey = await decrypt(encAPIKey);
  const consumableAssetId = clientData.consumableId;

  res.status(200).json({
    message: "Insertion Triggered Successfully",
    status : 200
  });

  const rawTicketData = await fetchFS(
                `tickets/${ticketId}?include=assets`,
                decAPIKey,
                domain
              );
  if (rawTicketData.status === 200) {
    const ticketData = rawTicketData.data?.ticket;
    const assetsInfo = ticketData?.assets?.filter(
      (a) => a.ci_type_id === consumableAssetId
    );  
    const batchSize = 10;

    // console.log("Available Assets : ",assetsInfo);

    for (let i = 0; i < assetsInfo.length; i += batchSize) {
      const batch = assetsInfo.slice(i, i + batchSize);
      // Prepare promises for current batch
      const insertPromises = batch.map(async (asset) => {
        const assetId = asset?.display_id;
        const assetQuantity = asset?.quantity;
        const rowData = {
          domain,
          assetId: `A#${assetId}#T${ticketId}`,
          assetNo: assetId,
          ticketId: ticketId,
          ticketData: {
            ticketId: `SR#${ticketId}`,
            requesterName: requesterName,
            requesterEmail: requesterEmail,
            assetQuantity: assetQuantity || 0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const checkAssetAlreadyThere = await getDataFromCosmos({
          containerId: process.env.ASSET_USER_DATA_TABLE,
          query: "SELECT * FROM c WHERE c.domain = @domain AND c.assetNo = @assetNo AND c.ticketId = @ticketId ",
          parameters: [
            { name: "@domain", value: domain }, { name: "@assetNo", value: assetId }, { name: "@ticketId", value: ticketId }
          ]
        });

        // console.log("checkAssetAlreadyThere : ",checkAssetAlreadyThere);

        let isAssetPresent = false;
        let assetQuantityId = null;
        let allAssetQuantity = null;
        
        // await getRowBySortKey(process.env.ASSET_USER_DATA_TABLE,"domain",domain,"assetId",`A#${assetId}#T${ticketId}`);

        let ASSET_TOTAL_QUANTITY = 0;

        if(checkAssetAlreadyThere.status === 200){
          const data = checkAssetAlreadyThere?.data;
          const previousCount = data?.ticketData?.assetQuantity;
          const presentCount = assetQuantity || 0;
          allAssetQuantity = presentCount;
          isAssetPresent = true;
          assetQuantityId = checkAssetAlreadyThere?.data?.id;
          const newCount = presentCount - previousCount;
          ASSET_TOTAL_QUANTITY = newCount;

        }
        else{
          ASSET_TOTAL_QUANTITY = assetQuantity || 0;
          isAssetPresent = false;
        }

        const checkAssetCount = await getDataFromCosmos({
          containerId: process.env.ASSET_COUNT_TABLE,
          query: "SELECT * FROM c WHERE c.domain = @domain AND c.assetId = @assetId",
          parameters: [
            { name: "@domain", value: domain }, { name: "@assetId", value: assetId }
          ]
        });

        // console.log("checkAssetCount : ",checkAssetCount);
        
        // await getRowBySortKey(process.env.ASSET_COUNT_TABLE,"domain",domain,"assetId",assetId);
        let assetCountpayload = {};

        if(checkAssetCount.status === 200){
          const presentCount = checkAssetCount?.data?.count;
          const newAssetCount = presentCount + ASSET_TOTAL_QUANTITY;

          assetCountpayload = {
            domain,
            assetId,
            count : newAssetCount
          }

          // console.log("if assetCountpayload : ",assetCountpayload);

          const existingId = checkAssetCount?.data?.id
          await updateItemFieldsInCosmos({
            containerId: process.env.ASSET_COUNT_TABLE, 
            id : existingId,
            partitionKey : domain,
            updates : assetCountpayload,
          });//Update count data 
          // await insertDynamoItem(process.env.ASSET_COUNT_TABLE,assetCountpayload); 
        }
        else{
          assetCountpayload = {
            domain,
            assetId,
            count : ASSET_TOTAL_QUANTITY
          }

          await upsertDataToCosmos({
            containerId: process.env.ASSET_COUNT_TABLE, 
            item : assetCountpayload,
            partitionKey : domain}); //Add count data 
          // await insertDynamoItem(process.env.ASSET_COUNT_TABLE,assetCountpayload);
        };

        if(isAssetPresent){
          let newPayload = checkAssetAlreadyThere?.data;
          newPayload.ticketData.assetQuantity = allAssetQuantity;
          return await updateItemFieldsInCosmos({
            containerId: process.env.ASSET_USER_DATA_TABLE, 
            id : assetQuantityId,
            partitionKey : domain,
            updates : newPayload,
          });
        }
        else{
          return await upsertDataToCosmos({
            containerId: process.env.ASSET_USER_DATA_TABLE, 
            item : rowData,
            partitionKey : domain});
        }

        // return insertDynamoItem(process.env.ASSET_USER_DATA_TABLE, rowData);
      });

      // Wait for current batch to finish
      const data = await Promise.all(insertPromises);
      // console.log(data);
    }
  }


}

module.exports = { generateQRSign, getAssociations,addSignature,initialScan,getAssetsUsers,insertAssetUser,triggerSignature};
