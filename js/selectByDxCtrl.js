angular.module("anApp")
    .controller('selectByDxCtrl',
        function ($scope,$http,anSvc) {

            let tagFolderSystem = "http://clinfhir.com/fhir/NamingSystem/qFolderTag"
            $scope.input = {}

            $scope.hashQByTag = {}      //hash of Q by tag. contains array of Q with that tag

            let qry = "/an/getConditionSummary"
            $scope.showWaiting = true
            $http.get(qry).then(
                function(data) {
                    $scope.allDx = data.data
                }
            ).finally(
                function () {
                    $scope.showWaiting = false
                }
            )

            $scope.selectRegimen = function(cp){
                //select a regimen. Pass back the cp
                $scope.$close(cp)
            }

            //find all CarePLans where there is a reference to a Condition with the given code
            $scope.findPlansWithCode = function(dx) {
                if (dx.code == 'unknown') {
                    alert("There was no code for this condition in the import file so it cannot be selected")
                    return
                }
                $scope.selectedDx = dx
                let qry = `/an/getCarePlansWithCode/${dx.code}`

                $http.get(qry).then(
                    function(data) {
                        $scope.arRegimens = []      //all
                        if (data.data.entry) {
                            data.data.entry.forEach(function (entry) {
                                let resource = entry.resource   //a CarePlan resource. Will be a regimen plan todo: may need to check as design evolves
                                $scope.arRegimens.push(resource)
                                //console.log(resource)
                            })
                        }


                        //$scope.conditionWithDx = data.data
                    }
                ).finally(
                    function () {
                        $scope.showWaiting = false
                    }
                )
            }


        }
    )