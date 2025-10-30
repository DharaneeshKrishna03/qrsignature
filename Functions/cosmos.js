// services/generalService.js
const { CosmosClient } =  require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

require('dotenv').config()

const {
  AZURE_COSMOS_ENDPOINT,
  AZURE_COSMOS_KEY,
  AZURE_COSMOS_DATABASE,
} = process.env;

// Initialize Cosmos client
const cosmosClient = new CosmosClient({
  endpoint: AZURE_COSMOS_ENDPOINT,
  key: AZURE_COSMOS_KEY,
});

const database = cosmosClient.database(AZURE_COSMOS_DATABASE);

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_BLOB_CONTAINER;

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);


// ✅ Insert a record
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


// ✅ Get a record by ID
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

    console.log(updatedItem);

    const { resource: result } = await container.items.upsert(updatedItem, { partitionKey });

    return { status: 200, message: "Item updated successfully", data: result };
  } catch (error) {
    console.error(
      `❌ Error updating item fields in Cosmos DB at updateItemFieldsInCosmos: ${error.message}`
    );
    return { status: 500, message: error.message, data: null };
  }
};


// ✅ Query records (using SQL syntax)
const queryCosmosItems = async (AZURE_COSMOS_CONTAINER,query, params = []) => {
  const container = database.container(AZURE_COSMOS_CONTAINER);
  try {
    const { resources } = await container.items
      .query({ query, parameters: params })
      .fetchAll();
    return resources;
  } catch (error) {
    console.error("❌ Error querying items:", error.message);
    return [];
  }
};

// ✅ Update a record
const updateCosmosItem = async (AZURE_COSMOS_CONTAINER,id, partitionKey, updatedData) => {
  const container = database.container(AZURE_COSMOS_CONTAINER);
  try {
    const { resource: existingItem } = await container.item(id, partitionKey).read();
    const mergedItem = { ...existingItem, ...updatedData };
    const { resource: updatedItem } = await container.items.upsert(mergedItem);
    return { status: 200, message: "Record updated successfully", data: updatedItem };
  } catch (error) {
    console.error("❌ Error updating item:", error.message);
    return { status: 500, message: error.message };
  }
};

// ✅ Delete a record
const deleteCosmosItem = async (AZURE_COSMOS_CONTAINER,id, partitionKey) => {
  const container = database.container(AZURE_COSMOS_CONTAINER);
  try {
    await container.item(id, partitionKey).delete();
    return { status: 200, message: "Record deleted successfully" };
  } catch (error) {
    console.error("❌ Error deleting item:", error.message);
    return { status: 500, message: error.message };
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

module.exports = {upsertDataToCosmos,getDataFromCosmos,updateItemFieldsInCosmos,deleteCosmosItem,queryCosmosItems,uploadBase64ToBlob}