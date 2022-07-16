angular.module("anApp")
    .controller('findStandardCtrl',
        function ($scope,$http,anSvc) {

            let tagFolderSystem = "http://clinfhir.com/fhir/NamingSystem/qFolderTag"
            $scope.input = {}

            $scope.hashQByTag = {}      //hash of Q by tag. contains array of Q with that tag

            let qry = "/an/getQSummary"
            $scope.showWaiting = true
            $http.get(qry).then(
                function(data) {
                    if (data.data && data.data.entry) {
                        data.data.entry.forEach(function (entry) {
                            let Q = entry.resource  //this is Q header stuff only. uses _elements

                            Q.tags = []      //make it easier to access (as opposed to the meta element)
                            let isTest = false      //set to true if the Q has a test tag applied - don't show
                            if (Q.meta && Q.meta.tag) {
                                let rslt = false

                                Q.meta.tag.forEach(function (tag) {
                                    if (tag.system == tagFolderSystem) {
                                        let code = tag.code
                                        if (code && (code.toLowerCase() == 'test')) {
                                            isTest = true
                                        } else {
                                            $scope.hashQByTag[code] = $scope.hashQByTag[code] ||[]
                                            $scope.hashQByTag[code].push(Q)
                                        }

                                    }
                                })
                            }
                        })
                    }


                }
            ).finally(
                function () {
                    $scope.showWaiting = false
                }
            )

            //actually returns the array of miniQ for this tag...
            $scope.selectTag = function (ar) {
                $('#designTree').jstree('destroy');
                $scope.input.QforSelectedTag = ar //$scope.hashQByTag[tag]
            }

            //when a Q is selected, load the full version
            $scope.selectQ = function (miniQ) {
                $scope.showWaiting = true
                $('#designTree').jstree('destroy');
                let qry = `/an/getQ/${miniQ.id}`
                $http.get(qry).then(
                    function(data) {
                        $scope.selectedQ = data.data

                        //make the tree
                        let vo = anSvc.makeTreeFromQ($scope.selectedQ)
                        drawTree(vo.treeData)


                    }, function(err) {
                        alert(angular.toJson(err.data))
                    }
                ).finally(
                    function () {
                        $scope.showWaiting = false
                    }
                )
            }

            let drawTree = function(treeData){
                //console.log(treeData)
                treeData.forEach(function (item) {
                    item.state.opened = true
                    if (item.parent == 'root') {
                        item.state.opened = false;
                    }
                })

                $('#designTree').jstree('destroy');

                let x = $('#designTree').jstree(
                    {'core': {'multiple': false, 'data': treeData, 'themes': {name: 'proton', responsive: true}}}
                ).on('changed.jstree', function (e, data) {
                    //seems to be the node selection event...

                    if (data.node) {
                        $scope.selectedNode = data.node;
                        console.log(data.node)
                    }

                    $scope.$digest();       //as the event occurred outside of angular...
                })


            }

        }
    )