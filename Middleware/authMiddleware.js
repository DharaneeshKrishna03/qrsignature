const jwt = require("jsonwebtoken");


const {getDataFromCosmos} = require('../Functions/cosmos');
const {decrypt} = require('../Utils/encDec');

const authorize = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; 

  if (!token) {
    return res.status(401).json({ error: "Token required" });
  }

  try {
    
    const decodedUnverified = jwt.decode(token);
    if (!decodedUnverified || !decodedUnverified.domain) {
      return res.status(403).json({ error: "Invalid token payload" });
    };

    const CLIENT_TABLE = decodedUnverified.appCode === 'QRSIGRCK' ? process.env.CLIENT_TABLE : process.env.ASSET_CLIENT_TABLE;

    const clientRawData = await getDataFromCosmos({
        containerId: CLIENT_TABLE,
        query: "SELECT * FROM c WHERE c.domain = @domain",
        parameters: [
          { name: "@domain", value: decodedUnverified.domain }
        ]
      });

    if (clientRawData.status !== 200) {
      return res.status(403).json({ error: "Invalid domain" });
    }

    const clientData = clientRawData.data;
    const decSecretKey = await decrypt(clientData.secretKey);

    console.log(decSecretKey);

    if (!clientData?.isActive) {
      return res.status(403).json({ error: "Domain or secretKey mismatch" });
    }

    jwt.verify(token, decSecretKey);

    req.client = clientData; 
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: "Token expired" });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: "Invalid token" });
    }
    return res.status(500).json({ error: "Server error" });
  }
};

const verifyToken = async (token,res) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const CLIENT_TABLE =
      decoded.appCode === "QRSIGRCK"
        ? process.env.CLIENT_TABLE
        : process.env.ASSET_CLIENT_TABLE;

    const clientRawData = await getDataFromCosmos({
        containerId: CLIENT_TABLE,
        query: "SELECT * FROM c WHERE c.domain = @domain",
        parameters: [
          { name: "@domain", value: decoded.domain }
        ]
    });

    if (clientRawData.status !== 200) {
      return res.status(403).json({ valid: false, message: "Invalid domain" });
    }

    // If valid
    return res.json({
      valid: true,
      ticketId:decoded?.ticketId ?? '',
      domain: decoded?.domain ?? '',
      name:decoded?.requesterName ?? '',
      requesterId:decoded?.requesterId ?? '',
      targetUrl : clientRawData?.data?.targetUrl
    });
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res
      .status(403)
      .json({ valid: false, message: "Invalid or expired token" });
  }
}



module.exports = {authorize,verifyToken}