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

            let urlPattern = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi;

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



            /* Check the following from the 'architecture.md' file...
            *     * All resources have a profile conformance claim to a known profile appropriate for that resource type
                * The system values in the resources match that assigned to the data source
                * All updates are conditional updates or creates
                * */

            //The following are validation that can't be picked up in the standard profile validation
            bundle.entry.forEach(function (entry,inx) {

                //check that there is a resource
                let resourceType
                if (! entry.resource) {
                    oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1}  is missing the resource`})
                } else {
                    //there is a resource - so we can check the resource specific things
                    let resource = entry.resource
                    resourceType = resource.resourceType

                    //check that there is a profile conformance claim. For now, just look for one - may want to be a bit more specific later on
                    if ( ! resource.meta || ! resource.meta.profile) {
                        oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} (${resourceType}) is missing the conformance claim (meta.profile)`})
                    }

                }


                //check that there is a fullUrl
                if (! entry.fullUrl) {
                    oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} (${resourceType}) is missing the fullUrl`})
                } else {
                    //the url needs to be a uuid
                    let fullUrl = entry.fullUrl
                    if (fullUrl.indexOf("urn:uuid:") == -1) {
                        oo.issue.push({severity:'fatal',code:'required',diagnostics:`The fullUrl of entry #${inx+1} (${resourceType}) does not start with urn:uuid:`})
                    } else {
                        //so it starts correctly, but it the rest a uuid?
                        fullUrl = fullUrl.replace("urn:uuid:","")
                        if (! fullUrl.match(urlPattern)) {  //https://www.fwait.com/how-to-check-if-string-is-a-uuid-in-javascript/
                            oo.issue.push({severity:'fatal',code:'required',diagnostics:`The fullUrl of entry #${inx+1} is not a uuid`})
                        }
                    }

                }

                //check that this is a conditional update.
                let hasCU = true
                if (entry.request) {
                    if (entry.request.method !== 'PUT' || ! entry.request.url) {
                        hasCU = false
                    }

                } else {
                    hasCU = false
                }

                if (! hasCU) {
                    oo.issue.push({severity:'fatal',code:'required',diagnostics:`entry #${inx+1} (${resourceType}) is not a conditional update`})
                }

            })

            if (oo.issue.length > 0) {
                //there was at least one issue found in the manual validation so reject...
                reject(oo)
                return
            } else {
                //so it passed the manual tests. Now for a more comprehensive test...

                //let validationServer = "http://actnow.canshare.co.nz:9092/baseR4/"
                let validationServer = "http://hapi.fhir.org/baseR4/"

                axios.post(validationServer + "Bundle/$validate",bundle).then(
                    function(response) {
                        //the validation was successful
                        /*
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
                        */

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

            }





        })







    }

}


module.exports = {
    setup : setup
};