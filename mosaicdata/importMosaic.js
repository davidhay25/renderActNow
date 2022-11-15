#!/usr/bin/env node


//questions
//mcode laterality is a string - do we want cc



//have a json file with mappings for coded data based on a key (eg BMI)
//then a function tgat takes in the key/data and retuirns the CC
/*
* Changes to do
*
* Make compliant with the conditional upodate bund;e
*   all id's are uuuids
*   create identifiers using what is currently the id
*   add the conditional update query to each entry
*   fix all the issues noted in the validation
*
*
*
* */

//todo
// when processing a medication lookup the code from a terminology service (or other). Cache for performance.
// Have an array of observation codes. when processing an observation (with a known key) can look up the code
// check for observations off medication that are the same (code, date. value) and only create a single one


const fs = require('fs');
const axios = require('axios').default;

function createUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let identifierRoot = "http://mosaic.com/"       //common root for all identifiers...

let countToImport = 100

//let serverBase = null       //Assumed to be the transaction endpoint of the target server. Will upload if this server supplied
let serverBase = "http://localhost:9092/baseR4"
//let serverBase = "http://actnow.canshare.co.nz:9092/baseR4/"
//let serverBase = "http://localhost:9876/fhir"

//let serverBase = "https://hof.smilecdr.com/fhir_request/"


//let validationServer = "https://r4.ontoserver.csiro.au/fhir/"
let validationServer = "http://hapi.fhir.org/baseR4/"
let validateBundle = false

//let sourceSystem = "http://clinfhir.com"        //the source system for identifier system...
let snomed = "http://snomed.info/sct"

//definitions
let regimenCategory = {coding:[{system:"http://unknown.org",code:"regimenCP"}]}
let cycleCategory = {coding:[{system:"http://unknown.org",code:"cycleCP"}]}
let patientCategory = {coding:[{system:"http://unknown.org",code:"patientCP"}]}

//profiles
let profRegimenCarePlan = "http://canshare.co.nz/fhir/StructureDefinition/an-careplan-regimen"
let profCycleCarePlan = "http://canshare.co.nz/fhir/StructureDefinition/an-careplan-cycle"
let profMedicationAdministration = "http://canshare.co.nz/fhir/StructureDefinition/an-medication-administration"
let profMedicationRequest = "http://canshare.co.nz/fhir/StructureDefinition/an-medication-request"
let profCondition = "http://canshare.co.nz/fhir/StructureDefinition/an-condition"
let profHistology = "http://canshare.co.nz/fhir/StructureDefinition/an-histology"

//profiles for Observations
let profBsa = "http://canshare.co.nz/fhir/StructureDefinition/an-bsa"
let profCC = "http://canshare.co.nz/fhir/StructureDefinition/an-creat-clear"

let profGleason = "http://canshare.co.nz/fhir/StructureDefinition/an-gleason"


//profiles for TNM
let profcT = "http://canshare.co.nz/fhir/StructureDefinition/an-cT"
let profcN = "http://canshare.co.nz/fhir/StructureDefinition/an-cN"
let profcM = "http://canshare.co.nz/fhir/StructureDefinition/an-cM"
let profcGroup = "http://canshare.co.nz/fhir/StructureDefinition/an-cGroup"

let profpT = "http://canshare.co.nz/fhir/StructureDefinition/an-pT"
let profpN = "http://canshare.co.nz/fhir/StructureDefinition/an-pN"
let profpM = "http://canshare.co.nz/fhir/StructureDefinition/an-pM"
let profpGroup = "http://canshare.co.nz/fhir/StructureDefinition/an-pGroup"



//extension urls
let extRegimenType = "http://hl7.org.nz/fhir/StructureDefinition/sact-regimen-type"

let extOriginalData = "http://clinfhir.com/fhir/StructureDefinition/canshare-original-data"
let extCycleNumber = "http://canshare.co.nz/fhir/StructureDefinition/an-cycle-number"
let extCycleDay = "http://canshare.co.nz/fhir/StructureDefinition/an-cycle-day"
let extCycleCount = "http://canshare.co.nz/fhir/StructureDefinition/an-cycle-count"

let extDoseAdjustReason = "http://canshare.co.nz/fhir/StructureDefinition/an-dose-adjustment-reason"
let extPrescribedDose = "http://canshare.co.nz/fhir/StructureDefinition/an-prescribed-dose"

let extLaterality = "http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-laterality-qualifier"
let extTreatmentIntent = "http://canshare.co.nz/fhir/StructureDefinition/an-iot"
let exCyclePlannedLength = "http://canshare.co.nz/fhir/StructureDefinition/an-cycle-planned-length"
let extDiscontinue = "http://canshare.co.nz/fhir/StructureDefinition/an-regimen-discontinued"

let hashRegimen = {}
let hashCycle  = {}
let hashAllPatients = {}        //hash of patients by id so we don't duplicate patients...

let arAdministration = []

loadAllData(false)      //load all the data into hashs, ignoring those with a missing reference or duplicate

//now construct the FHIR resources.
//strategy is to create a bundle for each regimen entry - this will be POSTed to the server
//Each bundle will have one regimen level CP, all Cycle CP's that reference that regimen, and all admins that reference that cycle

