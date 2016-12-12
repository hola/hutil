// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define;
var is_node_ff = typeof module=='object' && module.exports;
if (!is_node_ff)
    define = self.define;
define(['jquery'], function($){
var E = {};
// jQuery.XDomainRequest.js (IE9 doesnt support CORS in XHR)
// https://raw.github.com/MoonScript/jQuery-ajaxTransport-XDomainRequest/master/jQuery.XDomainRequest.js
if (!$.support.cors&&window.XDomainRequest)
{
    var httpRegEx = /^(https?:)?\/\//i;
    var getOrPostRegEx = /^get|post$/i;
    var sameSchemeRegEx = new RegExp('^('+location.protocol+'|//)', 'i');
    var jsonRegEx = /\/json/i;
    var xmlRegEx = /\/xml/i;
    // ajaxTransport exists in jQuery 1.5+
    $.ajaxTransport('text html xml json', function(options, userOptions,
        jqXHR){
	// XDomainRequests must be: asynchronous, GET or POST methods, HTTP or
	// HTTPS protocol, and same scheme as calling page
        if (!(options.crossDomain && options.async &&
	    getOrPostRegEx.test(options.type) &&
	    httpRegEx.test(userOptions.url) &&
	    sameSchemeRegEx.test(userOptions.url)))
	{
            return; // ignore
        }
        var xdr = null, send_timer = 0;
        var userType = (userOptions.dataType||'').toLowerCase();
        return {
            send: function(headers, complete){
                xdr = new window.XDomainRequest();
                xdr.timeout = 10000;
                if (/^\d+$/.test(userOptions.timeout))
                    xdr.timeout = userOptions.timeout;
                xdr.onprogress = function(){};
                xdr.ontimeout = function(){ complete(500, 'timeout'); };
                xdr.onload = function(){
                var allResponseHeaders = 'Content-Length: ' +
                    xdr.responseText.length +
                    '\r\nContent-Type: ' +
                    xdr.contentType;
                var status = {
                    code: 200,
                    message: 'success'
                };
                var responses = {text: xdr.responseText};
                /*
                if (userType==='html'){
                   responses.html = xdr.responseText;
                }  else
                */
                try {
                    if (userType=='json' || (userType!='text'&&
                        jsonRegEx.test(xdr.contentType)))
                    {
                         try {
                             responses.json =
                                 $.parseJSON(xdr.responseText);
                         } catch(e){
                            status.code = 500;
                            status.message = 'parseerror';
                            // throw 'Invalid JSON: ' + xdr.responseText;
                         }
                    }
                    else if (userType=='xml' || (userType!='text'&&
                        xmlRegEx.test(xdr.contentType)))
                    {
                        var doc = new window.ActiveXObject(
                            'Microsoft.XMLDOM');
                        doc.async = false;
                        try {
                            doc.loadXML(xdr.responseText);
                        } catch(e){
                            doc = undefined;
                        }
                        if (!doc||!doc.documentElement||
                            doc.getElementsByTagName('parsererror').length)
                        {
                            status.code = 500;
                            status.message = 'parseerror';
                            throw 'Invalid XML: ' + xdr.responseText;
                        }
                        responses.xml = doc;
                    }
                } catch(parseMessage){
                    throw parseMessage;
                } finally {
                    complete(status.code, status.message, responses,
                       allResponseHeaders);
                }
            };
            xdr.onerror = function(){
                complete(500, 'error', {
                    text: xdr.responseText
                });
            };
            var postData = (userOptions.data&&$.param(userOptions.data))
                ||'';
            xdr.open(options.type, options.url);
            send_timer = setTimeout(function(){
                xdr.send(postData);
                send_timer = 0;
            }, 0);
        }, abort: function(){
            if (send_timer) // XXX arik: need to call fail function
                   clearTimeout(send_timer);
               else if (xdr)
                   xdr.abort();
        }};
    });
}

// XXX arik/zeev: mv all the api below to wbm_server.js and rename
// jquery_wget.js to jquery_ajax_ie.js

// XXX arik: change default to be POST
E.Xhr_stream = function(params){
    var poll_timer, in_progress = true, xhr, prev_data_len = 0;
    var error_called = 0;
    var _this = this;
    Object.assign(this, params);
    if (!this.dataType)
        this.dataType = 'text';
    var handle_resp = function(){
	if (xhr.readyState!=3 || xhr.status!=200)
	    return;
	// in konqueror xhr.responseText is sometimes null here
	if (xhr.responseText===null)
	    return;
	if (prev_data_len==xhr.responseText.length)
	    return;
	if (_this.ready)
	    _this.ready(xhr.responseText);
	prev_data_len = xhr.responseText.length;
    };
    xhr = $.ajax({type: _this.type, url: _this.url, dataType: _this.dataType})
	.done(function(response){
	    clearInterval(poll_timer);
	    if (_this.success)
		_this.success(response);
	    if (_this.done)
		_this.done(response);
	    in_progress = false;
	}).fail(function(_xhr, textStatus, errorThrown){
	    clearInterval(poll_timer);
	    in_progress = false;
	    error_called = 1;
	    // XXX arik: review what parameters need to pass to each cb
	    if (_this.error)
		_this.error(_xhr, textStatus, errorThrown);
	    if (_this.done) // XXX arik: use jquery ajax always
		_this.done();
	    return;
	});
    poll_timer = setInterval(handle_resp, 100);
    this.cancel = function(){ xhr.abort(); };
    this.xhr = function(){ return xhr; }; // XXX arik: needed?
};

// XXX arik: need to unite with zquery_stream that uses jquery ajax
E.Xhr_stream_progress = function(method, url){
    var poll_timer, in_progress = false, xhr, prev_data_len = 0;
    var error_called = 0;
    var instance = this;
    var handle_resp = function(){
	if (xhr.readyState!=4 && xhr.readyState!=3)
	    return;
	if (xhr.readyState==3 && xhr.status!=200)
	    return;
	if (xhr.readyState==4 && xhr.status!=200)
	{
	    clearInterval(poll_timer);
	    in_progress = false;
	    error_called = 1;
	    instance.error();
	    instance.done();
	    return;
	}
	/* In konqueror xhr.responseText is sometimes null here */
	if (xhr.responseText===null)
	    return;
	if (prev_data_len!=xhr.responseText.length)
	{
	    instance.ready(xhr.responseText);
	    prev_data_len = xhr.responseText.length;
	}
	if (xhr.readyState==4)
	{
	    clearInterval(poll_timer);
	    instance.success(xhr.responseText);
	    instance.done();
	    in_progress = false;
	}
    };
    xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onreadystatechange = function(){ handle_resp(); };
    /* XXX arik/derry: IE 8 didn't support addEventListener and instead had
     * attachEvent. IE 9 fixed that problem. need to review proper way of
     * handling it (mv to jquery ajax?) */
    var abort_func = function(){
	if (!error_called)
	    instance.error();
    };
    if (xhr.addEventListener) /* W3C DOM */
        xhr.addEventListener('abort', abort_func, false);
    else if (xhr.attachEvent) /* IE DOM */
        xhr.attachEvent('onabort', abort_func);
    this.send = function(){
	xhr.send('');
	in_progress = true;
	poll_timer = setInterval(handle_resp, 100);
    };
    // default functions
    this.error = function(){};
    this.success = function(data){};
    this.ready = function(data){};
    this.done = function(){};
    this.cancel = function(){ xhr.abort(); };
    this.xhr = function(){ return xhr; };
};
return E; }); })();
