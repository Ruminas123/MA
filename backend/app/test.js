const express = require('express');
const ping = require('ping');
const cors = require('cors');
const app = express();
const pg = require('pg-promise')();
const db = pg('postgres://postgres:abc@1234@localhost:5432/awat'); // Update with your DB connection string

PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("server is running on port ", PORT);
});

db.any("SELECT * FROM department").then((data)=>{
    console.log(data);
}).catch((error)=>{
    console.log("Error in DB connection", error);
})