async function insert() {
    //await insertDataOneRegimen("4121-48770")
    //await insertDataOneRegimen("4121-124154")
    //await insertDataOneRegimen("4121-111315")

    let keys = Object.keys(hashRegimen)

    //first entry are the headers
    for (let i=1; i < countToImport+1; i++) {
        //console.log(keys[i])
        await insertDataOneRegimen(keys[i])
    }
}

//kick off the whole insert process
insert()

function makeHash(ar,seed) {
    let tmp = ar.join('-')        //if there are 2 identical drugs (in all respects) then this won't work
    if (seed) {tmp += '-' + seed}
    return require('crypto').createHash('md5').update(tmp).digest("hex")

}

async function insertDataOneRegimen(regimenId) {
    console.log('---------------------')
    console.log("Inserting data for " + regimenId)

    //make the patient id the same as the regimen id

    //need to create a patient using the 'identifier' in the regimen (it's jus a number - we'll use it as the id)
    let arRegimen = hashRegimen[regimenId].data      //array of data from thie regimen line in the csv
    //console.log(arRegimen)
    let patientIdentifier = arRegimen[2]           //in a real situation this is the NHI
    //console.log("Patient identifier: " + arRegimen[2])


    //new strategy: Create a separate Patient resource for each regimen, & use the Patient.identifier to teel when they are the same
    //makes the UI simpler - doesn't overly affect the design as everything would still support multiple regimens per patient
    //in any case, when getting data from multiple sources we can;t assume that a single patient resource has been established so
    //inevitable there will be multiple patient resources for the same actual person. But we can assume the NHI will be there so a query
    //for all data for a person will need to query multiple patients by identifier.
    //each supplier of data will have a specific system for the identifier


    //create the patient resource. Make up a name as this is anonymized..
    //If a patient has multiple regimens in the csv, then the patient patient care plan will have the same identifier, so should work ok
    //regimenId should be unique within the csv file
    let patient = {resourceType:"Patient",name:[{text:"John Doe - " + regimenId}]} //,id:regimenId
    patient.id = createUUID()
    patient.identifier = [{system:identifierRoot + "Patient",value:patientIdentifier}]
    addNarrative(patient,"Identifier: " + patientIdentifier)

    //create the transaction bundle of resources that represents a single regimen. This includes all resources...
    let bundle = createBundle(regimenId,patient)
    if (bundle) {

        //save the bundle to a file. Currently local or in the IG
        //let fileName = "/Users/davidhay/IG/cs-actnow/input/examples/Bundle-" + bundle.id + ".json"
        let fileName = "./out/bundle-" + regimenId + ".json"
        console.log("Filename: "+ fileName)
        let str = JSON.stringify(bundle,null,2)
        fs.writeFileSync(fileName,str)

        //perform a validation
        if (validateBundle) {
            let url = validationServer + "Bundle/$validate"
            console.log('Validating...')
            axios.post(url, bundle)
                .then(function (response) {
                    let fileName = "./out/bundle-" + regimenId + "-validate.json"
                    fs.writeFileSync(fileName,response.data)
                    //console.log(response.status);
                    //return
                }).catch(function(ex) {
                    console.log(ex.response.data)
                })

        }

        //write to the server
        if (serverBase) {
            //let url = serverBase //

            console.log("POSTing to "+serverBase)

            return axios.post(serverBase, bundle)
                .then(function (response) {
                    console.log(response.status);
                    //return
                })

                .catch(function (error) {
                    if (error.response) {
                        console.log("Error ",error.response.data);
                       // console.log("Text element",)
                    } else {
                        console.log("Error ",error.code)
                    }

                    // return

                });
        } else {
            console.log("Not updating server")
            return
        }
    } else {
        console.log("No cycles. Ignoring.")
    }

}


//======== only functions below this point...

// create a bundle with all resources that reference a single regimen. The initial call - it calls subsequent functions
function createBundle(regimenId,patient) {
    let bundle = {resourceType:'Bundle',type:'transaction',entry:[]}
    bundle.id = regimenId;
    let ar = [patient]      //even if this patient has been created before, it still is added to the bundle

    //create the regimen CP and associated resources (eg Observations). The regimen function will also create the associated cycle & admin
    //console.log(hashRegimen[regimenId])


    //makeRegimenCP kicks off the entire bundle build for this entry in the regimens file
    ar = ar.concat(makeRegimenCP(hashRegimen[regimenId],patient) )


    hash = {}
    let cntCycles = 0    //quite a few cycles have no date which are ignored. Don't save a regimen with no cycle (total cycleCount == 1)
    ar.forEach(function(resource){
       let id = resource.id
        //delete resource.id
        let entry = {resource:resource}
        if (resource.resourceType == "CarePlan" && resource.category[0].coding[0].code == "cycleCP") { cntCycles++}
        //let fullUrl = "http://canshare.co.nz/fhir/"+ resource.resourceType + "/" + resource.id
        let fullUrl = "urn:uuid:" +id
        entry.fullUrl = fullUrl

        if (hash[fullUrl]) {
            console.log('duplicate fullUrl:' + fullUrl)
        } else {
            hash[fullUrl] = true
        }

        if (! resource.identifier || !resource.identifier[0]) {
            console.log('missing identifier ' ,resource)
        }

        //all updates are represented as conditional updated on the resource identifier (which is required)
        entry.request = {method:"PUT",url:resource.resourceType + "?identifier=" + resource.identifier[0].system + "|" +resource.identifier[0].value}
        bundle.entry.push(entry)
    })

    //console.log(cntCycles)
    
    if (cntCycles > 1) {
        console.log(cntCycles + " cycles")
        return bundle
    } else {
        return null
    }


}


