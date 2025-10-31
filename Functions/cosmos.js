// services/generalService.js
const { CosmosClient } =  require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

require('dotenv').config()

const {
  AZURE_COSMOS_ENDPOINT,
  AZURE_COSMOS_KEY,
  AZURE_COSMOS_DATABASE,
} = process.env;

const cosmosClient = new CosmosClient({
  endpoint: AZURE_COSMOS_ENDPOINT,
  key: AZURE_COSMOS_KEY,
});

const database = cosmosClient.database(AZURE_COSMOS_DATABASE);

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER;

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

const upsertDataToCosmos = async ({ containerId, item, partitionKey }) => {
  try {
    const container = database.container(containerId);

    const { resource, headers } = await container.items.upsert(item, { partitionKey });

    const statusCode = headers?.["x-ms-status-code"] || 200;

    return {
      status: statusCode,
      message: "Item upserted successfully"
    };
  } catch (error) {
    console.error(`❌ Error upserting item into Cosmos DB: ${error.message}`);

    // Decide status code based on error
    let status = 500;
    if (error.code === 409) status = 400; // conflict
    else if (error.code === 400) status = 400; // bad request
    // You can add more mappings here if needed

    return {
      status,
      message: error.message
    };
  }
};

const getDataFromCosmos = async ({
  containerId,
  query = "SELECT * FROM c",
  parameters = []
}) => {
  try {
    const container = database.container(containerId);
    const querySpec = {
      query,
      parameters
    };

 
    const { resources: items } = await container.items.query(querySpec).fetchAll();
    if(items.length>0){
      return {status : 200 , data :items[0]};
    }
    else{
      return {status : 404 , data :items};
    }
    
  } catch (error) {
    console.log(`Error querying Cosmos DB:`, error.message);
    return {status : 500, data: []};
  }
};
 
const updateItemFieldsInCosmos = async ({
  containerId,
  id,
  partitionKey,
  updates = {}
}) => {
  try {
    const container = database.container(containerId);

    const { resource: existingItem } = await container.item(id, partitionKey).read();

    if (!existingItem) {
      return { status: 404, message: `Item with id ${id} not found`, data: null };
    }
    const updatedItem = { ...existingItem, ...updates };

    const { resource: result } = await container.items.upsert(updatedItem, { partitionKey });

    return { status: 200, message: "Item updated successfully", data: result };
  } catch (error) {
    console.error(
      `❌ Error updating item fields in Cosmos DB at updateItemFieldsInCosmos: ${error.message}`
    );
    return { status: 500, message: error.message, data: null };
  }
};

const getAssetTicketCount = async (domainString, assetNo) => {
  try {
    const container = database.container(process.env.ASSET_USER_DATA_TABLE);

    // ✅ Build a query like DynamoDB’s KeyConditionExpression
    const querySpec = {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.domain = @domain AND STARTSWITH(c.assetId, @assetPrefix)",
      parameters: [
        { name: "@domain", value: domainString },
        { name: "@assetPrefix", value: `A#${assetNo}#` },
      ],
    };

    const { resources } = await container.items
      .query(querySpec, { enableCrossPartitionQuery: true })
      .fetchAll();

    const count = resources[0] || 0;

    console.log(`✅ Count for Asset ${assetNo} in ${domainString}: ${count}`);
    return count;
  } catch (error) {
    console.error("❌ Error counting asset tickets:", error.message);
    return 0;
  }
};

const getAssetQuantityCount = async (domain, assetId) => {
  try {
        
    const result = await getDataFromCosmos({
          containerId: process.env.ASSET_COUNT_TABLE,
          query: "SELECT * FROM c WHERE c.domain = @domain AND c.assetId = @assetId",
          parameters: [
            { name: "@domain", value: domain }, { name: "@assetId", value: assetId }
          ]
        });

    let count = 0;
    if(result.status === 200){
        count = result?.data?.count;
    }
    console.log(`✅ Count for Asset ${assetId} in ${domain}: ${count}`);
    return count || 0;
  } catch (error) {
    console.error("❌ Error counting asset tickets:", error);
    return 0;
  }
};

const getTicketsByAsset = async (
  domainString,
  assetNo,
  continuationToken = null,
  limit = 300
) => {
  try {
    const container = database.container(process.env.ASSET_USER_DATA_TABLE);

    const querySpec = {
      query:
        "SELECT c.ticketData FROM c WHERE c.domain = @domain AND c.assetNo = @assetNo",
      parameters: [
        { name: "@domain", value: domainString },
        { name: "@assetNo", value: assetNo },
      ],
    };
  
    console.log(querySpec);

    const options = {
      maxItemCount: limit,
      continuationToken, 
      enableCrossPartitionQuery: true,
    };

    const iterator = container.items.query(querySpec, options);
    const { resources: items, continuationToken: nextToken } =
      await iterator.fetchNext();

    console.log(
      `✅ Found ${items?.length || 0} tickets for Asset ${assetNo} in ${domainString}`
    );

    const modifiedData = items?.map((item) => item.ticketData) || [];

    return {
      ticketsData: modifiedData,
      nextToken: nextToken || null,
    };
  } catch (error) {
    console.error("❌ Error fetching asset tickets from Cosmos DB:", error.message);
    return {
      ticketsData: [],
      nextToken: null,
    };
  }
};

async function uploadBase64ToBlob(base64Data, folderName, fileName) {
  try {
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data");
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");

    const blobName = `${folderName}/${fileName}`;

    console.log(AZURE_STORAGE_CONNECTION_STRING);
    console.log(CONTAINER_NAME,blobName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload buffer to blob
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    // Construct Blob URL (public if container access is set to "Blob")
    const blobUrl = blockBlobClient.url;

    console.log(`✅ Uploaded to Azure Blob: ${blobUrl}`);
    return blobUrl;
  } catch (error) {
    console.error("❌ Error uploading to Azure Blob:", error.message);
    throw error;
  }
}

module.exports = {
  upsertDataToCosmos,
  getDataFromCosmos,
  updateItemFieldsInCosmos,
  uploadBase64ToBlob,
  getAssetTicketCount,
  getAssetQuantityCount,
  getTicketsByAsset
};