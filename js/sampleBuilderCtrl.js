
angular.module("anApp")
    .controller('sampleBuilderCtrl',
        function ($scope,$http,$uibModal,anSvc) {

            $scope.input = {}

            //let serverBase = "http://canshare.co.nz/fhir/"


            let apiKey;

            let system = "http://clinfhir.com"      //to show that it's vendor specific
           // let dataServer = "http://home.clinfhir.com:8054/baseR4/"

            //let validationServer = "http://actnow.canshare.co.nz:9092/baseR4/"

            let validationServer = "https://r4.ontoserver.csiro.au/fhir/"
            let dataServer = "http://localhost:9091/an/processTransaction/"
            //let dataServer = "http://localhost:9091/an/validateTransaction/"
            //let dataServer = "http://localhost:9092/baseR4/"

            //let dataServer = "https://fhir.s37vcloskatg.static-test-account.isccloud.io/"
            //apiKey = "sJdH2KXzI14lWunvyxTQhEDQLTf54z396LtIyVya"

            let suffix = 5      //a suffix to add to all identifiers to make them unique - ig patient[x]. Can increment as needed
            $scope.dataServer = dataServer

            //------- create all the resources we'll need. They will be submitted in different bundles...
            let patient = {resourceType:"Patient",name:[{text:"John Doe"}],gender:"male",identifier:[{system:system,value:'patient'+suffix}]}
            patient.id = createUUID()
            patient.meta = {profile:["http://canshare.co.nz/fhir/StructureDefinition/an-patient"]}
            //delete patient.identifier

            let cpRegimen = {resourceType: "CarePlan",status:"active",intent:"plan",identifier:[{system:system,value:'cp'+suffix}]}
            cpRegimen.meta = {profile:["http://canshare.co.nz/fhir/StructureDefinition/an-careplan-regimen"]}
            cpRegimen.id = createUUID()
            cpRegimen.title = "Regimen CarePlan"
            cpRegimen.category = [{coding:[{system:'http://unknown.org',code:'regimenCP'}]}]

           // cpRegimen.


            let cp1 = {resourceType: "CarePlan",status:"active",intent:"plan",identifier:[{system:system,value:'cp'+suffix}]}
            cp1.meta = {profile:["http://canshare.co.nz/fhir/StructureDefinition/an-careplan-cycle"]}
            cp1.id = createUUID()
            cp1.title = "Cycle CarePlan"
            cp1.category = [{coding:[{system:'http://unknown.org',code:'cycleCP'}]}]
            cp1.partOf = [{reference:`urn:uuid:${cpRegimen.id}` }]

            //setReference(cp1,cpRegimen,'partOf')

            let ma1 = {resourceType:"MedicationAdministration",status:"completed",identifier:[{system:system,value:'ma'+suffix}]}
            ma1.medicationCodeableConcept = {text:"drug 1"}
            ma1.effectiveDateTime = "2022-01-01"
            ma1.supportingInformation = [{reference : `urn:uuid:${cp1.id}`}]
            ma1.meta = {profile:["http://canshare.co.nz/fhir/StructureDefinition/canshare-medication-administration"]}

            ma1.id = createUUID()

            let obsBSA = {resourceType:"Observation", status:"final",identifier:[{system:system,value:'bsa'+suffix}]}
            obsBSA.id = createUUID()
            obsBSA.code = {coding:[{system:'http://loinc.org',code:'8277-6'}]}
            obsBSA.valueQuantity = {value:1.96,unit:'m2',system:'http://unitsofmeasure.org'}
            obsBSA.effectiveDateTime = "2014-04-08T09:35:00Z"
            obsBSA.focus  = [{reference:`urn:uuid:${cp1.id}` }]  //focus is the careplan. No reference to med



            setReference(cpRegimen,patient,'subject')
            setReference(cp1,patient,'subject')

            setReference(ma1,patient,'subject')
            //setReference(ma1,cp1,'supporting')
            setReference(obsBSA,patient,'subject')

            //console.log(cp1)

            //--- construct the bundles. Each contains a copy of all resources referenced by any resource in the bundle (eg the patient appears in all)
            // all resources are added as conditional updates...


            //delete patient.identifier

            $scope.bundle1 = angular.copy(createTransactionBundle([patient,cpRegimen,cp1,obsBSA]))
            //$scope.bundle1 = angular.copy(createTransactionBundle([patient,cp1]))
            $scope.bundle2 = angular.copy(createTransactionBundle([patient,cpRegimen,cp1,ma1]))

            cp1.status = "completed"
            $scope.bundle3 = angular.copy(createTransactionBundle([patient,cpRegimen,cp1]))


            $scope.validate = function(bundle,inx) {
                console.log(bundle)
                $scope.validationResult = $scope.validationResult || []
                let url = validationServer + "Bundle/$validate"
                $http.post(url,bundle).then(
                    function (data) {
                        console.log('pass',data.data)
                        $scope.validationResult[inx] = data
                    }, function (err) {
                        console.log('err',err.data)
                        $scope.validationResult[inx] = data
                    }
                )
            }

            $scope.submitServer = function(bundle) {
                //console.log(angular.toJson(bundle))
                delete $scope.OO
                $scope.bundle = bundle
                let url = dataServer
                let config = {}
                if (apiKey) {
                    config.headers = config.headers || {}
                    config.headers['x-api-key'] = apiKey
                }

                $scope.showWaiting = true
                $http.post(url,bundle,config).then(
                    function(data) {
                        alert("Update complete")
                        console.log(data)
                    }, function(err) {
                        $scope.OO = err.data
                        //alert(angular.toJson(err.data))
                        console.log(err)
                    }
                ).then(
                    function(){
                        $scope.showWaiting = false
                    }
                )
            }



            function createTransactionBundle(arResources) {
                let bundle = {resourceType:"Bundle",type:"transaction",entry:[]}

                arResources.forEach(function (resource) {
                    let entry = {}
                    let identifierString = resource.identifier[0].system + "|" + resource.identifier[0].value
                    entry.fullUrl = "urn:uuid:" +resource.id
                    entry.resource = resource

                    //This is a conditional update
                    entry.request = {method:"PUT"}
                    entry.request.url = resource.resourceType + "?identifier=" + identifierString
                    bundle.entry.push(entry)
                })
                return bundle
            }


            function setReference(source, target,path) {
                //let uuid = createUUID()
                source[path] = {reference:`urn:uuid:${target.id}` }
            }

            function createUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
            

        })
