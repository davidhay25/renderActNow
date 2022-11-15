//the endpoint to accept transaction bundles


const axios = require("axios");
//let serverRoot = "localhost:9092"

let serverRoot;
function setup(app,sr) {
    serverRoot = sr

    //an endpoint that simulates transaction processing
    //todo - use this for the mosaic import from my script as well
    //todo currently the validation is hard coded - decide how much profile based validation will be useful...
    app.post('/an/processTransaction',async function(req,res){

        let bundle = req.body
        try {
            let oo = await validateTransaction(bundle)

            if (oo.issue.length > 0) {
                //there were one or more issues
                res.status(400).json(oo)
                return
            }

            //if here. then  it passed validation. POST it to the server...
            console.log('still processing to ' + serverRoot)
            axios.post(serverRoot, bundle)
                .then(function (response) {
                    console.log("precessed ok");
                    res.status(response.status).json(response.data)
                })
                .catch(function (error) {
                    console.log('error');
                    if (error.response) {
                        res.status(error.response.status).json(error.response.data)
                    } else {
                        oo.issue.push({severity:'fatal',code:'required',diagnostics:`The bundle was OK, but there was an unknown error POSTing it to the FHIR server`})
                        res.status(500).json(oo)
                    }
                });

         //   res.json(oo)
        } catch (ex) {
            res.status(400).json(ex)
        }


    })

    //get the transaction log to display in the UI
    app.post("/an/validateTransaction",async function(req,res){
        try {
            let oo = await validateTransaction(req.body)
            res.json(oo)
        } catch (ex) {
            res.status(400).json(ex)
        }


    })

    function validateTransaction(bundle) {
        return new Promise(function(resolve,reject){

            if (!bundle || !bundle.entry || (bundle.entry.length == 0)) {
                let oo = {resourceType:"OperationOutcome",issue:[]}
                oo.issue.push({severity:'fatal',code:'required',diagnostics:"Must be a bundle with one or more entries"})
                reject(oo)
                //return
            }

            let oo = {resourceType:"OperationOutcome",issue:[]}
            //first up, perform a validation operation. Right now, this will just check the standard FHIR resources
            //but once the profiles are complete, it will be more comprehensive and some of the manual tests below
            //can be removed. We hard code the validation server 'cause that is where we'll place the profiles
            //let validationServer = "http://home.clinfhir.com:8054/baseR4/"
            let validationServer = "http://actnow.canshare.co.nz:9092/baseR4/"

            axios.post(validationServer + "Bundle/$validate",bundle).then(
                function(response) {
                    //the validation was successful
                    bundle.entry.forEach(function (entry,inx) {
                        let resource = entry.resource
                        if (! resource) {
                            oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} is missing the resource`})
                        } else {
                            //check that the identifier is present and correct
                            if (! resource.identifier) {
                                oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} is missing the identifier`})
                            } else {
                                //the identifier is present - check that there is a system and a value.
                                //all resources must hsve an identifier
                                //todo - ? check system is known
                                resource.identifier.forEach(function (identifier) {
                                    if (! identifier.system || ! identifier.value) {
                                        oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} is missing the identifier system or value`})
                                    }
                                })

                            }

                            if (resource.type == 'CarePlan'  ) {

                                if (! resource.category) {
                                    oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} is missing the category`})
                                }

                            }

                            //check that this is a conditional update
                            let hasCU = true
                            if (entry.request) {
                                if (entry.request.method !== 'PUT' || ! entry.request.url) {
                                    hasCU = false
                                }

                            } else {
                                hasCU = false
                            }

                            if (! hasCU) {
                                oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} is not a conditional update`})
                            }
                        }
                    })
                    resolve(oo)
                }).catch(function(err){
                    //the validation failed
                    if (err.response) {
                        reject(err.response.data)
                    } else {
                        oo.issue.push({severity:'fatal',code:'required',diagnostics:`The bundle was OK, but there was an unknown error POSTing it to the FHIR server`})
                        reject(oo)
                    }

                })

/*
            try {
                let config = {headers:{'content-type':'application/json+fhir'}}
                let vResult =
                //if it succeeds that there comments and informational only. We'll ignore those for now...
            } catch (ex) {
                //this means that there was one or more failures. Return the errors to the caller and halt processing
                if (ex.response) {
                    res.status(ex.response.status).json(ex.response.data)
                } else {
                    oo.issue.push({severity:'fatal',code:'required',diagnostics:`There were validation failures, but no response was returned`})
                    res.status(500).json(oo)
                }
                return
            }

*/

        })







    }

}


module.exports = {
    setup : setup
};