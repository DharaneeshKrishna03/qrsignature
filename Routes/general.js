const express = require('express');
const generalRouter = express.Router();

const {validateCredentials,clientRegistration,verifyAuthToken} = require('../Controllers/general');



generalRouter.post('/validate',validateCredentials);
generalRouter.post('/register',clientRegistration);
generalRouter.post('/verify-token',verifyAuthToken)

module.exports = {generalRouter}