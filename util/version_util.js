// LICENSE_CODE ZON ISC
'use strict'; /*zlint node, br*/
(function(){
var define;
var is_node = typeof module=='object' && module.exports && module.children;
var is_ff_addon = typeof module=='object' && module.uri
    && !module.uri.indexOf('resource://');
if (is_node||is_ff_addon)
    define = require('./require_node.js').define(module, '../');
else
    define = self.define;
define(['/util/sprintf.js', '/util/conv.js'], function(sprintf, conv){
var E = {};
var ver_regexp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

E._expand = function(ver){
    var v;
    if (!ver)
	return '';
    if (!(v = ver_regexp.exec(ver)))
	return;
    return sprintf('%03d.%03d.%03d', +v[1], +v[2], +v[3]);
};
E.expand = conv.cache_str_fn(E._expand);

E._trim = function(ver){
    var v;
    if (!ver)
	return '';
    if (!(v = ver_regexp.exec(ver)))
	return;
    return ''+(+v[1])+'.'+(+v[2])+'.'+(+v[3]);
};
E.trim = conv.cache_str_fn(E._trim);

E._cmp = function(v1, v2){
    if (!v1 || !v2)
	return +!!v1 - +!!v2;
    var _v1 = v1.split('.'), _v2 = v2.split('.'), i;
    for (i = 0; i<_v1.length && i<_v2.length && +_v1[i] == +_v2[i]; i++);
    if (_v1.length==i || _v2.length==i)
	return _v1.length - _v2.length;
    return +_v1[i] - +_v2[i];
};
E.cmp = conv.cache_str_fn2(E._cmp);

E._valid = function(v){ return ver_regexp.test(''+v); };
var version_valid_cache = {};
E.valid = function(v){
    var cache = version_valid_cache, res;
    v = ''+v; // accept non-string (always false)
    if (v in cache)
        return cache[v];
    if (res = E._valid(v))
        cache[v] = res; // cache only valid versions
    return res;
};

function iter_ver(version, cb){
    var v;
    if (!E.valid(version))
        return version;
    v = version.split('.');
    for (var i=v.length-1; i>=0 && !cb(v, i); i--);
    return v.join('.');
}
E.inc = function(version){
    return iter_ver(version, function(v, i){
        if (v[i]<999)
        {
            v[i] = +v[i]+1;
            return true;
        }
        v[i] = 0;
    });
};
E.dec = function(version){
    return iter_ver(version, function(v, i){
        if (v[i]>0)
        {
            v[i] = +v[i]-1;
            return true;
        }
        v[i] = 999;
    });
};
E.get_max = function(versions, cmp){
    var v, i;
    versions = versions.sort(cmp||function(v1, v2){
        return E.cmp(v2.version, v1.version); });
    for (i = 0; i<versions.length; i++)
    {
        v = versions[i];
        if (+v.isbranch || !+v.soft_tag || !+v.onsymbol ||
            v.repository!='zon' || !E.valid(v.version))
        {
            continue;
        }
        return v.version;
    }
};

return E; }); }());
