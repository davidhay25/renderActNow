//the endpoint to accept transaction bundles


const axios = require("axios");
//let serverRoot = "localhost:9092"

let serverRoot;
function setup(app,sr) {
    serverRoot = sr

    //an endpoint that simulates transaction processing
    //todo - use this for the mosaic import from my script as well
    app.post('/an/processTransaction',async function(req,res){
        let bundle = req.body

        //save the incoming bundle in the mongo log

        //perform a validation of the bundle

        //if the validation fails then save the error in the log & reject

        //if the validation succeeds apply the transaction to the server & return


    })

    //get the transaction log to display in the UI
    app.get("/an/getLog",async function(req,res){

    })

    //a proxy interface to the FHIR server. To make it easier to apply SSL - and potentially log calls
    app.get('/an/proxy',async function(req,res){

    })


}


module.exports = {
    setup : setup
};