//create a regimen type careplan from the data in one line of the csv file
//work from the mapping table - https://docs.google.com/spreadsheets/d/1IQTtG_agKUcBAqV_hlaZYhZY0PXRn6kp9qxvNwRWlLk/edit#gid=0
function makeRegimenCP(vo,patient) {


    //make the patient careplan. For now - create a new CP for each patient. may want only 1 per patient,
    //but we're already creating a separate Patient instance for regimen. todo does need further thought...

    let ar = vo.data    //the actual data from the csv

    //patient level careplan. Make the identifier specific to the patient not the regimen - that way there will only be one patient CP
    let cpPatient = {resourceType:"CarePlan",id:'pat-' + ar[0],status:'active',intent:'order'}
    cpPatient.id = createUUID()
    cpPatient.identifier = [{system: identifierRoot+"CarePlan",value:'pat-' + patient.identifier[0].value}]
    // cpPatient.identifier = [{system: identifierRoot+"CarePlan",value:'pat-' + ar[0]}]

    addNarrative(cpPatient,"Patient plan")

    cpPatient.subject = {reference:"urn:uuid:"+patient.id}
    cpPatient.category = [patientCategory]


    //the regimen plan
    let cp = {resourceType:"CarePlan",id:ar[0],status:'active',intent:'order'}
    cp.id = createUUID()

    addProfile(cp,profRegimenCarePlan)
    // - don't delete just yet addExtension(cp,extOriginalData,'valueString',JSON.stringify(ar))   //the data used to create this one

    cp.identifier = [{system:identifierRoot + "CarePlan",value:'regimen-' + ar[0]}]

    //there are a number of required extensions
    cp.extension = []
    cp.extension.push({url:extTreatmentIntent,valueCodeableConcept: {text:ar[3]}})     //intent of treatment
    cp.extension.push({url:extRegimenType,valueCodeableConcept: {text:ar[4]}})     //regimen type

    cp.title = ar[4]
    cp.subject = {reference: "urn:uuid:" +patient.id}
    cp.category = [regimenCategory]         //defined above - specifies this as a regimen plan
    cp.partOf = [{reference:"urn:uuid:" +cpPatient.id}]     //a reference to the Patient CP


    if (ar[8] == 'Y') {
        //the plan has been completed
        cp.status = "completed"
    }

    if (ar[10]) {
        //this is discontinue date - the plan was halted prior to completion
        cp.status = "revoked"

        //now add the reason. An Outcome Observation seems better as that would allow the person and other stuff to be added


        if (ar[11]) {


            let ext = {url: extDiscontinue, extension :[]}
            ext.extension.push({url:"reason",valueCodeableConcept : {text:ar[11] }})
            cp.extension = cp.extension || []
            cp.extension.push(ext)

/*
            let outcomeObsId = createUUID()
            let outcomeObs = {resourceType:"Observation",id:outcomeObsId,status:"final"}
            addNarrative(outcomeObs,"Outcome observation: Discontinued " + ar[11])
            outcomeObs.code = {text:"outcome",coding:[{code:"385676005",system:"http://snomed.info/sct"}]}
            outcomeObs.valueCodeableConcept = {text:ar[11]}
            outcomeObs.focus = [{reference:"urn:uuid:"+ cp.id}] //has a reference back to the regimen plan
            outcomeObs.subject = {reference: "urn:uuid:" +patient.id}
            */
        } else {
            let ext = {url: extDiscontinue, extension :[]}
            ext.extension.push({url:"reason",valueCodeableConcept : {text:"No reason given" }})
            cp.extension = cp.extension || []
            cp.extension.push(ext)
        }
    }

    if (ar[9]) {
        //number of cycles
        addExtension(cp,extCycleCount,'valueInteger',parseInt(ar[9]))
    }

    //the intent of the regimen
    let ccIntent = {text:ar[3]}

    //addExtension(cp,extTreatmentIntent,'valueCodeableConcept',ccIntent)
   
    //start and end date
    cp.period = {}
    cp.period.start = convertDate(ar[6])
    cp.period.end = convertDate(ar[7])

    addNarrative(cp,"Regimen plan: " + cp.status)

    let arResources = [cp]

    arResources.push(cpPatient)


    //add the Condition
    let condition = {resourceType:"Condition"}
    condition.id = createUUID()
    condition.subject = {reference:"urn:uuid:"+patient.id}

    addProfile(condition,profCondition)
    condition.identifier = [{system:identifierRoot + "Condition",value:"condition-"+ ar[0]}]  //use the regimen identifier

    let codeText = ar[13]
    condition.code = {coding:[{system:"http://hl7.org/fhir/sid/icd-9-cm",code:ar[12]}]}

    if (codeText) {
        codeText = codeText.trim()
        condition.code.text = codeText
    }

    addNarrative(condition,codeText)

    addExtension(condition,extLaterality,'valueString',ar[14])

    //the reference from the regimen to the Condition
    cp.addresses = [{reference:"urn:uuid:"+ condition.id}]

    //add the Histology observation and reference it from Condition.evidence
    let HistObsId = createUUID() // cp.id + "-histology"
    let histObs = {resourceType:"Observation",id:HistObsId,status:"final"}
    addNarrative(histObs,"Histology")
    addProfile(histObs,profHistology)
    histObs.identifier = [{system:identifierRoot + "Observation",value:"histology-" + ar[0]}]
    histObs.subject = {reference:"urn:uuid:"+patient.id}
    histObs.code = {coding:[{system:snomed,code:"82231000004111"}]}


    if (ar[15]) {
        histObs.component = histObs.component || []
        histObs.component.push({code:{text:"histologyCode"},valueCodeableConcept:{text:ar[15]}})
    }
    if (ar[16]) {
        histObs.component = histObs.component || []
        histObs.component.push({code:{text:"grade"},valueString:ar[16]})
    }
    if (ar[17]) {
        histObs.component = histObs.component || []
        histObs.component.push({code:{text:"dxclass"},valueString:ar[17]})
    }

    arResources.push(histObs)

    condition.evidence = [{detail:[{reference:"urn:uuid:"+histObs.id}]}]
    arResources.push(condition)



    //add the TNM staging
    //todo exlude null entries - what if only some of the fields are populated?
    //this is pathological staging only todo ?need to add clincial staging as well
    //patient,regimen,type,t,n,m,stage

    //pathological TNM staging. Assume that the combined stage is present, and if it is then the others are present...
    if (ar[25]) {
        let arTnmResources = makeTNMStagingPath(patient,cp,ar[22],ar[23],ar[24],ar[25],ar)
        arResources = arResources.concat(arTnmResources)
        //The condition staging should reference the TNM. The first resource returned by makeTNMStaging is the combined stage
        let tnmStage = arTnmResources[0]
        if (tnmStage) {
            condition.stage = condition.stage || []
            condition.stage.push({assessment:[{reference:"urn:uuid:"+tnmStage.id}]})
        }
    }

    //clinical TNM staging
    if (ar[21]) {
        let arClinTnmResources = makeTNMStagingClin(patient, cp, null, ar[18], ar[19], ar[20], ar[21],ar)
        arResources = arResources.concat(arClinTnmResources)
        //The condition staging should reference the TNM. The first resource returned by makeTNMStaging is the combined stage
        let tnmStageClin = arClinTnmResources[0]
        if (tnmStageClin) {
            condition.stage = condition.stage || []
            condition.stage.push({assessment: [{reference: "urn:uuid:" + tnmStageClin.id}]})
        }
    }


    //now add the Other Observations

    //an array for the observations from a regimen. the number is the position in the csv
    let hashCPObservations = []
    hashCPObservations[26] = {key:'ER',code:"ER"}
    hashCPObservations[27] = {key:'PR',code:"PR"}
    hashCPObservations[28] = {key:'HER2',code:"HER2"}

    hashCPObservations[29] = {key:'Gleason_primary',code:"Gleason-primary"}
    hashCPObservations[30] = {key:'Gleason_secondary',code:"Gleason-secondary"}
    hashCPObservations[31] = {key:'Gleason_tertiary',code:"Gleason-tertiary"}

    for (var i = 26; i< 29; i++) {          //the gleason scores are done separately as the Observation is specific
        let obsValue = ar[i]              //this is the key that came through in the extract. todo Will convert to a real code

        if (obsValue && obsValue !== 'NULL') {
            let obsKey = hashCPObservations[i]  //{key,code}

            let ObsId = createUUID() // cp.id + obsKey.code + i

            let obs = {resourceType:"Observation",id:ObsId,status:"final"}
            obs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,i)}]
            obs.subject = {reference:"urn:uuid:"+patient.id}
            obs.code = {text:obsKey.code,coding:[{system:'http://canshare.co.nz/dummy',code:obsKey.code}]}
            obs.valueString = obsValue
            obs.effectiveDateTime = cp.period.start         //todo assume the date is the start of the regimesn
            addNarrative(obs,obsValue)

            //todo reference from CP -> OBs (which is correct when the observation is made when the regimen comences)
            cp.supportingInfo = cp.supportingInfo || []
            cp.supportingInfo.push({reference:"urn:uuid:"+ obs.id})

            arResources.push(obs)

        } 
    }

    //now we can check the gleason score
    let glPrimary = ar[29]
    let glSecondary = ar[30]
    let glTertiary = ar[31]

    if (glPrimary || glSecondary || glTertiary) {

        let obsGleason  = {resourceType:"Observation",id:createUUID(),status:"final"}
        obsGleason.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'gleason')}]
        addProfile(obsGleason,profGleason)
        obsGleason.subject = {reference:"urn:uuid:"+patient.id}
        obsGleason.code = {text:"Gleason score",coding:[{system:snomed,code:"372278000"}]}

        obsGleason.effectiveDateTime = cp.period.start         //todo assume the date is the start of the regimesn
        addNarrative(obsGleason,"Gleason score")

        obsGleason.component = []
        if (glPrimary) {
            let comp = {code:{text:'Gleason primary',coding:[{system:snomed,code:"384994009"}]}}
            comp.valueInteger = parseInt(glPrimary)
            obsGleason.component.push(comp)
        }
        if (glSecondary) {
            let comp = {code:{text:'Gleason secondary',coding:[{system:snomed,code:"384995005"}]}}
            comp.valueInteger = parseInt(glSecondary)
            obsGleason.component.push(comp)
        }
        if (glTertiary) {
            let comp = {code:{text:'Gleason tertiary',coding:[{system:snomed,code:"385002007"}]}}
            comp.valueInteger = parseInt(glTertiary)
            obsGleason.component.push(comp)
        }

        //todo reference from CP -> OBs (which is correct when the observation is made when the regimen comences)
        cp.supportingInfo = cp.supportingInfo || []
        cp.supportingInfo.push({reference:"urn:uuid:"+ obsGleason.id})

        arResources.push(obsGleason)

    }

    //now, add all the cycles (and related resources like MedicationAdministrations & Observations)...

    vo.cycles.forEach(function(cycleId){

        let arCpCycleResources = makeCycleCP(hashCycle[cycleId],patient,cp)
        arResources = arResources.concat(arCpCycleResources)
    })


    return arResources
}


