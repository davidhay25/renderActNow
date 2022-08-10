#!/usr/bin/env node

//hard coding mapping based on code value (eg 29300-1 is a procedure).
//need a greater range of reports to assess best way to do this.
//In smile, may want to import as DR (perhaps with contained Obs) and perfrom post processing - or custom during import (but scalability issues)
//save as Bundle in act-now server (so doesn't pollute medication graphs).
//Need to think about filtering resources for the different graphs (meds, labs) Maybe need to use Obs.Category

//ids will need a better solution - perhaps an identifier from MSH + dequence

//todo - tumour size has a couple of elements - should they be a single Observation with Componnets? (like in FSH school)

const fs = require('fs');
const axios = require("axios");

let uploadServer = "http://actnow.canshare.co.nz:9092/baseR4/"


let bundle = {resourceType:"Bundle",id:"v2mapping-1",type:"collection",entry:[]}
let patient = {}, specimen={}, procedure={}, condition={}, dateOfMessage=null    //scope outside the loop

let provenance = {resourceType:"Provenance",id:'prov-1'}
addEntry(provenance)

provenance.recorded = new Date().toISOString()
provenance.entity = []
provenance.agent = []
provenance.target = []
// set from MSH provenance.id
//  provenance.entity.push({role:"source",what:{reference:"QuestionnaireResponse/" + QR.id}})

let lab = {resourceType:"Organization",id:"organization-1"}
addNarrative(lab,"lab")
addEntry(lab)
//provenance.target.push({reference: "Observation/" + observation.id})

let DR = {resourceType:"DiagnosticReport",id:"dr-1",status:"final",result:[]}
DR.performer = [{reference:"Organization/"+ lab.id}]

addNarrative(DR,"DiagnosticReport")
addEntry(DR)
provenance.target.push({reference: "DiagnosticReport/" + DR.id})

let data = fs.readFileSync("./38.hl7").toString()

//create a Binary to hold the original message
let binary = {resourceType:"Binary",id:"bin-1"}
binary.contentType = "text/plain"
binary.data = Buffer.from(data,'utf8').toString('base64')
addEntry(binary)

///provenance.target.push({reference: "Binary/" + binary.id})
provenance.entity.push({role:"source",what:{reference:"Binary/" + binary.id}})

let ar = data.split('\r\n')
processMessage(ar)

//console.log(JSON.stringify(bundle,null,2))

//POST bundle to act-now server. AN server to expose bundle query endpoint for Bundle Visualizer
fs.writeFileSync("./bundle.json",JSON.stringify(bundle,null,2))

if (uploadServer) {
    let url = uploadServer + "Bundle/" + bundle.id
    console.log("uploading to " + url)

    axios.put(url,bundle).then(
        function (response) {
        // handle success
        //console.log(response);
    }).catch(function (error) {
            // handle error
            console.log(error);
    })

}



