angular.module("anApp")

    .filter('trustUrl', function ($sce) {
        return function(url) {
            return $sce.trustAsResourceUrl(url);
        }})

    .filter('single-extension',function(){
        return function(resource,url,type) {
            let result
            if (resource && resource.extension && url) {
                resource.extension.forEach(function(ext){
                    if (ext.url == url) {
                        result = ext['value'+type]
                    }
                })
            }
            return result
        }
    })

    .filter('cardinality',function(){
        return function(item) {
            let display = false
            let min = "0"
            let max = "1"
            if (item.repeats) {
                max = "*"
                display = true
            }
            if (item.required) {min = "1"; display = true}

            if (display) {
                return min + ".." + max
            }

        }
    })

    .filter('HumanName',function(){
        return function (hn) {
            if (hn && hn.text) {
                return hn.text
            }
           // if ()


        }
    })

    .filter('NHI',function(){
        return function (patient) {
            let nhi = ""
            if (patient && patient.identifier) {
                patient.identifier.forEach(function (ident){

                    if (ident.system == "https://standards.digital.health.nz/ns/nhi-id") {
                        nhi = ident.value
                    }
                })
            }
            return nhi
        }})

        .filter('age',function(){
            return function(da){
                if (da) {
                    var diff = moment().diff(moment(da),'days');
                    var disp = "";

                    if (diff < 0) {
                        //this is a future date...
                        return "";
                    }

                    if (diff < 14) {
                        disp = diff + " days";
                    } else if (diff < 32) {
                        disp = Math.floor( diff/7) + " weeks";
                    } else {
                        disp = Math.floor( diff/365) + " years";
                        //todo logic for better age
                    }
                    return disp;

                } else {
                    return '';
                }

            }
        })

        .filter('prettyDate',function(){
            return function(da){
                if (da) {
                    return moment(da).format('MMM D hh:mm a')
                }

            }
        })

