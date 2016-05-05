// LICENSE_CODE ZON ISC
var etask = require('./util/etask.js');
(function(){
var define;
var is_node = typeof module=='object' && module.exports;
if (!is_node)
    define = self.define;
else
    define = require('./util/require_node.js').define(module, '../');
var modules = ['array', 'attrib', 'ccounter_client', 'conv', 'country', 'date',
    'es6_shim', 'escape', 'etask', 'file', 'lang', 'list', 'match', 'rand',
    'rate_limit', 'sprintf', 'string', 'typedarray_shim', 'url', 'util',
    'version', 'version_util', 'zdot', 'zerr'];
define(modules.map(function(name){ return '/util/'+name+'.js'; } ), function(){
var args = arguments;
var E = {};
modules.forEach(function(name, i){ E[name] = args[i]; } );
return E; }); }());
