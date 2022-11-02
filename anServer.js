let fs = require('fs')
let http = require('http');

let port = process.env.port;
if (! port) {
    port=8080;
} else {
    console.log('setting port to ' + port)
}



//let port = 9091
// instructions for ssl nginx
//https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-20-04

const actnowModule = require("./serverModuleActNow");
const actnowEndpointModule = require("./serverModuleActNowEndpoint");

const bodyParser = require('body-parser')

//sharing the same fhir server as the rest on canshare for dev (but not prod)
let serverRoot = "http://localhost:9092/baseR4/"

//let serverRoot = "http://localhost:9876/fhir/"


let systemConfig
try {
    systemConfig = require("./artifacts/systemConfig.json")
   // if (systemConfig)
} catch (ex) {
    systemConfig = {type:"design","publicServer":"https://canshare.co.nz",port:9090,serverRoot : "http://localhost:9099/baseR4/"}
}

var express = require('express');
var app = express();

app.use(bodyParser.json({limit:'50mb',type:['application/json+fhir','application/fhir+json','application/json']}))

actnowModule.setup(app,serverRoot)
actnowEndpointModule.setup(app,serverRoot)

app.use('/', express.static(__dirname,{index:'/actnow.html'}));


server = http.createServer(app).listen(port);
console.log('server listening on port ' + port)