function processMessage(ar) {
    ar.forEach(function(lne,lineNumber){
        lne = lne.trim()
        console.log(lineNumber,lne)
        let ar = lne.split('|')
        //console.log(ctr,ar)
        let segment = ar[0]     //segment type (eg OBX)
        let dataType = ar[2]          //datatype  CE, NM, ST
        let code = ar[3]

        let value = ar[5]       //value
        console.log(`Segment:${segment}  DataType: ${dataType}  Code:${code} Value: ${value}`)
        console.log()

        //switch depending on code - could create different resources
        switch (segment) {
            case "MSH" :
                //establish date of message (MSH-7)
                dateOfMessage = convertDate(ar[6])
                DR.effectiveDateTime = dateOfMessage
                lab.identifier = [{value:ar[3],system:"https://standards.digital.health.nz/ns/hpi-organisation-id"}]
                console.log('DOM',dateOfMessage)
                break
            case "PID" :
                //The patient resource
                patient = {resourceType:'Patient',id:'patient-'+lineNumber}
                let arNhiValue = ar[3].split("^")
                patient.identifier = [{system:'https://standards.digital.health.nz/ns/nhi-id',value:arNhiValue[0]}]

                let arName = ar[5].split("^") //last name ^ first name
                patient.name = [{family:arName[0],given:[arName[1]],text:arName[1] + " " + arName[0]}]

                patient.birthDate = convertDate(ar[7])
                patient.gender = (ar[8] == 'M' ? 'male' : 'female')

                addNarrative(patient,patient.name[0].text)
                addEntry(patient)
                //bundle.entry.push({resource:patient})

                break
            case "OBR" :
                //establish context for the Observations

                //todo set DR identifier - ordering OBR-16 - 96ZZZZ^^^^^^^^NZLMOH^^^^HI^^^F99999-B^HPI Facility ID^HF
                let arComponent = ar[16].split('^')
                console.log(arComponent)
                //let HPI = arComponent[17]

                DR.identifier = DR.identifier || []

                //The placer identifier - see the DR page in the spec for details
                let ident = {}
                ident.type = {coding:[{system:"http://terminology.hl7.org/CodeSystem/v2-0203",code:"PLAC"}]}
                ident.system = "https://standards.digital.health.nz/ns/hpi-facility-id"
                ident.value = arComponent[15]
                DR.identifier.push(ident)

/*
                Components:
                    <ID number (ST)> ^ <family name (FN)> ^ <given name (ST)> ^ <second and further given names or initials thereof (ST)> ^ <suffix (e.g., JR or III) (ST)> ^ <prefix (e.g., DR) (ST)> ^ <degree (e.g., MD) (IS)> ^ <source table (IS)> ^ <assigning authority (HD)> ^ <name type code (ID)> ^ <identifier check digit (ST)> ^ <code identifying the check digit scheme employed (ID)> ^ <identifier type code (IS)> ^ <assigning fa- cility (HD)> ^ <name representation code (ID)> ^ <name context (CE)> ^ <name validity range (DR)> ^ <name assembly order (ID)>
                Subcomponents of family name: <surname (ST)> & <own surname prefix (ST)> & <own surname (ST)> & <surname prefix from partner/spouse (ST)> & <surname from partner/spouse (ST)>
                Subcomponents of assigning authority: <namespace ID (IS)> & <universal ID (ST)> & <universal ID type (ID)>
*/

                break
            case "OBX" :
                //Observation segment. Note that not all are Observation resources
                let arCode = code.split("^")    //code, description, system
                switch (arCode[0]) {
                    case "89873-4" :
                        //specimen identifier
                        //This kicks off a separate specimen / report
                        specimen = {resourceType:"Specimen",id:'specimen-'+lineNumber}
                        specimen.subject = {reference:"Patient/"+patient.id}
                        specimen.identifier = [{system:"http://unknown.org",value: value}]

                        DR.specimen = DR.specimen || []
                        DR.specimen.push({reference:"Specimen/"+specimen.id})
                        addNarrative(specimen,"Specimen")
                        addEntry(specimen)
                        provenance.target.push({reference: "Specimen/" + specimen.id})


                        break
                    case "29300-1" :
                        //this is the procedure.
                        procedure = {resourceType:"Procedure",id:'procedure-'+lineNumber,status:"completed"}
                        procedure.subject = {reference:"Patient/"+patient.id}

                        let arValue = value.split('^')
                        addNarrative(procedure,arValue[1])

                        addEntry(procedure)
                        provenance.target.push({reference: "Procedure/" + procedure.id})
                        //bundle.entry.push({resource:procedure})
                        //The R4 spec does not have a reference to Procedure, but R5 does from collection, so use an extension
                        specimen.collection = {}
                        specimen.collection.extension = [{url:"http://actnow/fhir/specimen-procedure",valueReference:{reference:"Procedure/"+procedure.id}}]


                        break
                    case "33725-3" :
                        //the site of the tumour. Assume it applies to the current specimen
                        specimen.collection = {bodySite:convertCE(value)}
                        let arSpecimenCode = value.split("^")
                        addNarrative(specimen,arSpecimenCode[1])

                        break

                    case "84882-0" :
                        //diagnosis
                        condition = {resourceType:"Condition",id:'condition-'+lineNumber}
                        condition.subject = {reference:"Patient/"+patient.id}
                        condition.code = convertCE(value)
                        let ar = value.split("^")
                        addNarrative(condition,ar[1])

                        addEntry(condition)
                        provenance.target.push({reference: "Condition/" + condition.id})
                        //bundle.entry.push({resource:condition})
                        break
                    default :
                        //An Observation
                        let evidenceCodes = ['33732-9','XNZ5460']
                        let observation = {resourceType:"Observation",id:'observation-'+lineNumber,status:'final'}
                        observation.subject = {reference:"Patient/"+patient.id}
                        observation.effectiveDateTime = dateOfMessage
                        observation.code = convertCE(code)
                        observation.performer = [{reference:"Organization/"+ lab.id}]
                        observation.specimen = {reference:"Specimen/"+specimen.id}
                        let textValue = ""
                        switch (dataType) {
                            case "CE" :
                                observation.valueCodeableConcept = convertCE(value)
                                textValue = observation.valueCodeableConcept.text   //todo some CE elements have just a number/code present - eg inx 18
                                break

                            case "NM" :
                                //? quantity (but no units in message)
                                observation.valueQuantity = {value:parseFloat(value)}
                                textValue = observation.valueQuantity.value
                                break

                            default :
                                console.log("Unknown datatype: " + dataType)
                                break

                        }
                        //some of them will be evidence for the Condition
                        if (evidenceCodes.indexOf(arCode[0]) > -1) {
                            condition.evidence = condition.evidence || []
                            condition.evidence.push({detail:[{reference:"Observation/" + observation.id}]})
                        }


                        DR.result.push({reference:"Observation/" + observation.id})
                        let narrative = arCode[1] // + " " + textValue
                        addNarrative(observation,narrative)
                        addEntry(observation)
                        //bundle.entry.push({resource:observation})

                        //add to the provenance
                        provenance.target.push({reference: "Observation/" + observation.id})

                        break

                }
                break
            default :
                console.log("--->>> unknown segment: "+ segment)
        }

    })


}