//create a CarePlan representing a cycle of treatment
//vo is the entry for this cycle in hashCycle
function makeCycleCP(vo,patient,cpRegimen) {


    let ar = vo.data    //from the line in the cycle csv file

    if (! ar[4] || ! ar[5]) {
        console.log('Cycle with no period')
        return []
    }
    let meds = vo.meds  //medications associated with this - each entry is an array representng a line from the admin.csv file
    let arResources = []    //the resources created by this function (CarePlan, Medications, Observations)
    //console.log(meds)
    let cp = {resourceType:"CarePlan",id:ar[1],status:'active',intent:'plan'}
    cp.id = createUUID()
    // - don't delete just yet addExtension(cp,extOriginalData,'valueString',JSON.stringify(ar))   //the data used to create this one
    cp.category = [cycleCategory]
    cp.identifier = [{system:identifierRoot + "CarePlan",value:ar[1]}]

    cp.title = "Plan for cycle"
    addProfile(cp,profCycleCarePlan)

    addExtension(cp,extCycleNumber,'valueInteger',parseInt(ar[2]))

    //assume the length field in the extract is the planned length
    addExtension(cp,exCyclePlannedLength,'valueInteger',parseInt(ar[3]))

    addNarrative(cp,"Cycle CP")

    cp.subject = {reference:"urn:uuid:"+patient.id}
    cp.partOf = [{reference:"urn:uuid:" +cpRegimen.id}]     //a reference to the Regimen CP

    cp.period = {}     
    cp.period.start = convertDate(ar[4])
    cp.period.end = convertDate(ar[5])

    addNarrative(cp,"Cycle plan")
    arResources.push(cp)

    //now create the MedicationAdministrations and Observations from the administration line
    meds.forEach(function(arLne){
        //lne is a single line from the admin.csv file
        let arAdminResources = makeMedAdmin(arLne,patient,cp)
        arResources = arResources.concat(arAdminResources)
    })

    return arResources

}

