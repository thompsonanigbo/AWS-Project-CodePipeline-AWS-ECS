import express from 'express';
import fetch from 'node-fetch';
import rateLimitMiddleware from './middlewares/ratelimit.js';
import dotenv from 'dotenv';
import cors from 'cors';
import * as fs from 'fs';

dotenv.config();

const app = express();
const hostname = '127.0.0.1'; // Your server ip address
const port = 3000;
const filePath = './settings.json';
const version = '1.5.0';
var globalGeneratorRunning = false;
var globalRequestToRun = false;
var globalErrorState = false;
var globalSettings


const corsOptions = {
    origin: '*', // Allow requests from any origin (you can specify your frontend's origin here)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    optionsSuccessStatus: 204,
    credentials: true,
    allowedHeaders: 'Content-Type',
  };
  
app.use(cors(corsOptions));

app.use(rateLimitMiddleware);

app.get('/', (req, res) => {
    // set response content    
        res.send(`<html>
                    <body>
                        <h1 style="color:blue;text-align: center;margin-top: 100px;"> [Version ${version}]: Server is Running.</h1>
                        <div style="position: fixed;top: 50%;left: 50%;transform: translate(-50%, -50%)">
                            <img src="https://picsum.photos/400/400?random=1">
                        </div>
                    </body>
                   </html>`);
 
  console.log(`[Version ${version}]: New request => http://${hostname}:${port}`+req.url);

})

app.get('/api/victron/data', async (req, res) => {
    try {
        const data = await fetchAllData();
        res.json(data); // send the data as a JSON response
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        // Extract the 'message' parameter from the query string
        const message = req.query.message;

        // Parse the JSON string to get the variables
        const { generatorRunning, requestToRun, errorState, settings } = JSON.parse(message);

        // Assign the values to global variables
        if (generatorRunning !== ''){
            globalGeneratorRunning = generatorRunning;
        }
        if(requestToRun !== ''){
            globalRequestToRun = requestToRun;
        }
        if(errorState !== ''){
            globalErrorState = errorState;
        }
    
        if(settings != {}){
            console.log('writing file')
        }
        console.log("\ngeneratorRunning:", globalGeneratorRunning);
        console.log("requestToRun:", globalRequestToRun);
        console.log("errorState:", globalErrorState, "\n");
        console.log('settings', settings)


        // Your logic to provide the stored status
        res.json({ generatorRunning: globalGeneratorRunning, requestToRun: globalRequestToRun, errorState: globalErrorState, settings: globalSettings});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



app.listen(port, () => {
    console.log(`[Version ${version}]: Server running at http://${hostname}:${port}/`);
});

var token, idUser, idSite;
async function fetchAllData() {
    // Access environment variables
    const usernameVic = process.env.USERNAME;
    const passwordVic = process.env.PASSWORD;

    var data;

    try {
        await fetchData();
        return data; // return the result (dataArray) from fetchData
    } catch (error) {
        console.error(error);
        throw error;
    }

    async function fetchData() {
        if (token == null ){
            try {
                await get_login_token();
                await get_installations();
                data = await get_Chart(); 
            } catch (error) {
                console.error(error);
                throw error;
            }
        } else {
            try {
                data = await get_Chart(); 
            } catch (error) {
                token = 0;
                console.error(error);
                throw error;
            }
        }

    }

    async function get_login_token() {
        console.log("Get Login Token and Used ID")
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        var raw = JSON.stringify({
            "username": usernameVic,
            "password": passwordVic,
            "remember_me": "true"
        });

        var requestOptions = {
            method: 'POST',
            headers: myHeaders,
            body: raw,
            redirect: 'follow'
        };

        try {
            const response = await fetch("https://vrmapi.victronenergy.com/v2/auth/login/", requestOptions);
            const result = await response.text();
            const data = JSON.parse(result); // result is a JSON string
            token = data.token
            idUser = data.idUser
        } catch (error) {
            console.log('error', error);
            throw error; // Rethrow the error to handle it outside this function if needed
        }
    }

    async function get_installations() {
        console.log("Get Installation #")
        const headers = { 'X-Authorization': `Bearer ${token}` };

        var requestOptions = {
            method: 'GET',
            headers: headers,
            redirect: 'follow'
        };

        try {
            const response = await fetch(`https://vrmapi.victronenergy.com/v2/users/${idUser}/installations`, requestOptions);
            const result = await response.text();
            const data = JSON.parse(result); // result is a JSON string
            idSite = data.records[0].idSite
        } catch (error) {
            console.log('error', error);
            throw error; // Rethrow the error to handle it outside this function if needed
        }
    }

    async function get_Overall_Stats() {
        console.log("Get Overall Stats")
        const headers = { 'X-Authorization': `Bearer ${token}` };
        var stat_data;
        var requestOptions = {
            method: 'GET',
            headers: headers,
            redirect: 'follow'
        };

        try {
            const response = await fetch(`https://vrmapi.victronenergy.com/v2/installations/${idSite}/overallstats`, requestOptions);
            const result = await response.text();
            stat_data = JSON.parse(result); // result is a JSON string
        } catch (error) {
            console.log('error', error);
            throw error; // Rethrow the error to handle it outside this function if needed
        }
        console.log(JSON.stringify(stat_data, null, 2));
    }

    async function get_Chart() {
        console.log("Get Chart")
        const headers = { 'X-Authorization': `Bearer ${token}` };
        var requestOptions = {
            method: 'GET',
            headers: headers,
            redirect: 'follow'
        };
    
        try {
            const response = await fetch(`https://vrmapi.victronenergy.com/v2/installations/${idSite}/diagnostics`, requestOptions);
            const result = await response.text();
            const data = JSON.parse(result); // result is a JSON string
            if (!data.success) {
                throw new Error('The returned response did not indicate success.');
            }
    
            if (!data.records?.length) {
                throw new Error('The response data array is either missing or empty.');
            }
    
            const desiredAttributes = new Set([
                81, // Voltage
                49, // Current
                51, // State of charge
                94, // Daily Yield
                96, // Yesterday's Daily Yield
                442, // PV Power
            ]);
    
            let dataArray = data.records
                .filter(record => desiredAttributes.has(record.idDataAttribute))
                .map(record => ({
                    idDataAttribute: record.idDataAttribute,
                    description: record.description,
                    formattedValue: record.formattedValue,
                }));
            console.log(dataArray);
            return dataArray;
        } catch (error) {
            console.log('error', error);
            throw error; // Rethrow the error to handle it outside this function if needed
        }
    }
    
}
const fileName = './settings.txt'

async function fileDesc() {
    let filehandle;
    try {
      filehandle = await fs.open(fileName, 'r');
      console.log(filehandle.fd);
      console.log(await filehandle.readFile({ encoding: 'utf8' }));
    } finally {
      if (filehandle) await filehandle.close();
    }
  }

  fileDesc()