
angular.module("anApp")
    .controller('registryCtrl',
        function ($scope,$http,$uibModal,$timeout) {
            $scope.input = {}



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


            //load all the data for the patient
            $scope.loadPatient = function(id) {
                $scope.showWaiting = true

                let url1 = `/an/fhir/Patient/${id}/$everything`
                $http.get(url1).then(
                    function(data) {
                        $scope.allResourcesBundle = data.data

                        //console.log(data.data)
                        $scope.hashResources = {}     //key by resource type

                        data.data.entry.forEach(function (entry) {
                            //keep the patient out of it. It clutters the graph
                            //todo maybe exclude DR (save in a different object. Have observations as contained
                            let resource = entry.resource
                            $scope.hashResources[resource.resourceType] = $scope.hashResources[resource.resourceType] || []
                            $scope.hashResources[resource.resourceType].push(resource)

                            if (entry.resource.resourceType == 'Patient'){
                                $scope.selectedPatient = entry.resource
                            }
                        })

                        console.log($scope.hashResources)
                        makeDocTree()   //the tree of existing documents

                    },
                    function (err) {
                        console.log(err)
                    }
                ).finally(function () {
                    $scope.showWaiting = false
                })
            }


            function makeDocTree() {
                //constuct the tree to display documents
                let hash = $scope.hashResources['QuestionnaireResponse']
                if (hash) {
                    Object.keys(hash).forEach(function (key) {
                        let QR = hash[key]
                        console.log(QR)
                    })
                }
            }



        })