function makeMedAdmin(ar,patient,cp) {
    let newId = createUUID()

    let identifierValue = makeHash(ar)
    //there is no id for the admin - need to construct one by hashing the entire record



    let arResources = []

    if (! ar[11]) {   //drug start time -
        //this is a prescribed drug

        let rx = {resourceType:"MedicationRequest",id:newId,status:"active",intent:"plan"}
        rx.medicationCodeableConcept = {text:ar[6]}
        addProfile(rx,profMedicationRequest)

        if (ar[9]) {
            let di = {text:ar[9]}

            //rx.dosageInstruction = {text:ar[9]}     //administered dose  - always the administered dase
            di.text = di.text.trim()
            if (ar[10]) {
               di.route = {text: ar[10]}
            }
            rx.dosageInstruction = [di]
        }


        rx.subject = {reference:"urn:uuid:"+patient.id}
        rx.authoredOn = convertDate(ar[5])
        rx.identifier = [{system:identifierRoot + "MedicationRequest" ,value:identifierValue}]
        rx.supportingInformation = [{reference:"urn:uuid:"+cp.id}]
        addNarrative(rx, ar[6])


        return [rx]
    } else {
        //this is a drug with administration times - ie actually given
        let admin = {resourceType:"MedicationAdministration",id:newId,status:'completed'}
        // - don't delete just yet addExtension(admin,extOriginalData,'valueString',JSON.stringify(ar))   //the data used to create this one

        //addExtension(cp,extBasedOn,'valueReference',{reference:"CarePlan/"+cp.id})   //the data used to create this one
        addProfile(admin,profMedicationAdministration)
        admin.identifier = [{system:identifierRoot + "MedicationAdministration" ,value:identifierValue}]      //temp hack as there is no search param for Supporting info
        admin.supportingInformation = [{reference:"urn:uuid:"+cp.id}]

        //cycle day is a complex extension now
        if (ar[4]) {
            admin.extension = admin.extension || []
            let ext = {url: extCycleDay, extension:[]}
            //this is the administered cycle day
            ext.extension.push({"url":"administered",valueInteger : parseInt(ar[4])})
            admin.extension.push(ext)
        }

        //addExtension(admin,extCycleDay,'valueInteger',parseInt(ar[4]))

        //admin.subject = {reference:"Patient/"+patient.id}
        admin.subject = {reference:"urn:uuid:"+patient.id}
        admin.medicationCodeableConcept = {text:ar[6]}
        addNarrative(admin, ar[6])

        if (ar[9]) {
            admin.dosage = {text:ar[9]}     //administered dose  - always the administered dase
            admin.dosage.text = admin.dosage.text.trim()

            //there's an invariant in the spec that dose or rate must be present
            //assume format is dose {space} amount
            let ar1 = admin.dosage.text .split(" ")
            admin.dosage.dose = {value:parseFloat(ar1[0]),unit:ar1[1]}

            if (ar[10]) {
                admin.dosage.route = {text: ar[10].trim()}
            }
        }

        //if the prescribed dose is different to the administered dose
        if (ar[8]) {
            if (ar[8] !== ar[9]) {
                admin.dosage.text += " (Rx:" + ar[8] + ")"
                addExtension(admin,extPrescribedDose,'valueString',ar[8])
            }
        }

       // admin.dosage.route = {text:ar[8]}
        admin.effectivePeriod = {}

        admin.effectivePeriod.start = convertDateTime(ar[11])
        admin.effectivePeriod.end = convertDateTime(ar[12])

        //console.log(admin.effectivePeriod,ar[11],ar[12])

        //check for dose adjustment reasons
        for (var i = 15; i <18 ; i++ ) {
            if (ar[i] && (ar[i] !== "NULL")) {
                addExtension(admin,extDoseAdjustReason,'valueString',ar[i])   //dose adjustment reason
            }
        }

//console.log(admin)

        arResources.push(admin)

        //Is there a BSA value
        if (ar[18] ) {

            let obs = {resourceType:"Observation",id:createUUID(), status:"final"}
            obs.subject = {reference:"urn:uuid:"+patient.id}
            // not really this relationship obs.partOf = [{reference:"urn:uuid:"+admin.id}]
            obs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar)}]
            obs.basedOn = [{reference:"urn:uuid:"+cp.id}]
            obs.code = {text:"BSA",coding:[{system:"http://loinc.org",code:"8277-6"}]}         //todo confirm code for BSA
            obs.valueQuantity = {unit:"m2",value: parseFloat(ar[18]) ,system:"http://unitsofmeasure.org"}
            obs.effectiveDateTime = admin.effectivePeriod.start      //todo - this is an assumption
            addNarrative(obs,"BSA " + ar[18])
            addProfile(obs,profBsa)
            arResources.push(obs)
        }

        //Is there a creatinine clearance value
        if (ar[19]) {
            let obs = {resourceType:"Observation",id:createUUID(),status:"final"}
            obs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar)}]
            obs.subject = {reference:"urn:uuid:"+patient.id}
            //obs.partOf = [{reference:"urn:uuid:"+admin.id}]
            obs.basedOn = [{reference:"urn:uuid:"+cp.id}]
            obs.code = {text:"Creatinine Clearance",coding:[{system:"http://loinc.org",code:"13449-4"}]}         //todo confirm code for CR
            obs.valueQuantity = {value:parseFloat(ar[17])}              //todo check units
            obs.effectiveDateTime = admin.effectivePeriod.start      //todo - this is an assumption
            addNarrative(obs,"Creatinine Clearance " + ar[17])
            addProfile(obs,profCC)
            arResources.push(obs)
        }
    }

    return arResources
}

