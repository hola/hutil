// LICENSE_CODE ZON ISC
var etask = require('./util/etask.js');
(function(){
var define;
var is_node = typeof module=='object' && module.exports;
if (!is_node)
    define = self.define;
else
    define = require('./util/require_node.js').define(module, '../');
var modules = ['etask', 'array', 'util', 'date', 'sprintf', 'escape',
    'rate_limit'];
define(modules.map(function(name){ return '/util/'+name+'.js'; } ), function(){
var args = arguments;
var E = {};
modules.forEach(function(name, i){ E[name] = args[i]; } );
return E; }); }());
