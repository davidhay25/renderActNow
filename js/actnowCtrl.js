
angular.module("anApp")
    .controller('actnowCtrl',
        function ($scope,$http,$uibModal,anSvc) {

            $scope.input = {}
            //$scope.moment = moment
            $scope.anSvc = anSvc

            let extCycleNumber = "http://clinfhir.com/fhir/StructureDefinition/canshare-cycle-number"
            let extDoseAdjustReason = "http://clinfhir.com/fhir/StructureDefinition/canshare-dose-adjustment-reason"

            //load all patients for dropdown select
            $http.get("/ds/fhir/Patient").then(
                function(data) {
                    $scope.allPatientIds = []
                    data.data.entry.forEach(function(entry){
                        $scope.allPatientIds.push(entry.resource.id)
                    })


                    $scope.input.selectedPatientId = $scope.allPatientIds[0]


                })

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

                        $scope.input.selectedPatientId = regimen.id
                        //set the dropdown of patient ids - todo won't scale!
                    //    $scope.allPatientIds.forEach(function (id) {


                      //  })

                        $scope.loadPatient(regimen.id)
                    })

            }



            //locate a standard in actnow
            $scope.searchStandard = function() {
                $uibModal.open({
                    backdrop: 'static',      //means can't close by clicking on the backdrop.
                    keyboard: false,       //same as above.
                    size : 'lg',
                    templateUrl: 'modalTemplates/findStandard.html',
                    controller: 'findStandardCtrl'
                })

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
                //let id = $scope.input.selectedPatientId
                //console.log($scope.input.selectedPatientId)
                //console.log("Loading data for " + id)
                let url1 = `/an/fhir/Patient/${id}/$everything`
                $http.get(url1).then(
                    function(data) {
                        $scope.allResourcesBundle = data.data
                        console.log(data.data)
                        $scope.allEntries = []
                        data.data.entry.forEach(function (entry) {
                            //keep the patient out of it. It clutters the graph
                            if (entry.resource.resourceType !== 'Patient'){
                                $scope.allEntries.push(entry)
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


            //only 1 at present....
            function createRegimensArray() {
                $scope.arRegimens = []
                $scope.allEntries.forEach(function (entry) {
                    let resource = entry.resource

                    if (resource.resourceType == 'CarePlan' && resource.category[0].coding[0].code == 'regimen') {


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
            }

            //find the condition associated with this regimen plan
            //todo assume only 1 - is this correct?
            function findCondition(regimen) {
                delete $scope.addressedCondition
                let conditionId     //the condition that this CP refers to in the .addresses element
                if (regimen.addresses) {
                    regimen.addresses.forEach(function (add) {
                        let ref = add.reference
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

                //sort the hashAllObs bu date
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

                    if (resource.resourceType == 'CarePlan' && resource.category[0].coding[0].code == 'cycle') {
                        //this is a cycle CP
                        let cycle = {}
                        cycle.period = resource.period
                        cycle.resource = resource
                        let start = moment(cycle.period.start)
                        let end = moment(cycle.period.end)
                        cycle.length = end.diff(start,'days')
                        cycle.cycleNumber = getSingleExtension(resource,extCycleNumber,'valueInteger')

                        //Get the administrations linked to this cycle
                        let h = hashAdmin["CarePlan/"+resource.id]
                        if (h) {
                            cycle.admins = []
                            h.forEach(function (MA) {
                                let admin = {}      //a vo for a single administration
                                admin.drugName = MA.medicationCodeableConcept.text
                                admin.route = MA.dosage.route.text
                                admin.dose = MA.dosage.text

                                let startAdmin = moment(MA.effectivePeriod.start)
                                let endAdmin = moment(MA.effectivePeriod.end)
                                admin.start = MA.effectivePeriod.start
                                admin.length = endAdmin.diff(startAdmin,'minutes')
                                admin.resource = MA
                                admin.adjust = getMultiExtension(MA,extDoseAdjustReason,'valueString')

                               // let ar = getMultiExtension(MA,extDoseAdjustReason,'valueString')
                            //if (admin.adjust.length > 0) {console.log(admin.adjust,cycle.cycleNumber)}

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
                        }

                        uniqueMeds[drugName] = {id:drugName,content:drugName}

                        let item = {}
                        item.id = ctr++
                        item.start = date
                        item.group = drugName
                        item.MA = MA
                        item.observations = hashMedObs[`MedicationAdministration/${MA.id}`]
                        if (item.observations && item.observations.length > 0) {
                            item.className = 'red'
                            item.title = "Has observations"
                        }

                        arData.push(item)

                    })
                })

                //create the group array (individual drugs)
                let arGroups = []
                Object.keys(uniqueMeds).forEach(function (key) {
                    let group = uniqueMeds[key]
                    arGroups.push({id:group.id, content:group.content})
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
                    $scope.selectedTimeLineItem = arData[id]
                    $scope.$digest()
                    console.log(arData[id])
                    //console.log(props);
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
                        let nodeId = obj.nodes[0];  //get the first node
                        let node = vo.graphData.nodes.get(nodeId);





                        if (node.data && node.data.resource) {
                            $scope.selectedResource = node.data.resource;
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