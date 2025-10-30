const express = require("express");
const mainRouter = express.Router();

const {generalRouter} = require('./general');
const {freshserviceRouter} = require('./freshservice');


mainRouter.use('/rck',generalRouter);
mainRouter.use('/qrapp',freshserviceRouter);


module.exports = {mainRouter}