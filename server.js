require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const {verifyJWT} = require('./Middleware/authMiddleware');
const {mainRouter} = require('./Routes/main')

const app = express();

app.use(cors({
  origin: '*', // allow all domains
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json());

app.get('/',(req,res) => {
    res.send("Welcome to My Node.js API!");
})

app.use('/api',mainRouter)

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
})