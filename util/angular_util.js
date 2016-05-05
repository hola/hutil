// LICENSE CODE ZON
'use strict'; /*jslint browser:true*/
define(['angular_1_4_8', '/util/escape.js', '/util/date.js'],
    function(angular, zescape, date){
angular.module('angular_util', [])
.filter('zdate', function(){
    return function(d, format){ return date.strftime(format||'%v', d); };
}).filter('nl2br', ['$sce', function($sce){
    return function(input){
        return $sce.trustAsHtml((''+(input||'')).replace(/\n/g, '<br>')); };
}]).filter('uri_comp', function(){
    return zescape.uri_comp.bind(zescape);
});
});
