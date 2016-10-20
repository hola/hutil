// LICENSE_CODE ZON ISC
'use strict'; /*zlint node, br*/
(function(){
var define;
var is_node = typeof module=='object' && module.exports && module.children;
var is_ff_addon = typeof module=='object' && module.uri
    && !module.uri.indexOf('resource://');
var qs;
if (!is_node && !is_ff_addon)
    define = self.define;
else
{
    define = require('./require_node.js').define(module, '../');
    qs = require(is_ff_addon ? 'sdk/querystring' : 'querystring');
}
define([], function(){
var assign = Object.assign;
var E = {};

E.add_proto = function(url){
    if (!url.match(/^([a-z0-9]+:)?\/\//i))
	url = 'http://'+url;
    return url;
};

E.rel_proto_to_abs = function(url){
    var proto = is_node ? 'http:' : location.protocol;
    return url.replace(/^\/\//, proto+'//');
};

E.get_top_level_domain = function(host){
    var n = host.match(/\.([^.]+)$/);
    return n ? n[1] : '';
};

E.get_host = function(url){
    var n = url.match(/^(https?:)?\/\/([^\/]+)\/.*$/);
    return n ? n[2] : '';
};

E.get_host_without_tld = function(host){
    return host.replace(/^([^.]+)\.[^.]{2,3}(\.[^.]{2,3})?$/, '$1');
};

E.get_path = function(url){
    var n = url.match(/^https?:\/\/[^\/]+(\/.*$)/);
    return n ? n[1] : '';
};

E.get_proto = function(url){
    var n = url.match(/^([a-z0-9]+):\/\//);
    return n ? n[1] : '';
};

E.get_host_gently = function(url){
    var n = url.match(/^(?:(?:[a-z0-9]+?:)?\/\/)?([^\/]+)/);
    return n ? n[1] : '';
};

E.is_ip = function(host){
    var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (!m)
        return false;
    for (var i = 1; i<=4; i++)
    {
        if (+m[i]>255)
            return false;
    }
    return true;
};

E.is_ip_subnet = function(host){
    var m = /(.+?)\/(\d+)$/.exec(host);
    return m && E.is_ip(m[1]) && +m[2]<=32;
};

E.is_ip_port = function(host){
    var m = /(.+?)(?::(\d{1,5}))?$/.exec(host);
    return m && E.is_ip(m[1]) && !(+m[2]>65535);
};

/* basic url validation to prevent script injection like 'javascript:....' */
E.is_valid_url = function(url){
    return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z0-9-]+(\/.*)?$/i.test(url); };

E.is_valid_domain = function(domain){
    return /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,63}$/.test(domain); };

E.is_hola_domain = function(domain){
    return domain.search(/^(.*\.)?(hola\.org|holacdn\.com|h-cdn\.com)$/)!=-1;
};

E.is_valid_email = function(email){
    var n = email.toLowerCase().match(/^[a-z0-9_\.\-\+]+@(.*)$/);
    return !!(n && E.is_valid_domain(n[1]));
};

E.host_lookup = function(lookup, host){
    var pos;
    while (1)
    {
        if (host in lookup)
            return lookup[host];
        if ((pos = host.indexOf('.'))<0)
            return;
        host = host.slice(pos+1);
    }
};

// more-or-less compatible with NodeJS url API
E.uri_obj_href = function(uri){
    return (uri.protocol||'')+(uri.slashes ? '//' : '')
        +(uri.host ? (uri.auth ? uri.auth+'@' : '')+uri.host : '')
        +uri.path
        +(uri.hash||'');
};

var protocol_re = /^((?:about|http|https|file|ftp|ws|wss):)?(\/\/)?/i;
var host_section_re = /^(.*?)(?:[\/?#]|$)/;
var host_re = /^(?:(([^:@]*):?([^:@]*))?@)?([^:]*)(?::(\d*))?/;
var path_section_re = /^([^?#]*)(\?[^#]*)?(#.*)?$/;
var path_re_loose = /^(\/(?:.(?![^\/]*\.[^\/.]+$))*\/?)?([^\/]*?(?:\.([^.]+))?)$/;
var path_re_strict = /^(\/(?:.(?![^\/]*(?:\.[^\/.]+)?$))*\/?)?([^\/]*?(?:\.([^.]+))?)$/;

E.parse = function(url, strict){
    function re(expr, str){
        var m;
        try { m = expr.exec(str); } catch(e){ m = null; }
        if (!m)
            return m;
        for (var i=0; i<m.length; i++)
            m[i] = m[i]===undefined ? null : m[i];
        return m;
    }
    url = url||location.href;
    var m, uri = {orig: url}, remaining = url;
    // protocol
    if (!(m = re(protocol_re, remaining)))
        return {};
    uri.protocol = m[1];
    if (uri.protocol!==null)
        uri.protocol = uri.protocol.toLowerCase();
    uri.slashes = !!m[2];
    if (!uri.protocol && !uri.slashes)
    {
        uri.protocol = 'http:';
        uri.slashes = true;
    }
    remaining = remaining.slice(m[0].length);
    // host
    if (!(m = re(host_section_re, remaining)))
        return {};
    uri.authority = m[1];
    remaining = remaining.slice(m[1].length);
    // host elements
    if (!(m = re(host_re, uri.authority)))
        return {};
    uri.auth = m[1];
    uri.user = m[2];
    uri.password = m[3];
    uri.hostname = m[4];
    uri.port = m[5];
    if (uri.hostname!==null)
    {
        uri.hostname = uri.hostname.toLowerCase();
        uri.host = uri.hostname+(uri.port ? ':'+uri.port : '');
    }
    // path
    if (!(m = re(path_section_re, remaining)))
        return {};
    uri.relative = m[0];
    uri.pathname = m[1];
    uri.search = m[2];
    uri.query = uri.search ? uri.search.substring(1) : null;
    uri.hash = m[3];
    // path elements
    if (!(m = re(strict ? path_re_strict : path_re_loose, uri.pathname)))
        return {};
    uri.directory = m[1];
    uri.file = m[2];
    uri.ext = m[3];
    if (uri.file=='.'+uri.ext)
        uri.ext = null;
    // finals
    if (!uri.pathname)
        uri.pathname = '/';
    uri.path = uri.pathname+(uri.search||'');
    uri.href = E.uri_obj_href(uri);
    return uri;
};

E.qs_parse = function(q, bin){
    var obj = {};
    q = q.split('&');
    var len = q.length;
    var unescape_val = bin ? function(val){
        return qs.unescapeBuffer(val, true).toString('binary');
    } : function(val){
        return decodeURIComponent(val.replace(/\+/g, ' '));
    };
    for (var i = 0; i<len; ++i)
    {
	var x = q[i];
	var idx = x.indexOf('=');
	var kstr = idx>=0 ? x.substr(0, idx) : x;
	var vstr = idx>=0 ? x.substr(idx + 1) : '';
        var k = unescape_val(kstr);
        var v = unescape_val(vstr);
	if (obj[k]===undefined)
	    obj[k] = v;
	else if (Array.isArray(obj[k]))
	    obj[k].push(v);
	else
	    obj[k] = [obj[k], v];
    }
    return obj;
};

function token_regex(s, end){ return end ? '^'+s+'$' : s; }

E.http_glob_host = function(host, end){
    var n = host.match(/^(|.*[^*])(\*+)$/);
    if (n)
    {
	host = E.http_glob_host(n[1])
	+(n[2].length==1 ? '[^./]+' : '[^/]'+(n[1] ? '*' : '+'));
	return token_regex(host, end);
    }
    /* '**' replace doesn't use '*' in output to avoid conflict with '*'
     * replace following it */
    host = host.replace(/\*\*\./, '**').replace(/\*\./, '*')
    .replace(/\./g, '\\.').replace(/\*\*/g, '(([^./]+\\.)+)?')
    .replace(/\*/g, '[^./]+\\.');
    return token_regex(host, end);
};

E.http_glob_path = function(path, end){
    if (path[0]=='*')
	return E.http_glob_path('/'+path, end);
    var n = path.match(/^(|.*[^*])(\*+)([^*^\/]*)$/);
    if (n)
    {
	path = E.http_glob_path(n[1])+(n[2].length==1 ? '[^/]+' : '.*')+
	    E.http_glob_path(n[3]);
	return token_regex(path, end);
    }
    path = path.replace(/\*\*\//, '**').replace(/\*\//, '*')
    .replace(/\//g, '\\/').replace(/\./g, '\\.')
    .replace(/\*\*/g, '(([^/]+\\/)+)?').replace(/\*/g, '[^/]+\\/');
    return token_regex(path, end);
};

E.http_glob_url = function(url, end){
    var n = url.match(/^((.*):\/\/)?([^\/]+)(\/.*)?$/);
    if (!n)
	return null;
    var prot = n[1] ? n[2] : '*';
    var host = n[3];
    var path = n[4]||'**';
    if (prot=='*')
	prot = 'https?';
    host = E.http_glob_host(host);
    path = E.http_glob_path(path);
    return token_regex(prot+':\\/\\/'+host+path, end);
};

E.root_url_cmp = function(a, b){
    var a_s = a.match(/^[*.]*([^*]+)$/);
    var b_s = b.match(/^[*.]*([^*]+)$/);
    if (!a_s && !b_s)
	return false;
    var re, s;
    if (a_s && b_s && a_s[1].length>b_s[1].length || a_s && !b_s)
    {
	s = a_s[1];
	re = b;
    }
    else
    {
	s = b_s[1];
	re = a;
    }
    s = E.add_proto(s)+'/';
    if (!(re = E.http_glob_url(re, 1)))
	return false;
    try { re = new RegExp(re); }
    catch(e){ return false; }
    return re.test(s);
};

E.qs_strip = function(url){ return /^[^?#]*/.exec(url)[0]; };

// mini-implementation of zescape.qs to avoid dependency of escape.js
function qs_str(qs){
    var q = [];
    for (var k in qs)
    {
        (Array.isArray(qs[k]) ? qs[k] : [qs[k]]).forEach(function(v){
            q.push(encodeURIComponent(k)+'='+encodeURIComponent(v)); });
    }
    return q.join('&');
}

E.qs_add = function(url, qs){
    var u = E.parse(url), q = assign(u.query ? E.qs_parse(u.query) : {}, qs);
    u.path = u.pathname+'?'+qs_str(q);
    return E.uri_obj_href(u);
};

return E; }); }());
