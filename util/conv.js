// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*//*global Map*/
(function(){
var define, crypto, assert, zerr, vm;
var is_node = typeof module=='object' && module.exports && module.children;
var is_ff_addon = typeof module=='object' && module.uri
    && !module.uri.indexOf('resource://');
if (!is_node)
{
    if (is_ff_addon)
        define = require('./require_node.js').define(module, '../');
    else
        define = self.define;
    assert = function(){}; // XXX romank: add proper assert
    // XXX romank: use zerr.js
    if (!is_ff_addon && self.hola && self.hola.zerr)
        zerr = self.hola.zerr;
    else
    {
        // IE8 does not support console.log.bind(console)
        zerr = function(){ console.log.apply(console, arguments); };
        zerr.perr = zerr;
    }
}
else
{
    require('./config.js');
    zerr = require('./zerr.js');
    crypto = require('crypto');
    assert = require('assert');
    vm = require('vm');
    define = require('./require_node.js').define(module, '../');
}
define(['/util/util.js'], function(zutil){
var E = {};

var has_map = typeof Map=='function' && Map.prototype.get && Map.prototype.set;
has_map = 0; // XXX alexey: unit-test and remove
E.cache_str_map_fn = function(fn){
    var cache = new Map();
    return function(s){
        s = ''+s;
        var v = cache.get(s);
        if (v!==undefined || cache.has(s))
            return v;
        cache.set(s, v = fn(s));
        return v;
    };
};
E.cache_str_obj_fn = function(fn){
    var cache = {};
    return function(s){
        if (s in cache)
            return cache[s];
        return cache[s] = fn(s);
    };
};
E.cache_str_fn = has_map ? E.cache_str_map_fn : E.cache_str_obj_fn;

E.cache_str_fn2 = function(fn){
    var cache = {};
    return function(s1, s2){
        var cache2 = cache[s1] = cache[s1]||{};
        if (s2 in cache2)
            return cache2[s2];
        return cache2[s2] = fn(s1, s2);
    };
};

E.o = function(oct_str){ return parseInt(oct_str, 8); };

// XXX vladimir: only nodejs
E.md5 = function(buf, hash_len, encoding){
    // update() ignores encoding if buf is a Buffer
    return crypto.createHash('md5').update(buf, encoding||'utf8')
    .digest('hex').slice(0, hash_len);
};
E.md5_zero = function(key, hash_len){
    assert(hash_len<=32, 'invalid hash len'+hash_len);
    if (!key || !key.length)
	return '0'.repeat(hash_len);
    return E.md5(key, hash_len);
};
E.md5_etag = function(buf){ return E.md5(buf, 8); };

E.inet_ntoa_t = function(ip){
    return ((ip & 0xff000000)>>>24)+'.'+((ip & 0xff0000)>>>16)+'.'
    +((ip & 0xff00)>>>8)+'.'+(ip & 0xff);
};

E.inet_addr = function(ip){
    var parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (parts===null)
	return null;
    if (parts[1]>255 || parts[2]>255 || parts[3]>255 || parts[4]>255)
        return null; // not an IP address
    return ((parts[1]<<24)+(parts[2]<<16)+(parts[3]<<8)+(parts[4]|0))>>>0;
};

function flags_to_str_once(flags, conv){
    var f = 'var s = "";\n';
    f += 'if (!flags) return "";\n';
    for (var i in conv)
    {
	if (!conv.hasOwnProperty(i))
	    continue;
	f += 'if (flags & '+conv[i]+') '
	    +'{ s += '+JSON.stringify(i.toLowerCase())+'+" ";'
	    +' flags &= ~'+conv[i]+'; }\n';
    }
    f += 'if (flags && conv.__conv_to_str.err) '
	+'conv.__conv_to_str.err(flags, conv);\n';
    f += 'return s.slice(0, -1);\n';
    var func = new Function(['flags', 'conv'], f);
    Object.defineProperty(conv, '__conv_to_str',
	{enumerable: false, writable: true});
    conv.__conv_to_str = func;
    func.err = function(flags, conv){
	zerr.perr('flags_str_invalid', 'flags '+flags+' '
	    +JSON.stringify(conv).slice(0, 30));
    };
    return conv.__conv_to_str(flags, conv);
}

E.flags_to_str = function(flags, conv){
    if (conv.__conv_to_str)
	return conv.__conv_to_str(flags, conv);
    return flags_to_str_once(flags, conv);
};

function flags_from_str_once(s, conv){
    var f = 'var flags = 0, a, i;\n';
    f += 'if (!s) return 0;\n';
    f += 's = s.toUpperCase();\n';
    f += 'a = s.split(",");\n';
    f += 'for (i=0; i<a.length; i++)\n';
    f += '{\n';
    f += '    if (!conv[a[i]])\n';
    f += '    {\n';
    f += '        if (flags && conv.__conv_from_str.err) '
	+'conv.__conv_from_str.err(flags, conv);\n';
    f += '        return -1;\n';
    f += '    }\n';
    f += '    flags |= conv[a[i]];\n';
    f += '}\n';
    f += 'return flags;\n';
    var func = new Function(['s', 'conv'], f);
    Object.defineProperty(conv, '__conv_from_str',
	{enumerable: false, writable: true});
    conv.__conv_from_str = func;
    func.err = function(s, conv){
	zerr.perr('flags_str_invalid', 'flags '+s+' '
	    +JSON.stringify(conv).slice(0, 30));
    };
    return conv.__conv_from_str(s, conv);
}

E.flags_from_str = function(s, conv){
    if (conv.__conv_from_str)
	return conv.__conv_from_str(s, conv);
    return flags_from_str_once(s, conv);
};

E.scale_vals = {
    1000: [{s: '', n: 1}, {s: 'K', n: 1e3}, {s: 'M', n: 1e6},
        {s: 'G', n: 1e9}, {s: 'T', n: 1e12}, {s: 'P', n: 1e15}],
    1024: [{s: '', n: 1}, {s: 'K', n: 1024}, {s: 'M', n: Math.pow(1024, 2)},
        {s: 'G', n: Math.pow(1024, 3)}, {s: 'T', n: Math.pow(1024, 4)},
        {s: 'P', n: Math.pow(1024, 5)}],
};
E.scaled_number = function(num, opt){
    opt = opt||{};
    var sign = '', per = opt.per, scale = opt.scale;
    var base = opt.base==1024 ? 1024 : 1000, ratio = opt.ratio||1;
    function _per(){ return per ? E.format_per(per) : ''; }
    if (num<0)
    {
        sign = '-';
        num = -num;
    }
    if (num===undefined)
	return '';
    if (isNaN(num))
	return opt.nan||'x';
    if (num==Infinity)
        return sign+'\u221e';
    var scale_vals = E.scale_vals[base], i = 0;
    if (scale==null)
        for (; i<scale_vals.length-1 && num>=scale_vals[i+1].n*ratio; i++);
    else
        i = scale_vals.findIndex(function(_scale){ return _scale.s==scale; });
    if (per=='ms' && i)
    {
        per = 's';
        i--;
        num = num/1000;
    }
    scale = scale_vals[i];
    if (opt.is_scale)
        return scale.n;
    num /= scale.n;
    if (num<0.001)
	return '0'+_per();
    if (num>=base-1)
        num = Math.trunc(num);
    var str = num.toFixed(num<1 ? 3 : num<10 ? 2 : num<100 ? 1 : 0);
    return sign+str.replace(/\.0*$/, '')+(opt.space ? ' ' : '')+scale.s+_per();
};

E.format_per = function(per){
    if (!per)
        return '';
    switch (per)
    {
    case 's': case 'ms': return per;
    case '%': case '%%': return '%';
    default: return '/'+per[0];
    }
};

// Takes a function or its string serialization (f.toString()), returns object:
//     name: declared name or null
//     args: array of declared argument names
//     body: function body excluding the outermost braces
// XXX alexey: when necessary, add support for comments inside argument list,
// arrow functions, generator functions, rest parameters, default parameters,
// destructuring parameters
E.parse_function = function(f){
    var m = /^function\s*([\w$]+)?\s*\(([\s\w$,]*?)(\s*\/\*\*\/)?\)\s*\{\n?([\s\S]*?)\n?\}$/
        .exec(f);
    return {
        name: m[1]||null,
        args: m[2] ? m[2].split(/\s*,\s*/) : [],
        body: m[4],
    };
};

function date_stringify(d){ return {__ISODate__: d.toISOString()}; }

E.JSON_stringify = function(obj, opt){
    var s, prev_date, _date, prev_func, prev_re;
    var date_class, func_class, re_class;
    opt = opt||{};
    if (opt.date)
        _date = typeof opt.date=='function' ? opt.date : date_stringify;
    if (opt.mongo)
        _date = date_stringify;
    if (_date)
    {
        date_class = opt.vm_context ?
            vm.runInContext('Date', opt.vm_context) : Date;
        prev_date = date_class.prototype.toJSON;
        date_class.prototype.toJSON = function(){ return _date(this); };
    }
    if (opt.func)
    {
        func_class = opt.vm_context ?
            vm.runInContext('Function', opt.vm_context) : Function;
        prev_func = func_class.prototype.toJSON;
        func_class.prototype.toJSON = function(){
            return {__Function__: this.toString()}; };
    }
    if (opt.re)
    {
        re_class = opt.vm_context ?
            vm.runInContext('RegExp', opt.vm_context) : RegExp;
        prev_re = re_class.prototype.toJSON;
        Object.defineProperty(re_class.prototype, 'toJSON', {
            value: function(){ return {__RegExp__: this.toString()}; },
            writable: true,
        });
    }
    try { s = JSON.stringify(obj, opt.replacer, opt.spaces); }
    finally {
        if (_date)
            date_class.prototype.toJSON = prev_date;
        if (opt.func)
            func_class.prototype.toJSON = prev_func;
        if (opt.re)
            re_class.prototype.toJSON = prev_re;
    }
    if (opt.mongo)
        s = s.replace(/\{"__ISODate__":("[0-9TZ:.-]+")\}/g, 'ISODate($1)');
    return s;
};

function parse_leaf(v, opt){
    opt = Object.assign({date: 1, re: 1, func: 1}, opt);
    if (!v || typeof v!='object' || Object.keys(v).length!=1)
        return v;
    if (v.__ISODate__ && opt.date)
        return new Date(v.__ISODate__);
    if (v.__Function__ && opt.func)
    {
        if (vm)
            return vm.runInThisContext('('+v.__Function__+')');
        // fallback for browser environment
        var info = E.parse_function(v.__Function__);
        return new Function(info.args.join(','), info.body);
    }
    if (v.__RegExp__ && opt.re)
    {
        var parsed = /^\/(.*)\/(\w*)$/.exec(v.__RegExp__);
        if (!parsed)
            throw new Error('failed parsing regexp');
        return new RegExp(parsed[1], parsed[2]);
    }
    return v;
}

E.JSON_parse = function(s, opt){
    return JSON.parse(s, function(k, v){ return parse_leaf(v, opt); }); };

E.JSON_parse_obj = function(v, opt){
    if (!v || typeof v!='object')
        return v;
    if (Array.isArray(v))
    {
        for (var i = 0; i<v.length; i++)
            v[i] = E.JSON_parse_obj(v[i], opt);
        return v;
    }
    var v2 = parse_leaf(v, opt);
    if (v2!==v)
        return v2;
    for (var key in v)
        v[key] = E.JSON_parse_obj(v[key], opt);
    return v;
};

E.hex2bin = function(hex, opt){
    var byte_array = opt && opt.byte_array;
    var bin = byte_array ? new Uint8Array() : [];
    var re = /('.)|([0-9a-f][0-9a-f]?)|\s+|[.-]|(.)/gi;
    var m, v;
    for (re.lastIndex = 0; m = re.exec(hex);)
    {
        if (m[1])
            v = m[1].charCodeAt(1);
        else if (m[2])
            v = parseInt(m[2], 16);
        else if (m[3])
            return null; // throw new Error('invalid hex code');
        else
            continue;
        bin.push(v);
    }
    return bin;
};

E.bin2hex = function(arr){
    var s = '', v, i;
    for (i=0; i<arr.length; i++)
    {
        v = (arr[i]&0xff).toString(16).toUpperCase();
        s += (v.length<2 ? '0' : '')+v+' ';
    }
    return s.trim();
};

E.tab2sp = function(line){
     var added = 0;
     return line.replace(/\t/g, function(m, offset, str){
         var insert = 8-(added+offset)%8;
         added += insert-1;
         return ' '.repeat(insert);
     });
};

return E; }); }());
