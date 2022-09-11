


const axios = require("axios");
//let serverRoot = "localhost:9092"

let serverRoot;
function setup(app,sr) {
    serverRoot = sr

    app.get('/an/fhir/Patient/:patientId/\[$]everything',async function(req,res){


        let url = serverRoot + "Patient/" + req.params.patientId + "/$everything"

        console.log('ev',url)
        let bundle = await getBundle(url)

        res.json(bundle)
    })

    //get a summary of all Q from the forms server
    app.get('/an/getQSummary',async function(req,res){
        let url = "https://canshare.co.nz/ds/fhir/Questionnaire?_elements=url,title,name,description,extension"
        let bundle = await getBundle(url)

        res.json(bundle)
    })

    //get all careplans with en 'addresses reference to a conditions with a given code
    app.get('/an/getCarePlansWithCode/:code',async function(req,res){
        let url = serverRoot + "CarePlan?condition.code="+ req.params.code

console.log(url)
        let config = {headers:{Authorization:'dhay'}}
        try {
            results = await axios.get(url,config)  //should be a single resource
            res.json(results.data)

        } catch (ex) {
            res.json(ex)
        }
    })

    //get a single Q from the forms server
    app.get('/an/getQ/:id',async function(req,res){
        let url = "https://canshare.co.nz/ds/fhir/Questionnaire/" + req.params.id
        let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(url,config)  //should be a single resource
            res.json(results.data)

        } catch (ex) {
            res.json(ex)
        }
    })

    //get a single Q from the forms server based on the url
    app.get('/an/getQbyUrl',async function(req,res){

        let url = "https://canshare.co.nz/ds/fhir/Questionnaire?url=" + req.query.url
        console.log(url)
        let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(url,config)  //should be a single resource
            let bundle = results.data
            //todo need to check if > 1
            if (bundle.entry && bundle.entry.length > 0) {

                res.json(bundle.entry[0].resource)
            } else {
                res.status(404).json({})
            }



        } catch (ex) {
            res.json(ex)
        }
    })

    app.get('/an/getQR/:id',async function(req,res){
        let qry = "https://canshare.co.nz/ds/fhir/QuestionnaireResponse/" + req.params.id

        //let qry = "https://canshare.co.nz/ds/fhir/QuestionnaireResponse?_id=" + req.params.id + "&_include=QuestionnaireResponse:questionnaire"

        console.log(qry)

        let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(qry,config)  //should be a single resource
            res.json(results.data)

        } catch (ex) {
            res.json(ex)
        }
    })

    //get a summary of all the QR hashed by QR.url. Need to filter on patient at some point
    //todo - could I use graphql to get Q title as well?
    app.get('/an/getQRSummary',async function(req,res){
        let qry = "https://canshare.co.nz/ds/fhir/QuestionnaireResponse?_elements=questionnaire,authored"
        let bundle = await getBundle(qry)
        let reportQR = {}
        if (bundle.entry) {
            bundle.entry.forEach(function (entry) {
                let QR = entry.resource
                let qUrl = QR.questionnaire
                if (qUrl) {
                    qUrl = qUrl.replace("http://canshare.com/fhir/Questionnaire/","")
                }


                if (reportQR[qUrl]) {
                    let tmp = reportQR[qUrl]
                    tmp.push({date:QR.authored,id:QR.id})

                } else {
                    reportQR[qUrl] = [{date:QR.authored,id:QR.id}]
                }
            })
            res.json(reportQR)
        } else {
            res.json({})
        }

    })



    //an endpoint to proxy to the server
    app.get('/an/fhir/*',async function(req,res){
        //console.log(req.originalUrl)
        let ar = req.originalUrl.split('/')
        let urlToServer = serverRoot +  decodeURI(ar[3])         //the query passed in by the client


        //console.log(urlToServer)
        try {
            let bundle = await getBundle(urlToServer)
            res.json(bundle)
        } catch (ex) {
            res.json(ex)
        }




    })




    //get a summary of ann conditions by disease type from the local server. returns a hash keyed by disease
    //todo this is quite inefficient and will not scale when all mosaic data is imported. If useful, have a better strategy -
    //eg don't use getBundle() - incorporate paging in the query and save the results (Group or List) for
    //re-use.
    app.get('/an/getConditionSummary',async function(req,res){
        let url = serverRoot + "Condition?_elements = code"
        let results = await getBundle(url)
        let hashUniqueDisease = {}          //
        results.entry.forEach(function (entry) {
            let resource = entry.resource
            if (resource.code && resource.code.text) {
                let diagnosisText = resource.code.text.trim()      //should be code...

                let diagnosisCode = "unknown"
                if (resource.code.coding) {
                    diagnosisCode = resource.code.coding[0].code.trim()
                } else {
                   // diagnosisCode = diagnosisText
                }



                if (hashUniqueDisease[diagnosisCode]) {
                    let cnt = hashUniqueDisease[diagnosisCode].cnt

                    hashUniqueDisease[diagnosisCode].cnt = cnt + 1
                } else {
                    hashUniqueDisease[diagnosisCode] = {cnt:1,code:diagnosisCode,display:diagnosisText}
                }

            }

        })

        res.json(hashUniqueDisease)
    })

    async function getBundle(url) {
        let results = await axios.get(url)      //get the first
        let bundle = results.data       //the first bundle

        let nextPageUrl = getNextPageUrl(bundle)
        //console.log('next ' + nextPageUrl)

        while (nextPageUrl) {
            try {
                results = await axios.get(nextPageUrl)
                let nextBundle = results.data

                //append the new bundles data to the first bundle
                if (nextBundle.entry) {
                    nextBundle.entry.forEach(function (entry){
                        bundle.entry.push(entry)
                    })
                }
                //get the next page. Note that hapi seems to keep on generating page links, returning an OO status 500 on the last one
                nextPageUrl = getNextPageUrl(nextBundle)
            } catch (ex) {
                //the hapi server paging seems to return an OO with status 500 at the end of the page set...
                //??? should check the result anyway?
                //console.log('error ' + ex.message)
                nextPageUrl = null           //will terminate the while() loop, returning the results thus far..
            }
        }
        return bundle

    }




    app.get('/ds/fhir/:type',async function(req,res){
        let url = serverRoot + req.params.type


        let delimiter = '?'
        Object.keys(req.query).forEach(function(key,inx){
            let val = req.query[key]        //can be an array
            if (Array.isArray(val)) {
                val.forEach(function (v) {
                    url += delimiter + key + "=" + v
                    delimiter = "&"
                })
            } else {
                url += delimiter + key + "=" + val
                delimiter = "&"
            }

        })

        console.log(url)

        let bundle = await getBundle(url)
        res.json(bundle)
/*
        let results = await axios.get(url)      //get the first
        let bundle = results.data       //the first bundle

        let nextPageUrl = getNextPageUrl(bundle)
        //console.log('next ' + nextPageUrl)

        while (nextPageUrl) {
            try {
                results = await axios.get(nextPageUrl)
                let nextBundle = results.data

                //append the new bundles data to the first bundle
                if (nextBundle.entry) {
                    nextBundle.entry.forEach(function (entry){
                        bundle.entry.push(entry)
                    })
                }
                //get the next page. Note that hapi seems to keep on generating page links, returning an OO status 500 on the last one
                nextPageUrl = getNextPageUrl(nextBundle)
            } catch (ex) {
                //the hapi server paging seems to return an OO with status 500 at the end of the page set...
                //??? should check the result anyway?
                //console.log('error ' + ex.message)
                nextPageUrl = null           //will terminate the while() loop, returning the results thus far..
            }
        }

        delete bundle.link       //this is the link from the first query

        res.json(bundle)
*/
    })

/*
    //the Patient/$everything operation
    app.get('/ds/fhir/Patient/:id/\[$]everything',async function(req,res){
        let url = `${serverRoot}Patient/${req.params.id}/$everything`
        //let url = serverRoot + "Patient/" + req.params.id + "/$everything"
        try {
            results = await axios.get(url)
            res.json(results.data)
        } catch (ex) {
            res.status(500).json({msg:ex.message,url:url})
        }



    })

    */

    function getNextPageUrl(bundle) {
        //console.log('gm' + bundle.resourceType)
        let url = null
        if (bundle && bundle.link) {
            bundle.link.forEach(function (link){
                if (link.relation == 'next') {
                    url = link.url
                }
            })
        }
        //console.log(url)
        return url

    }


}


module.exports = {
    setup : setup
};