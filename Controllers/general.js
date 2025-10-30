const {callFreshserviceAPI} = require('../Utils/freshservice');
const {encrypt} = require('../Utils/encDec');

const {getDataFromCosmos,upsertDataToCosmos,updateItemFieldsInCosmos} = require('../Functions/cosmos');
const {configureSubscription} = require('./payment');
const {verifyToken} = require('../Middleware/authMiddleware')


const validateCredentials = async (req, res) => {
  try {
    const { domain, apiKey } = req.body;

    let isFsValid = false;
    let fsStatus = 500;

    // Prepare both API calls as promises for parallel execution
    const fsPromise = callFreshserviceAPI({
      method: "GET",
      endpoint: "requesters",
      apiKey,
      domain,
      retryLogic : false
    });

    // Execute in parallel
    const [validateFreshservice] = await Promise.all([fsPromise]);

    // Process Freshservice result
    if (validateFreshservice.status === 200) {
      isFsValid = true;
    }
    fsStatus = validateFreshservice.status;


    return res.status(200).json({
      isFsValid,
      fsStatus,
    });
  } catch (error) {
    console.error("Error Occurred at ValidateCredentials: ", error);  // Fixed typo
    return res.status(500).json({ message: "Error validating credentials" });  // Fixed res.send & message
  }
};

const clientRegistration = async (req, res) => {
  try {
    const { fsDomain, fsApiKey, orgEmail,secretKey,save,targetUrl,appCode } = req.body;

    const CLIENT_TABLE = appCode === 'QRSIGRCK' ? process.env.CLIENT_TABLE : process.env.ASSET_CLIENT_TABLE;

    if (
      !fsDomain ||
      !fsApiKey ||
      !orgEmail ||
      !appCode ||
      (appCode === "QRSIGRCK" && save === false && !targetUrl)  ||
      (save === false && !secretKey) 
    ) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields in request body.",
      });
    }

    const encFsApiKey = await encrypt(fsApiKey);
    const encOrgEmail = await encrypt(orgEmail);
    const encSecretKey = secretKey !== "" ? await encrypt(secretKey) : "";

    const isClientExists = await getDataFromCosmos({
        containerId: CLIENT_TABLE,
        query: "SELECT * FROM c WHERE c.domain = @domain",
        parameters: [
          { name: "@domain", value: fsDomain }
        ]
      });

    // console.log(isClientExists);
    
    const timestamp = new Date().toISOString();

    if (isClientExists?.status === 200) {

        const updateValue = {
            domain : fsDomain,
            fsApiKey : encFsApiKey,
            orgEmail : encOrgEmail,
            secretKey: encSecretKey,
            isActive: true,
            updatedAt: timestamp
        };

        if(appCode === 'QRSIGRCK'){
          updateValue.targetUrl = targetUrl
        }

        const existingId = isClientExists?.data?.id;
        const updateResponse = await updateItemFieldsInCosmos({
          containerId: CLIENT_TABLE, 
          id : existingId,
          partitionKey : fsDomain,
          updates : updateValue,
        });
        
        return res.status(updateResponse.status).json({
          status : updateResponse.status,
          message : updateResponse.message
        });


    } else {
        const newItem = {
            domain : fsDomain,
            fsApiKey : encFsApiKey,
            orgEmail : encOrgEmail,
            secretKey: encSecretKey,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        if(appCode === 'QRSIGRCK'){
          newItem.targetUrl = targetUrl
        }

        console.log("here ");

        const upsertResponse = await upsertDataToCosmos({
          containerId: CLIENT_TABLE, 
          item : newItem,
          partitionKey : fsDomain});
        

        return res.status(upsertResponse.status).json({
          status : upsertResponse.status,
          message : upsertResponse.message
        });
    }

  } catch (error) {
    console.error("Error in clientRegistration:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const verifyAuthToken = async (req,res) => {
  const {token} = req.body;
  console.log("HIT");
  return await verifyToken(token,res)
}



module.exports = {validateCredentials,clientRegistration,verifyAuthToken}