function addEntry(resource) {
    let entry = {resource:resource}
    let fullUrl = "http://canshare.co.nz/fhir/"+ resource.resourceType + "/" + resource.id
    entry.fullUrl = fullUrl
    bundle.entry.push(entry)
}

function convertCE(s) {
    let hashSystem = {}
    hashSystem['SCT'] = "http://snomed.info/sct"
    hashSystem['LN'] = "http://loinc.org"

    //convert a CE dt to a CodeableConcept 9040008^Ascending Colon^SCT
    let ar = s.split('^')
    let cc = {coding:[{system:hashSystem[ar[2]],code:ar[0],display:ar[1]}],text:""}
    if (ar[1]) {
        cc.text = ar[1]
    } else if (ar[0]) {
        //some elements in the v2 message seem to only be a number
        cc.text = ar[0]
    }
    return cc


}

function convertDate(d) {
    //convert from YYYYMMDD to YYYY-MM-DD - add minutes later
    let date = d.substring(0,4) + "-" + d.substring(4,6) + "-" +d.substring(6,8)

    return date
}

function addNarrative(resource,txt) {
    let text = {status:"generated"}

    txt = txt.replace(/</g, "")
    txt = txt.replace(/>/g, "")
    txt = txt.replace(/["']/g, "");
    txt = txt.replace(/&/g, "&amp;")
    txt = txt.trim()

    //text.div = "<div xmlns='http://www.w3.org/1999/xhtml'><div>" + txt + "</div></div>"
    text.div = "<div xmlns='http://www.w3.org/1999/xhtml'>" + txt + "</div>"
    resource.text = text

}