//create a set of TNM stage observations compliant with mCode (https://hl7.org/fhir/us/mcode/index.html)
//uses the clincial codes
function makeTNMStagingPath(patient,regimen,t,n,m,stage,ar) {


    //create an id based on regimenId and type of obe (only 1 per regimen ATM)
    //let stageObs = makeObservation(regimen.id+'tnm-path-stage', patient,"21908-9",stage,"TNM group")
    let stageObs = makeObservation(createUUID(), patient,"21908-9",stage,"TNM group",ar)
    stageObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'ptnm')}]
    addProfile(stageObs,profpGroup)
    addNarrative(stageObs,"Pathological TNM Group: " + stage)

    //let tObs = makeObservation(regimen.id+'tnm-path-t',patient,"21905-5",t)
    let tObs = makeObservation(createUUID(),patient,"21905-5",t,"",ar)
    tObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'pt')}]
    addProfile(tObs,profpT)
    addNarrative(tObs,"Pathological T: " + t)

    //let nObs = makeObservation(regimen.id+'tnm-path-n',patient,"21906-3",n)
    let nObs = makeObservation(createUUID(),patient,"21906-3",n,"",ar)
    nObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'pn')}]
    addProfile(nObs,profpN)
    addNarrative(nObs,"Pathological N: " + n)

    //let mObs = makeObservation(regimen.id+'tnm-path-m',patient,"21907-3",m)
    let mObs = makeObservation(createUUID(),patient,"21907-3",m,"",ar)
    mObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'pm')}]
    addProfile(mObs,profpM)
    addNarrative(mObs,"Pathological M: " + m)

    stageObs.hasMember = []


    stageObs.hasMember.push({reference:"urn:uuid:"+tObs.id})
    stageObs.hasMember.push({reference:"urn:uuid:"+nObs.id})
    stageObs.hasMember.push({reference:"urn:uuid:"+mObs.id})
    regimen.supportingInfo = regimen.supportingInfo || []
    regimen.supportingInfo.push({reference:"urn:uuid:"+ stageObs.id})


    return [stageObs,tObs,nObs,mObs]

}

