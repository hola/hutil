// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, es6:false*/
// this file is used both by node and by ff_addon.
var is_node = typeof module=='object' && module.exports && module.children;
var is_ff_addon = typeof module=='object' && module.uri
    && !module.uri.indexOf('resource://');
if (is_node)
    require('./config.js');
exports.define = function(_module, rel_root){
    return function(name, req, setup){
	if (arguments.length==2)
	{
	    setup = req;
	    req = name;
	}
	_module.exports = setup.apply(this, req.map(function(dep){
            if (!dep)
                return null;
            if (/^\.?\.?\//.test(dep)) // './' '../' '/'
		return require(rel_root+dep);
	    return require(dep);
	}));
    };
};
