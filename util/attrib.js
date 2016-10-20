// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define;
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

// same function as _.pairs()
E.from_obj = function(obj){
    var attrib = [], i;
    for (i in obj)
	attrib.push([i, ''+obj[i]]);
    return attrib;
};

// same function as _.object()
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

E.to_lower = function(attrib){
    var a = [];
    for (var i=0; i<attrib.length; i++)
        a.push([attrib[i][0].toLowerCase(), attrib[i][1]]);
    return a;
};

E.get_index = function(attrib, field){
    for (var i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
	    return i;
    }
    return -1;
};

E.get = function(attrib, field, opt){
    var res = '', sep = opt && opt.sep, _null = opt && opt.null ? null : '';
    for (var i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
        {
            if (!sep)
                return attrib[i][1];
            res += (res ? sep : '')+attrib[i][1];
        }
    }
    return res||_null;
};

E.get_arr = function(attrib, field){
    var i, ret = [];
    for (i=0; i<attrib.length; i++)
    {
	if (attrib[i][0]==field)
	    ret.push(attrib[i][1]);
    }
    return ret;
};

return E; }); }());