function makeTNMStagingClin(patient,regimen,type,t,n,m,stage,ar) {
    //create an id based on regimenId and type of obe (only 1 per regimen ATM)



    //let stageObs = makeObservation(regimen.id+'tnm-clin-stage', patient,"c-tnm",stage,"TNM group")
    let stageObs = makeObservation(createUUID(), patient,"c-tnm",stage,"TNM group",ar)
    stageObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'ctnm')}]
    addProfile(stageObs,profcGroup)
    addNarrative(stageObs,"Clinical TNM Group: " + stage)

    //let tObs = makeObservation(regimen.id+'tnm-clin-t',patient,"c-t",t)
    let tObs = makeObservation(createUUID(),patient,"c-t",t,"",ar)
    tObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'ct')}]
    addProfile(tObs,profcT)
    addNarrative(tObs,"Clinical T: " + t)

    //let nObs = makeObservation(regimen.id+'tnm-clin-n',patient,"c-n",n)
    let nObs = makeObservation(createUUID(),patient,"c-n",n,"",ar)
    nObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'cn')}]
    addProfile(nObs,profcN)
    addNarrative(nObs,"Clinical N: " + n)

    //let mObs = makeObservation(regimen.id+'tnm-clin-m',patient,"c-m",m)
    let mObs = makeObservation(createUUID(),patient,"c-m",m,"",ar)
    mObs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar,'cm')}]
    addProfile(mObs,profcM)
    addNarrative(mObs,"Clinical M: " + m)

    stageObs.hasMember = []
    //stageObs.hasMember.push({reference:"Observation/"+tObs.id})
    //stageObs.hasMember.push({reference:"Observation/"+nObs.id})
    //stageObs.hasMember.push({reference:"Observation/"+mObs.id})
    //regimen.supportingInfo = regimen.supportingInfo || []
    //regimen.supportingInfo.push({reference:"Observation/"+ stageObs.id})

    stageObs.hasMember.push({reference:"urn:uuid:"+tObs.id})
    stageObs.hasMember.push({reference:"urn:uuid:"+nObs.id})
    stageObs.hasMember.push({reference:"urn:uuid:"+mObs.id})
    regimen.supportingInfo = regimen.supportingInfo || []
    regimen.supportingInfo.push({reference:"urn:uuid:"+ stageObs.id})


    return [stageObs,tObs,nObs,mObs]

}

//make an observation
function makeObservation(id,patient,loincCode,value,display,ar){
    let obs = {resourceType:"Observation",id:id,status:"final"}
    obs.identifier = [{system:identifierRoot + "Observation",value:makeHash(ar)}]
    obs.subject = {reference:"urn:uuid:"+patient.id}
    obs.code = {coding:[{system:'http://loinc.org',code:loincCode}]}
    if (display) {
        obs.code.text = display
    }

    obs.valueCodeableConcept = {coding:[{system:'http://cancerstaging.org',code:value}]}

    return obs
   

}

function addExtension(resource,url,type,value) {
    if (value) {
        resource.extension = resource.extension || []
        let ext = {url:url}
        ext[type] = value
        resource.extension.push(ext)
    }

}

//convert from dd/mm/yy to YMD
function convertDate(inDate) {
    //console.log(inDate)
    if (inDate) {
        //console.log('old',inDate)
        let ar = inDate.split('/')
        let d = "0"+ar[0]
        let m = "0"+ar[1]
        let y = ar[2]       //now 4 chars for year


        let newDate = y + '-' + m.substr(-2) + '-' + d.substr(-2)
        //console.log('new',newDate)
        return newDate

        //let d = new Date(y,ar[1],ar[0])
        //return d.toISOString()
    }
   
}

