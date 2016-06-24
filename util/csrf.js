// LICENSE_CODE ZON ISC
'use strict'; /*jslint browser:true*/
define(['jquery', '/util/url.js', 'cookie'],
    function($, zurl, cookie){
var E = {};

E.get = function(){ return cookie.get('XSRF-TOKEN'); };

E.add = function(form){
    $(form).append($('<input type="hidden" name="csrf_token">')
        .val(E.get()));
};

E.on_ajax_send = function(xhr, opt){
    if (opt.type!='POST')
        return;
    var current = zurl.parse(location.href, true);
    var target = zurl.parse(opt.url, true);
    if (target.host)
    {
        if (target.protocol!=current.protocol || target.host!=current.host)
            return;
    }
    xhr.setRequestHeader('X-XSRF-Token', E.get());
};

return E; });
