
let axiosConfig = {};       //will contain the access token (if reading from smile)

const axios = require("axios");
//let serverRoot = "localhost:9092"

let serverRoot;
function setup(app,initialServerRoot,serverHash) {
    serverRoot = initialServerRoot

    //This is the endpoint that allows a server to be selected
    //Right now, there are only a couple of servers supported - 'local' and 'smile'. Can enhance later if needed

    app.post('/setServer/:server',async function(req,res) {
        let server = req.params.server
        console.log(server)

        switch (server) {
            case "smile" :
                //need to get the access token
                axiosConfig = {}       //clear the current one
                let at = await getAccessToken()
                console.log(at)
                if (at.error) {
                    //There was an error - just return it
                    res.status(500).send(at.error)
                    return
                }

                if (at['access_token']) {
                    axiosConfig.headers = {Authorization: 'Bearer ' + at['access_token']}
                    serverRoot = serverHash['smile']
                    res.send("Server changed to "+ server)
                } else {
                    //there isn't an access token - weird...
                    res.status(500).send("Unable to get access token")
                }

                break
            case "local" :
                axiosConfig.headers = {Authorization: "dhay"}
                break
            default :
                axiosConfig = {}      //assume that any other server (local at the moment) doesn't need an access token
                break
        }


        //res.send()


    })

    app.get('/proxy',async function(req,res) {

        let url = req.query.url

        const buff = Buffer.from(url, 'base64');
        const qry = buff.toString('utf-8');

        console.log(qry)
        try {
            let results = await axios.get(qry,axiosConfig)      //get the first
            console.log(results.data)

            res.send(results.data)
        } catch (ex) {
            res.status(404).send("The url could not be loaded")
        }
    })

    app.post('/an/validate',function (req,res) {
        let resource = req.body
        let url = `http://hapi.fhir.org/baseR4/${resource.resourceType}/$validate`
        axios.post(url,resource,axiosConfig)
            .then(function (response){
                //console.log(response.data)
                res.status(response.status).json(response.data)
            })
            .catch(function (err){
                //console.log(err)
                if (err.response) {
                    res.status(err.response.status).send(err.response.data)
                } else {
                    res.status(500).send(err.response.data)
                }
            })
    })

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

//console.log(url)
        //axiosConfig.headers = {Authorization: at['access_token']}
        try {
            results = await axios.get(url,axiosConfig)  //should be a single resource
            res.json(results.data)

        } catch (ex) {
            res.json(ex)
        }
    })

    //get a single Q from the forms server
    app.get('/an/getQ/:id',async function(req,res){
        let url = "https://canshare.co.nz/ds/fhir/Questionnaire/" + req.params.id
       // let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(url,axiosConfig)  //should be a single resource
            res.json(results.data)

        } catch (ex) {
            res.json(ex)
        }
    })

    //get a single Q from the forms server based on the url
    app.get('/an/getQbyUrl',async function(req,res){

        let url = "https://canshare.co.nz/ds/fhir/Questionnaire?url=" + req.query.url
        console.log(url)
        //let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(url,axiosConfig)  //should be a single resource
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

       // let config = {headers:{Authorization:'dhay'}}

        try {
            results = await axios.get(qry,axiosConfig)  //should be a single resource
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
        ar.splice(0,3)        //remove the preceeding entries

        let urlToServer = serverRoot +  decodeURI(ar.join('/'))         //the query passed in by the client



        console.log('server: ' + urlToServer)
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
        console.log('url',url)
        let results
        try {
            results = await axios.get(url,axiosConfig)      //get the first
        } catch (ex) {
            console.log(ex)
            //todo - if there was an error contacting the server then return an empty bundle
            //might want better error handling eventually...
            return {entry:[]}
        }

        let bundle = results.data       //the first bundle

        let nextPageUrl = getNextPageUrl(bundle)


        while (nextPageUrl) {
            //console.log('next ' + nextPageUrl)
            try {
                results = await axios.get(nextPageUrl,axiosConfig)
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

    app.get('/an/check',async function(req,res){

        let at = await getAccessToken()
        //console.log('at',at)
        if (at['access_token']) {
            //console.log(at['access_token'])
            try {
                let config = {headers:{Authorization:'Bearer ' + at['access_token']}}
                let resp = await axios.get("https://hof.smilecdr.com/fhir_request/Condition",config)
                res.json(resp.data)
            } catch (ex) {
                console.log('fail',ex)
                res.status(500).json(ex)
            }
        } else {
            res.status(500).json(at)
        }

    })

    let getAccessToken = async function () {
        return new Promise((res, rej) => {

            let authEndpoint = "https://hof.smilecdr.com/smartauth/oauth/token"
            let qry = "grant_type=client_credentials&client_id=actnow_ri&client_secret=actnowtesting"
            let config = {headers: {Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'}}

            axios.post(authEndpoint, qry, config)
                .then(function (response) {
                    //console.log('ok',response.data)
                    res(response.data)
                })
                .catch(function (err) {
                    console.log('err', err.response.status)
                    res({error: "Unable to get access token"})

                })
        })
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