// LICENSE_CODE ZON
'use strict'; /*zlint br*/
define(['angular_1_4_8', '/util/escape.js', '/util/date.js', '/util/url.js'],
    function(angular, zescape, date, url){
angular.module('angular_util', [])
.config(['$locationProvider', function($locationProvider){
    var old_get_location = $locationProvider.$get[
        $locationProvider.$get.length-1];
    var space_re = /%20/g;
    $locationProvider.$get[$locationProvider.$get.length-1] = function(){
        var $location = old_get_location.apply(this, arguments);
        var old_compose = $location.$$compose;
        function fixup(){
            var u = url.parse($location.$$url);
            $location.$$url = u.pathname+(u.search||'').replace(space_re, '+')
                +(u.hash||'').replace(space_re, '+');
            u = url.parse($location.$$absUrl);
            $location.$$absUrl = u.protocol+'//'+u.authority+u.pathname
                +(u.search||'').replace(space_re, '+')
                +(u.hash||'').replace(space_re, '+');
        }
        $location.$$compose = function(){
            old_compose.call(this);
            fixup();
        };
        fixup();
        return $location;
    };
}]).filter('zdate', function(){
    return function(d, format, opt){
        if (/^[+-]\d\d:?\d\d$/.test(opt))
            opt = {timezone: opt.replace(':', '')};
        return date.strftime(format||'%v', d, opt);
    };
}).filter('nl2br', ['$sce', function($sce){
    return function(input){
        return $sce.trustAsHtml((''+(input||'')).replace(/\n/g, '<br>')); };
}]).filter('nl2br_linky', [function(){
    return function(text){
        var re = /(\r\n|\n\r|\r|\n|&#10;&#13;|&#13;&#10;|&#10;|&#13;)/g;
        return (''+text).replace(re, '<br>$1');
    };
}]).filter('uri_comp', function(){
    return zescape.uri_comp.bind(zescape);
}).filter('mailto', function(){
    return zescape.mailto_url.bind(zescape);
}).directive('multiline', function($timeout){
    return {link: link, require: '?ngModel'};
    function link(scope, elm, attrs, ng_model){
        var el = elm[0], s = getComputedStyle(el), f = parseFloat, active = 0;
        var line = f(s.lineHeight);
        var min = line*2+f(s.paddingTop)+f(s.paddingBottom);
        el.rows = +attrs.rows||1;
        function set(v){
            if (v)
                el.style.height = typeof v == 'number' ? v+'px' : v;
        }
        function resize(){
            set('auto');
            set(active ? Math.max(min, el.scrollHeight) : el.scrollHeight);
        }
        elm.on('input', resize);
        elm.on('focus', function(){
            active = 1;
            resize();
        });
        elm.on('blur', function(){
            active = 0;
            resize();
        });
        el.style.overflowY = 'hidden';
        $timeout(resize);
        (ng_model||{}).$render = function(){
            elm.val(ng_model.$modelValue||'');
            resize();
        };
    }
});
});
