let fs = require('fs')
let http = require('http');

let port = process.env.port;
if (! port) {
    port=80;
} else {
    console.log('setting port to ' + port)
}


//let port = 9091

const actnowModule = require("./serverModuleActNow");
const bodyParser = require('body-parser')

//sharing the same fhir server as the rest on canshare for dev (but not prod)
let serverRoot = "http://localhost:9092/baseR4/"

var express = require('express');
var app = express();
actnowModule.setup(app,serverRoot)

app.use('/', express.static(__dirname,{index:'/actnow.html'}));


server = http.createServer(app).listen(port);
console.log('server listening on port ' + port)

