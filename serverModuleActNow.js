


const axios = require("axios");
//let serverRoot = "localhost:9092"

let serverRoot;
function setup(app,sr) {
    serverRoot = sr


    app.get('/ds/fhir/Patient/:patientId/\[$]everything',async function(req,res){


        let url = serverRoot + "Patient/" + req.params.patientId + "/$everything"

        console.log('ev',url)
        let bundle = await getBundle(url)

        res.json(bundle)
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