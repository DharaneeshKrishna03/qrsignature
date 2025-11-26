const express = require('express');
const freshserviceRouter = express.Router();

const {authorize} = require('../Middleware/authMiddleware')
const {generateQRSign,getAssociations,addSignature,initialScan,getAssetsUsers,insertAssetUser,triggerSignature} = require('../Controllers/freshservice');



freshserviceRouter.post('/generate',authorize,generateQRSign);
freshserviceRouter.post('/assetDatas',authorize,getAssociations);
freshserviceRouter.post('/triggerSignature',triggerSignature);
freshserviceRouter.post('/addSignature',authorize,addSignature);
freshserviceRouter.post('/assetMigration',authorize,initialScan);
freshserviceRouter.post('/assetData',authorize,getAssetsUsers)
freshserviceRouter.post('/insertAsset',authorize,insertAssetUser)


module.exports = {freshserviceRouter}
