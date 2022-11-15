
angular.module("anApp")
    .controller('actnowCtrl',
        function ($scope,$http,$uibModal,anSvc,$timeout) {

            $scope.input = {}
            $scope.moment = moment
            $scope.anSvc = anSvc

            let extCycleNumber = "http://canshare.co.nz/fhir/StructureDefinition/an-cycle-number"
            let extDoseAdjustReason = "http://canshare.co.nz/fhir/StructureDefinition/an-dose-adjustment-reason"
            let extCycleDay = "hhttp://canshare.co.nz/fhir/StructureDefinition/an-cycle-day"

            let validationServer = "http://hapi.fhir.org/baseR4/"       //where the profiles are

            $scope.fhirSpecRoot = "http://hl7.org/fhir/"

            $scope.input.server = "local"
            $scope.selectServer = function (server) {
                console.log(server)
                $http.post(`/setServer/${server}`).then(
                    function(data){
                        loadPatients()
                        alert(`Server has been set to ${server}`)
                    }, function(err) {
                        alert(err.data + ". You should re-load the page and use the local server.")
                    }
                )}

            //load all patients for dropdown select. Note that a single patient can have multiple resources - use identifier to combine
            function loadPatients() {
                $http.get("/ds/fhir/Patient").then(
                    function(data) {
                        $scope.allPatientIds = []
                        data.data.entry.forEach(function(entry){
                            $scope.allPatientIds.push(entry.resource.id)
                        })


                        $scope.input.selectedPatientId = $scope.allPatientIds[0]
                        $scope.loadPatient($scope.input.selectedPatientId)
                    })
            }
            loadPatients()


            $scope.selectCycleFromSummary = function(cycle) {
                $scope.selectedCycleFromSummary = cycle
                delete $scope.input.csSelectedResource
                //console.log(cycle)
            }

            //get a link to the profile in the spec
            $scope.getProfileLink = function (resource) {
                delete $scope.urlToProfile
                if (resource.meta && resource.meta.profile) {
                    //for now, we can assume only a single profile...
                    //In theory, this should resolve - byt we want the IG entry...
                    let IGRoot = "http://build.fhir.org/ig/davidhay25/actnow/branches/main/"
                    let profileUrl = resource.meta.profile[0]
                    let ar = profileUrl.split('/')
                    $scope.urlToProfile = `${IGRoot}StructureDefinition-${ar[ar.length-1]}.html`

                }
            }

            //used by the API query
            $scope.executeQuery = function (qry) {
                delete $scope.input.selectedFromQuery
                //let url = "http://localhost:9092/baseR4/" + qry
                let url = "/proxy?url=" + btoa("http://localhost:9092/baseR4/" + qry)


                $http.get(url).then(
                    function (data) {
                        $scope.input.queryStatus = data.status
                        $scope.queryResult = data.data
                    }, function (err) {
                        $scope.queryResult = err.data
                        $scope.input.queryStatus = data.status
                    }
                )
            }

            $scope.validateFromGraph = function (resource) {
                delete $scope.graphValidationResults
                $scope.validating = true
                //let url = `http://hapi.fhir.org/baseR4/${resource.resourceType}/$validate`
                let url = "/an/validate"
                $scope.showWaiting = true
                $http.post(url,resource).then(
                    function (data) {

                        $scope.graphValidationResults = data.data

                    }, function (err) {
                        $scope.graphValidationResults = err.data
                    }
                ).finally(
                    function(){
                        $scope.showWaiting = false
                        $scope.validating = false
                    }
                )

            }

           $scope.validateFromTimeline = function (resource) {
                delete $scope.timelineValidationResults
               $scope.validating = true
               let url = `http://hapi.fhir.org/baseR4/${resource.resourceType}/$validate`
               $scope.showWaiting = true
               $http.post(url,resource).then(
                   function (data) {

                       $scope.timelineValidationResults = data.data

                   }, function (err) {
                       $scope.timelineValidationResults = err.data
                   }
               ).finally(
                   function(){
                       $scope.showWaiting = false
                       $scope.validating = false
                   }
               )

           }

            $scope.validate = function() {
                $scope.validating = true
                let url = "http://hapi.fhir.org/baseR4/Bundle/$validate"
                $scope.showWaiting = true
                $http.post(url,$scope.allResourcesBundle).then(
                    function (data) {

                        $scope.validationResults = data.data
                        makeValidationSummary($scope.validationResults)
                    }, function (err) {
                        $scope.validationResults = err.data
                        makeValidationSummary($scope.validationResults)
                    }
                ).finally(
                    function(){
                        $scope.showWaiting = false
                        $scope.validating = false
                    }
                )

                function makeValidationSummary(OO) {
                    $scope.validationIssues = []
                    OO.issue.forEach(function (iss) {

                        let item = {type: iss.severity}
                        item.iss = iss
                        item.detail = iss.diagnostics
                        try {
                            let loc = iss.location[0]
                            //get the location of the resource in in $scope.allResourcesBundle
                            let ar = loc.split('[')
                            let ar1 = ar[1].split(']')
                            let inx = parseInt(ar1[0])// -1
                            item.inx = inx

                            if (inx >=0 && inx < $scope.allResourcesBundle.entry.length) {
                                item.resource = $scope.allResourcesBundle.entry[inx].resource
                            }

                            //now make a shorted display
                            let ar2 = loc.split('ofType')
                            item.location = ar2[1]

                            $scope.validationIssues.push(item)
                        } catch (ex) {
                            $scope.validationIssues.push(item)
                            console.log(ex,"Error processing issue:" )
                            console.log(JSON.stringify(iss))
                        }
                    })
                }
            }

            $scope.selectIssue = function(iss){
                let loc = iss.location[0]       //has the index entry in $scope.allResourcesBundle
                let ar = loc.split('[')
                let ar1 = ar[1].split(']')
                let inx = parseInt(ar1[0]) -1
                console.log(inx)
                $scope.input.validationResource =  $scope.allResourcesBundle.entry[inx]
            }


            $scope.selectByNhi = function() {


                $uibModal.open({
                    backdrop: 'static',      //means can't close by clicking on the backdrop.
                    keyboard: false,       //same as above.
                    //size: 'sm',
                    templateUrl: 'modalTemplates/selectByNhi.html',
                    controller: function ($scope) {
                        $scope.input = {}
                        //$scope.input.system = "http://clinfhir.com"
                        //$scope.input.value = "patient5"
                        $scope.select = function () {
                            let vo = {system:$scope.input.system,value:$scope.input.value}
                            $scope.$close(vo)
                        }
                    }
                }).result.then(
                    function (vo) {
                        let nhi = vo.value
                        let system = vo.system

                        if (nhi) {
                            let qry
                            if (system) {
                                qry = `/an/fhir/Patient?identifier=${system}|${nhi}`
                            } else {
                                qry = `/an/fhir/Patient?identifier=${nhi}`
                            }

                            //let qry = `/an/fhir/Patient?identifier=${nhi}`
                            $http.get(qry).then(
                                function(data){
                                    if (data.data && data.data.entry) {
                                        if (data.data.entry.length == 1) {


                                            $scope.input.selectedPatientId = data.data.entry[0].resource.id
                                            $scope.loadPatient($scope.input.selectedPatientId)
                                        } else {
                                            alert(`There were ${data.data.entry.length} patients with identifiers matching ${system}|${nhi}. This shouldn't happen!`)
                                        }
                                    } else {
                                        alert(`There were no patients with identifiers matching ${system}|${nhi}`)
                                    }
                                }, function(){
                                    alert(`There were no patients with identifiers matching ${system}|${nhi}`)
                                }
                            )

                        }
                    }
                )

               // let nhi = prompt("What is the NHI (Patient identifier)")
                //let system = "" // "https://standards.digital.health.nz/ns/nhi-id"





            }

            //select patient on diagnosis
            $scope.selectByRegimenIdentifier = function() {
                $uibModal.open({
                    backdrop: 'static',      //means can't close by clicking on the backdrop.
                    keyboard: false,       //same as above.
                    //size: 'sm',
                    templateUrl: 'modalTemplates/selectByRegimenIdentifier.html',
                    controller: function ($scope) {
                        $scope.input = {}
                        //$scope.input.system = "http://clinfhir.com"
                        //$scope.input.value = "patient5"
                        $scope.select = function () {
                            let vo = {system:$scope.input.system,value:$scope.input.value}
                            $scope.$close(vo)
                        }
                    }
                }).result.then(
                    function (vo) {
                        console.log(vo)
                        let qry = `/ds/fhir/CarePlan?identifier=${vo.value}`
                        if (vo.system) {
                            qry = `/ds/fhir/CarePlan?identifier=${vo.system}|${vo.value}`
                        }
                        //let qry = `/ds/fhir/Patient?identifier=${vo.system}|${vo.value}`

                        $http.get(qry).then(
                            function (data) {
                                console.log(data)
                                if (data.data.entry) {
                                    switch (data.data.entry.length) {
                                        case 0 :
                                            alert("There were no matching regimens")
                                            break
                                        case 1 :
                                            //the regimen careplan was located. Load the associated patient,,,
                                            let regimenCP = data.data.entry[0].resource
                                            let ref = regimenCP.subject.reference
                                            let ar = ref.split('/')
                                            let patientId = ar[ar.length-1]
                                            //let patient = data.data.entry[0].resource
                                            console.log(patientId)
                                            $scope.input.selectedPatientId = patientId

                                            
                                            
                                            $scope.loadPatient(patientId)
                                            break
                                        default :
                                            alert(`There were ${data.data.entry.length} patients with this identifier. This is an error. Try a different one.`)
                                            break
                                    }
                                } else {
                                    alert("No matches")
                                }
                            }
                        )
                    }
                )
            }


            //select patient on diagnosis
            $scope.selectByDx = function() {
                $uibModal.open({
                    backdrop: 'static',      //means can't close by clicking on the backdrop.
                    keyboard: false,       //same as above.
                    size : 'lg',
                    templateUrl: 'modalTemplates/selectByDx.html',
                    controller: 'selectByDxCtrl'
                }).result.then(

                    function (regimen) {
                        //pass back the regimen. We cal select the patient as the id's are the same (though could get the patient id from the subject if we need....)

                        let patRef = regimen.subject.reference
                        let ar = patRef.split('/')

                        $scope.input.selectedPatientId = ar[ar.length-1]
                        //$scope.input.selectedPatientId = patientId

                        $scope.loadPatient(regimen.id)
                    })

            }



            //locate a standard in actnow
            $scope.searchStandardDEP= function() {
                $uibModal.open({
                    backdrop: 'static',      //means can't close by clicking on the backdrop.
                    keyboard: false,       //same as above.
                    size : 'lg',
                    templateUrl: 'modalTemplates/findStandard.html',
                    controller: 'findStandardCtrl'
                })

            }

            $scope.graphTabSelected = function(){
                $timeout(function(){
                    if ($scope.chart) {
                        $scope.chart.fit();
                    }


                },1000)

            }

            //thing is an object with a .resource element - from the cycles table tab
            $scope.selectThing = function(thing){
                $scope.input.selectedCycleThing = thing
                let resource = thing.resource

                //are there any observations that have a 'partOf' reference to this seelcted thing? created by createCyclesArray()
                let refKey = resource.resourceType + "/" + resource.id

                $scope.observations = $scope.hashMedObs[refKey]

            }

            //a particular observation code was selected todo: currently the text (form the csv file)
            $scope.selectObservation = function(code) {
                $scope.selectedObservationCode = code
                $scope.selectedObservationList = $scope.hashAllObs[code]
            }


            $scope.loadPatient = function(id) {
                $scope.showWaiting = true

                //if


                delete  $scope.selectedCycleFromSummary

                //$scope.loadReports()       //todo add patient filter


                let url1 = `/an/fhir/Patient/${id}/$everything`
                $http.get(url1).then(
                    function(data) {
                        $scope.allResourcesBundle = data.data
                        //create a sorted list for the list
                        $scope.resourcesList = []
                        $scope.allResourcesBundle.entry.forEach(function (entry) {
                            $scope.resourcesList.push(entry.resource)
                        })
                        $scope.resourcesList.sort(function (a,b) {
                            if (a.resourceType > b.resourceType) {
                                return 1
                            } else {
                                return -1
                            }
                        })

                        //console.log(data.data)
                        $scope.allEntries = []
                        data.data.entry.forEach(function (entry) {
                            //keep the patient out of it. It clutters the graph
                            //todo maybe exclude DR (save in a different object. Have observations as contained
                            if (entry.resource.resourceType !== 'Patient'){
                                $scope.allEntries.push(entry)
                            } else {
                                $scope.selectedPatient = entry.resource
                            }
                        })


                        createCyclesArray()     //and hashAllObsById
                        createRegimensArray()       //must come after createCyst

                        createGraph($scope.allEntries)

                        createTimeLine($scope.uniqueMedAdminDate,$scope.hashMedObs)

                    },
                    function (err) {
                        console.log(err)
                    }
                ).finally(function () {
                    $scope.showWaiting = false
                })
            }

            $scope.selectResourceFromList = function (resource) {
                $scope.selectedResourceFromList = resource
            }
            $scope.loadReportsDEP = function (patientIdentifier) {
                //load all the reports for a patient. Right now, this is all reports...
                //note that is real life, these would actulally be DiagnosticReports with observations... (but the data should be the same)
                //todo may be better to create a specific service in structuredpath for this

                $http.get("/an/getQRSummary").then(
                    function(data) {
                        console.log(data.data)
                        $scope.reportQR = data.data
                    }
                )


            }

            $scope.selectQR = function (item) {
                delete $scope.selectedQR
                let qry = `an/getQR/${item.id}`
                $http.get(qry).then(
                    function(data) {
                        $scope.selectedQR = data.data

                        //now get the associated Q
                        let qUrl = $scope.selectedQR.questionnaire

                        $http.get("/an/getQbyUrl?url=" + qUrl).then(
                            function (data) {
                                console.log(data.data)
                                $scope.selectedQ = data.data

                                //Compare the QR against the requirements of the Q
                                $scope.audit =  anSvc.auditQRAgainstQ($scope.selectedQ,$scope.selectedQR)

                                let vo = anSvc.makeTreeFromQ($scope.selectedQ)
                                drawTree(vo.treeData)
                            }
                        )

                    }, function (err) {
                        console.log(err)
                    }
                )


            }


            function makeANTree() {
                $http.get("/an/getQbyUrl?url=http://canshare.com/fhir/Questionnaire/actnowdatastandard").then(
                    function (data) {
                        console.log(data.data)
                        $scope.openModelinPublicPage = "https://canshare.co.nz/dataStandards.html?" + data.data.id
                        let vo = anSvc.makeTreeFromQ(data.data)
                        drawTree(vo.treeData,'anTree')
                    }, function (err) {
                        console.log(err.data)
                    }
                )
            }
            makeANTree()

            let drawTree = function(treeData,elementId){
                //console.log(treeData)
                treeData.forEach(function (item) {
                    item.state.opened = true
                    if (item.parent == 'root') {
                        item.state.opened = false;
                    }
                })

                elementId = elementId || "qTree"


                $('#'+elementId).jstree('destroy');

                let x = $('#'+elementId).jstree(
                    {'core': {'multiple': false, 'data': treeData, 'themes': {name: 'proton', responsive: true}}}
                ).on('changed.jstree', function (e, data) {
                    //seems to be the node selection event...

                    if (data.node) {
                        $scope.selectedNode = data.node;

                        //add meta
                        let element = data.node.data.item

                        let desc = anSvc.getSingleExtension (element,"http://clinfhir.com/fhir/StructureDefinition/canshare-questionnaire-item-description","String")
                        data.node.data.meta = {description:desc}

                        //console.log(data.node)
                    }

                    $scope.$digest();       //as the event occurred outside of angular...
                })
            }

            //only 1 per patient at present....(and likely to remain if we have a specific patient resource per regimen
            function createRegimensArray() {
                $scope.arRegimens = []
                $scope.allEntries.forEach(function (entry) {
                    let resource = entry.resource

                    if (resource.resourceType == 'CarePlan' && getCarePlanCategory(resource) == 'regimenCP') {
                        //this is a regimen CarePlan
                        let vo = {resource:resource,supportingInfo:[]}
                        if (resource.supportingInfo) {
                            resource.supportingInfo.forEach(function(si){
                                vo.supportingInfo.push($scope.hashAllObsById[si.reference])
                                // let ar = si.
                            })
                        }

                        //now add all the Observations that refer to this CP via a 'basedOn link
                        //todo - haven't got any yet

                        $scope.arRegimens.push(vo)
                        //find the Condition that this regimen refers to.
                        //todo when there are multiple regimens, this will need to change...
                        findCondition(resource)
                    }


                })

                $scope.clinicalSummary = anSvc.createSummary($scope.allEntries)
            }

            //find the condition associated with this regimen plan
            //todo assume only 1 - is this correct?
            function findCondition(regimen) {
                delete $scope.addressedCondition
                let conditionId     //the condition that this CP refers to in the .addresses element
                if (regimen.addresses) {
                    regimen.addresses.forEach(function (addr) {
                        let ref = addr.reference
                        let ar = ref.split('/')
                        if (ar[0] == 'Condition') {
                            conditionId = ar[1]
                        }

                    })
                    $scope.allEntries.forEach(function (entry) {
                        if (entry.resource.resourceType == 'Condition' && entry.resource.id == conditionId) {
                            $scope.addressedCondition = entry.resource

                        }
                    })
                }

            }

            function getCarePlanCategory(cp) {
                let cpType
                if (cp.category && cp.category[0].coding) {
                    cpType = cp.category[0].coding[0].code
                }
                return cpType
            }

            //create an array to support a display of cycles. Also the hash of unique dates for the timeline..
            //and the hash of observations for a med (based on med id)
            //and the hash of observations for an observation code
            function createCyclesArray() {

                //first, create a hash of admins by cycle, and Observations by MA
                let hashAdmin = {}
                $scope.hashMedObs = {}
                $scope.hashAllObs = {}          //all obs keyed by code (description ATM) - for all Observations array
                $scope.hashAllObsById = {}

                $scope.uniqueMedAdminDate = {}      //a hash of all dates that an administration was given
                $scope.uniqueRxDate = {}      //a hash of all dates that a prescription was given (MR)
                $scope.allEntries.forEach(function (entry) {
                    let resource = entry.resource
                    switch (resource.resourceType) {
                        case "MedicationAdministration" :

                            //the date that the administratoion was given - for the timeline
                            if (resource.effectivePeriod) {
                                let da = resource.effectivePeriod.start
                                if (da) {
                                    //only want to day accuracy
                                    let ar = da.split("T")
                                    let day = ar[0]
                                    $scope.uniqueMedAdminDate[day] = $scope.uniqueMedAdminDate[day] || []
                                    $scope.uniqueMedAdminDate[day].push(resource)
                                }

                            }


                            //the reference to the careplan
                            if (resource.supportingInformation) {
                                resource.supportingInformation.forEach(function (si) {
                                    let ref = si.reference
                                    //assume that reference is to a careplan - should check...
                                    hashAdmin[ref] = hashAdmin[ref] || []
                                    hashAdmin[ref].push(resource)
                                })
                            }
                            break

                        case "MedicationRequest" :
                            if (resource.authoredOn) {
                                //only want to day accuracy
                                let ar = resource.authoredOn.split("T")
                                let day = ar[0]
                                $scope.uniqueRxDate[day] = $scope.uniqueRxDate[day] || []
                                $scope.uniqueRxDate[day].push(resource)
                            }

                            break
                        case "Observation" :

                            $scope.hashAllObsById["Observation/"+resource.id] =  resource   //to allow lookup by reference
                            //update the all obs hash
                            //todo ? look at category to exclude outcome Observations (or some other way)
                            let key = resource.code.text      //todo - look at code

                            if (key) {
                                $scope.hashAllObs[key] = $scope.hashAllObs[key] || []
                                $scope.hashAllObs[key].push(resource)
                            }

                            //if there's a partof then check what the reference is to...
                            if (resource.partOf) {
                                resource.partOf.forEach(function (po) {

                                    let ref = po.reference
                                    let ar = ref.split('/')
                                    if (ar[0] == 'MedicationAdministration') {
                                        $scope.hashMedObs[ref] = hashAdmin[ref] || []
                                        $scope.hashMedObs[ref].push(resource)
                                    }

                                })
                            }
                            break
                    }

                })

                //sort the hashAllObs by date
                Object.keys($scope.hashAllObs).forEach(function (key) {

                    $scope.hashAllObs[key].sort(function(a,b) {
                        if (a.effectiveDateTime > b.effectiveDateTime) {
                            return 1
                        } else {
                            return -1
                        }
                        }
                    )

                })

                //now create the cycles
                $scope.arCycles = []
                $scope.allEntries.forEach(function (entry) {
                    let resource = entry.resource

                    if (resource.resourceType == 'CarePlan' && getCarePlanCategory(resource) == 'cycleCP') {
                        //this is a cycle CP
                        let cycle = {}
                        cycle.period = resource.period
                        cycle.resource = resource

                        let start = moment()
                        if (cycle.period && cycle.period.start) {
                            start = moment(cycle.period.start)
                        }
                        let end = moment()
                        if (cycle.period &&cycle.period.end) {
                            start = moment(cycle.period.end)
                        }


                        cycle.length = end.diff(start,'days')

                        cycle.cycleNumber = getSingleExtension(resource,extCycleNumber,'valueInteger')

                        //Get the administrations linked to this cycle
                        let h = hashAdmin["CarePlan/"+resource.id]
                        if (h) {
                            cycle.admins = []
                            h.forEach(function (MA) {
                                let admin = {}      //a vo for a single administration
                                admin.drugName = MA.medicationCodeableConcept.text
                                if (MA.dosage) {
                                    admin.dose = MA.dosage.text
                                    if (MA.dosage.route) {
                                        admin.route = MA.dosage.route.text
                                    }
                                }


                                //actually should always be a period
                                if (MA.effectivePeriod) {
                                    let startAdmin = moment(MA.effectivePeriod.start)
                                    let endAdmin = moment(MA.effectivePeriod.end)
                                    admin.start = MA.effectivePeriod.start
                                    admin.length = endAdmin.diff(startAdmin,'minutes')
                                }




                                admin.day = getSingleExtension(MA,extCycleDay,'valueString')


                                admin.resource = MA

                                admin.adjust = getMultiExtension(MA,extDoseAdjustReason,'valueString')

                                cycle.admins.push(admin)
                            })

                            cycle.admins.sort(function(a,b){
                                if (a.start > b.start) {
                                    return 1
                                } else {
                                    return -1
                                }
                            })


                        }




                        $scope.arCycles.push(cycle)
                    }
                })

                $scope.arCycles.sort(function(a,b){
                    if (a.period.start > b.period.start) {
                        return 1
                    } else {
                        return -1
                    }
                })

                console.log($scope.arCycles)


            }



            function createTimeLine(uniqueMedAdminDate,hashMedObs) {
                //hashMedObs are all observations for a geven ma
                // https://visjs.github.io/vis-timeline/docs/timeline/

                $('#medTimeline').empty();     //otherwise the new timeline is added below the first...

                let arData = []
                let uniqueMeds = {}     //unique medications. used for the grouping
                ctr = 0

                //console.log(uniqueMedAdminDate)

                Object.keys(uniqueMedAdminDate).forEach(function (date) {
                    let arMeds = uniqueMedAdminDate[date]        //all meds administered on that date
                    //now create an item for each med in the hash using the drug name as a grouper
                    //unclear what happens if the drug name is repeated...
                    arMeds.forEach(function (MA) {
                        let drugName = "Unknown"        //this will be the group
                        if (MA.medicationCodeableConcept) {
                            drugName = MA.medicationCodeableConcept.text

                            let route = ""
                            if (MA.dosage && MA.dosage.route) {
                                drugName += " " + MA.dosage.route.text
                            }

                        }



                        //just the details of the med
                        uniqueMeds[drugName] = {id:drugName,content:drugName}

                        let item = {}
                        item.id = ctr++
                        item.start = date
                        item.group = drugName
                        item.MA = MA
                        item.resource = MA
                        item.observations = hashMedObs[`MedicationAdministration/${MA.id}`]
                        if (item.observations && item.observations.length > 0) {
                            item.className = 'red'
                            item.title = "Has observations"
                        }

                        if (MA.dosage) {
                            item.content = MA.dosage.text
                        }

                        arData.push(item)

                    })
                })


                //add the Rx data to the mix
                Object.keys($scope.uniqueRxDate).forEach(function (date) {
                    let arRx = $scope.uniqueRxDate[date]        //all meds prescribed on that date
                    arRx.forEach(function (rx) {
                        if (rx.authoredOn) {

                            //not actually getting routes on these meds
                            let route = ""
                            if (rx.dosageInstruction && rx.dosageInstruction.route) {
                                route = rx.dosageInstruction.route.text
                            }

                            let drugName = rx.medicationCodeableConcept.text + " (rx) " + route

                            //just the details of the med
                            uniqueMeds[drugName] = {id:drugName,content:drugName}

                            let item = {}
                            item.id = ctr++
                            item.start = date
                            item.group = drugName
                            item.rx = rx            //just for the display todo - make rx separate
                            item.resource = rx


                            arData.push(item)

                        }
                    })
                })



                let uniqueObs = {}      //has of unique observation types
                Object.keys($scope.hashAllObsById).forEach(function (key) {
                    let obs = $scope.hashAllObsById[key]
                    if (obs.effectiveDateTime) {        //todo - temp - just a shart term hack...
                        let item = {}
                        item.id = ctr++
                        item.start = obs.effectiveDateTime
                        let text = ""
                        if (obs.code && obs.coding) {
                            text = obs.coding[0].code
                        }
                        if (obs.code.text) {
                            text = obs.code.text
                        }


                        uniqueObs[text] = {id:text,content:text}
                        item.content = ""
                        if (obs.valueQuantity) {
                            item.content =  obs.valueQuantity.value.toString()
                        }

                        item.group = text
                        item.obs  = obs
                        item.resource = obs
                        arData.push(item)
                    }



                })

                //create the group array (individual drugs)
                let arGroups = []
                Object.keys(uniqueMeds).forEach(function (key) {
                    let group = uniqueMeds[key]
                    arGroups.push({id:group.id, content:group.content})
                })

                //add the observation group
                Object.keys(uniqueObs).forEach(function (key) {
                    let group = uniqueObs[key]
                    arGroups.push({id:group.id, content:group.content, style :"background-color:pink"})
                })


                var container = document.getElementById('medTimeline');


                let items = new vis.DataSet(arData)

                // Configuration for the Timeline
                var options = {};

                // Create a Timeline
                var timeline = new vis.Timeline(container, items, options);

                timeline.setGroups(arGroups)

                container.onclick = function(event) {
                    var props = timeline.getEventProperties(event)
                    let id = props.item
                    delete $scope.timelineValidationResults
                    $scope.selectedTimeLineItem = arData[id]
                    if ($scope.selectedTimeLineItem && $scope.selectedTimeLineItem.resource) {
                        $scope.getProfileLink($scope.selectedTimeLineItem.resource)
                    }

                    console.log(arData[id])
                    $scope.$digest()


                }


            }




            //return a specific value if there can only be a single extension
            function getSingleExtension(resource,url,vType) {
                let match
                if (resource.extension) {
                    resource.extension.forEach(function (ext) {
                        if (ext.url == url) {
                            match = ext
                        }
                    })
                }
                if (match) {
                    return match[vType]
                }
            }

            //get values if there can be more than one - return an array of values
            function getMultiExtension(resource,url,vType) {
                let matches = []
                if (resource.extension) {
                    resource.extension.forEach(function (ext) {
                        if (ext.url == url) {
                            matches.push(ext[vType])
                        }
                    })
                }
                return matches
            }

/*

            let url = "/ds/fhir/CarePlan?patient._id=patient1&_include=CarePlan:patient"
            $http.get(url).then(
                function(data) {
                    $scope.allResourcesBundle = data.data
                    $scope.allResources = []
                    $scope.allResourcesBundle.entry.forEach(function (entry) {
                        //keep the patient out of it. It clutters the graph
                        if (entry.resource.resourceType !== 'Patient'){
                            $scope.allResources.push(entry)
                        }

                    })
                    //now that we have the careplans, get all the medications for this patient
                    let urlAdmin = "/ds/fhir/MedicationAdministration?patient._id=patient1"
                    $http.get(urlAdmin).then(
                        function(data) {
                            console.log(data.data)
                            $scope.allAdminsBundle = data.data
                            $scope.allAdminsBundle.entry.forEach(function (entry) {
                                $scope.allResources.push(entry)

                            })
                            createGraph($scope.allResources)


                        }
                    )


                    console.log(data)

                }
            )

*/

            function createGraph(arResources) {

                    let vo = anSvc.makeGraph({arResources: arResources})  //actually entries...

                    let container = document.getElementById('graph');
                    let graphOptions = {
                        physics: {
                            enabled: true,
                            barnesHut: {
                                gravitationalConstant: -10000,
                            }
                        }
                    };
                    $scope.chart = new vis.Network(container, vo.graphData, graphOptions);

                    $scope.chart.on("click", function (obj) {
                        delete $scope.graphValidationResults
                        let nodeId = obj.nodes[0];  //get the first node
                        let node = vo.graphData.nodes.get(nodeId);





                        if (node.data && node.data.resource) {
                            $scope.selectedResource = node.data.resource;
                            $scope.getProfileLink($scope.selectedResource)
                            $scope.$digest()
                        }



                    })
/*
                    $scope.submitChart.on("stabilizationIterationsDone", function () {
                        $scope.submitChart.setOptions( { physics: false } );
                    });

*/

            }




        })