// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define, node_url;
var is_node = typeof module=='object' && module.exports && module.children;
if (!is_node)
    define = self.define;
else
    define = require('./require_node.js').define(module, '../');
define(['/util/string.js'],
function(string){
var E = {};

E.from_str = function(s, opt){
    return E.from_lines(string.split_crlf(s), opt); };

E.from_lines = function(l, opt){
    var last_pos = 0, attrib = [], i, m, invalid = false, line;
    opt = opt||{};
    for (i=0; i<l.length; i++)
    {
	if (!(line = l[i]))
	{
	    invalid = true;
	    continue;
	}
	if (/^\s+/.test(line))
	{
	    if (!last_pos)
	    {
		invalid = true;
		continue;
	    }
	    attrib[last_pos-1][1] += '\n'+line.trim();
	    continue;
	}
	if (!(m = line.match(/^([^:]+):([^\n]*)$/)))
	{
	    invalid = true;
	    continue;
	}
	attrib[last_pos++] = [m[1].trim(), m[2].trim()];
    }
    if (invalid && !opt.allow_invalid)
        attrib = null;
    return attrib;
};

E.to_str = function(attrib){
    var s = '', i;
    for (i=0; i<attrib.length; i++)
	s += attrib[i][0]+': '+(''+attrib[i][1]).replace(/\n/, '\n  ')+'\n';
    return s;
};

// a simpler regexp based parser: untested, and not properly compatible!
E.from_str2 = function(s){
    var re = /^(\S.*):(.*(?:\r?\n\s.*)*(?:$|\r?\n))/gm, a = [], m;
    for (re.lastIndex=0; m = re.exec(s);)
        a.push([m[1].trim(), m[2].trim()]);
    return a;
};

/* same function as _.pairs() */
E.from_obj = function(obj){
    var attrib = [], i;
    for (i in obj)
	attrib.push([i, ''+obj[i]]);
    return attrib;
};

/* same function as _.object() */
E.to_obj = function(attrib){
    var obj = {}, i;
    for (i=0; i<attrib.length; i++)
	obj[attrib[i][0]] = attrib[i][1];
    return obj;
};

E.to_obj_lower = function(attrib){
    var obj = {}, i;
    for (i=0; i<attrib.length; i++)
	obj[attrib[i][0].toLowerCase()] = attrib[i][1];
    return obj;
};

E.to_obj_lower_val = function(attrib){
    var obj = {}, i;
    for (i=0; i<attrib.length; i++)
    {
	var val = attrib[i][1];
	obj[attrib[i][0].toLowerCase()] = val ? val.toLowerCase() : val;
    }
    return obj;
};

E.get_index = function(attrib, field){
    for (var i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
	    return i;
    }
    return -1;
};

E.get = function(attrib, field){
    for (var i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
	    return attrib[i][1];
    }
    return null;
};

E.get_multi = function(attrib, field){
    /* http://jsperf.com/get-multi/2 */
    var i, n = 0, ret = [];
    for (i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
	    ret.push(attrib[i][1]);
    }
    return ret;
};

return E; }); }());