//11/05/16 11:00
//todo - quite dependant on input - make more robust
function convertDateTime(inDate) {
    //console.log(inDate)
    //Jul  1 2019  9:40PM


    if (inDate) {
        let t = inDate.replace(/  +/g, ' ')
        //console.log('dt',t)
        let ar = t.split(" ")
        let month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(ar[0])
        month++
        month = '0' + month
        let day = '0' + ar[1]
        let year = ar[2]

        //now get the time hh:mmAM
        let time = ar[3]
        let isPM = false
        if (time.indexOf('PM') > -1) {
            isPM = true
        }
        time = time.replace("AM",'')
        time = time.replace("PM",'')

        //time is hrs:minsAM - but hours are not leading 0

        let ar1 = time.split(':')
        let hrs = ar1[0]
        if (isPM) {
            hrs += 12
        }
        sHrs = '0' + hrs
        sMins = '0' + ar1[1]
        let newDate = year + '-' + month.substr(-2) + '-' + day.substr(-2)
        newDate += "T"+ sHrs.substr(-2)+ ":" + sMins.substr(-2) + ":00Z"
        //console.log(newDate)

        return newDate

        /*

        console.log("dt",inDate)
        //get the date part
        let ar1 = inDate.split(" ")
        let da = ar1[0]

        let time = ar1[1]
        //time is hrs:mins - but hours are not leading 0
        let ar2 = time.split(':')
        if (ar2[0].length == 1) {ar2[0] = '0' + ar2[0]}
        let newTime = ar2.join(':')


        let ar = da.split('/')
        let d = "0"+ar[0]
        let m = "0"+ar[1]
        let y =  ar[2]

        let newDate = y + '-' + m.substr(-2) + '-' + d.substr(-2)

        newDate += "T"+newTime + ":00Z"

        */


        //let d = new Date(y,ar[1],ar[0])
        //return d.toISOString()
    }
   
}


//add the profile declaration
function addProfile(resource,profile) {
    resource.meta = {profile:[profile]}
}


//add the .text (narrative) element to a resource
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

//========= all the routines to load the data from csv into hashes


function loadAllData(showIssues) {

    //load regimen plans
    let vo = loadCsv("./regimen.csv",0,showIssues)
    hashRegimen = vo.hash
    console.log(Object.keys(hashRegimen).length + " unique regimen entries, " + vo.dups + " duplicated entries")

    //load cycles
    let vo1 =  loadCsv("./cycle.csv",1,showIssues)
    let hashAllCycle = vo1.hash
    console.log(Object.keys(hashAllCycle).length + " unique cycle entries, " + vo1.dups + " duplicated entries")

    //check for cycles with no valid regimen. Also populate the cycle hash with the regimen hash...
    invalidCyleCount = 0

    Object.keys(hashAllCycle).forEach(function(cycleKey){

        let arCycle = hashAllCycle[cycleKey].data       //data from csv

        let regimenId = arCycle[0]          //the location of the regimenid (course_code)
        if (! hashRegimen[regimenId]) {
            invalidCyleCount++
            if (showIssues) {
                console.log("Cycle " + cycleKey + " refers to a non-existant regimen code (" + regimenId + ")")
            }  
        } else {
            //there was a valid regimen entry found
            hashCycle[cycleKey] = {data:arCycle,regimenId:regimenId}    //store the data and the key/id to the parent regimen

            //also add a reference from the regimen to the cycle
            let tmp = hashRegimen[regimenId]
            tmp.cycles = tmp.cycles || []
            tmp.cycles.push(cycleKey)       //the id's of all cycles associated with this regimen
           
        }
    })

    console.log("There were " + Object.keys(hashCycle).length + " cycle entries that had a valid reference to a regimen entry and " +  invalidCyleCount + " where the cycle could not be found")

    //load the administrations. They don't have a unique id, so are in an array...
    let arAllAdministration = loadAdministrations()

    //now check for admins where the link to cycle or admin plans is not correct
    //only those administrations that have a valid link to a cyclw will beprocessed

    let missingCycle = 0
    arAllAdministration.forEach(function(ar){
        let cycleID = ar[2]
        if (hashCycle[cycleID]) {
            arAdministration.push(ar)

            //associate the administration with the cycle...
            let cycle = hashCycle[cycleID]
            cycle.meds = cycle.meds || []
            cycle.meds.push(ar)


        } else {
            missingCycle ++
            if (showIssues) {
                console.log("admin entry has reference to invalid cycle code: "+ cycleID)
            }
        }

    }) 



    console.log('There are ' + arAdministration.length + " valid administrations, " + missingCycle + " where the cycle entry could not be found")


}




function loadAdministrations() {
    let allAdmins = []
    let data = fs.readFileSync("./admin.csv").toString()
    let hash = {}
    let ar = data.split('\r\n')

    ar.forEach(function(lne){
        lne = lne.trim()
        allAdmins.push(lne.split(','))
    })


    return allAdmins

}


function loadCsv(fileName,idPos,showIssues) {

    let data = fs.readFileSync(fileName).toString()
    let hash = {}

    let ar = data.split('\r\n')
    let dups = 0
    ar.forEach(function(lne){
        let ar1 = lne.split(",")
        let id = ar1[idPos]          //the course code - ie 
        if (hash[id]) {
            dups ++
            if (showIssues) {
                console.log(fileName + ": Duplicate code: " + id)
            }
           
        } else {
            hash[id] = {data:ar1}
        }
    })
    return {hash:hash,dups:dups}
    

}
