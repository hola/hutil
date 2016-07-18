// LICENSE_CODE ZON ISC
'use strict'; /*zlint node, br*/
(function(){
var define;
var is_node_ff = typeof module=='object' && module.exports;
if (!is_node_ff)
    define = self.define;
else
    define = require('./require_node.js').define(module, '../');
define([], function(){
var E = {
    settings: {
        open: '{[',
        close: ']}',
	it: 'it',
	html: true,
    },
    include: function(){ return ''; },
    helpers: {},
};
var html_escape_table = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
function html_escape(s){
    return s.replace(/[&<>"']/g, function(m){
	return html_escape_table[m]||m; });
}
var js_escape_table = {"'": "\\'", '"': '\\"', '\r': '\\r',
    '\n': '\\n', '\t': '\\t', '\\': '\\\\'};
function js_escape(s){
    return "'"+s.replace(/'|"|\r|\n|\t|\\/g, function(m){
	return js_escape_table[m]||m; })+"'";
}
function script_escape(s){
    return s.replace(/<(?=!--|\/?script)/gi, '<\\'); }
function to_str(val){ return val==null ? '' : ''+val; }
function to_json(val){
    return val===undefined ? 'undefined' : JSON.stringify(val); }
function regex_escape(s){ return s.replace(/[[\]{}()*+?.\\^$|\/]/g, '\\$&'); }

E.last_err = undefined;

function scan_block(c, scan){
    var re = c.open_close_re, m, index, depth, s = scan.s, found;
    for (depth = 0, re.lastIndex = 0; m = re.exec(s);)
    {
	if (m[0]==c.open)
	{
	    if (!depth && m.index)
            {
                index = m.index;
                break;
            }
	    depth++;
	    continue;
	}
	if (!depth)
	    continue;
	depth--;
	if (!depth)
	{
	    found = true;
	    break;
	}
    }
    if (index===undefined)
	index = re.lastIndex||s.length;
    if (depth)
        E.last_err = 'no closing block: "'+s.substr(0, 50)+'"';
    scan.m = s.substr(0, index);
    scan.s = s.substr(index);
    scan.found = found;
    return !!s;
}
function extend(obj){
    for (var i=1; i<arguments.length; i++)
    {
	var source = arguments[i];
	if (!source)
	    continue;
        for (var prop in source)
	    obj[prop] = source[prop];
    }
    return obj;
}
E.template = function(tmpl, c){
    E.last_err = undefined;
    c = extend({}, E.settings, c);
    c.open_close_re = new RegExp(
        regex_escape(c.open)+'|'+regex_escape(c.close), 'g');
    tmpl = ''+tmpl;
    var sid = 0, indv, a = [], last_index = 0, m, _m, scan, it = c.it;
    var _html_escape = c.html ? 'html_escape' : '';
    var _script_escape = c.html ? 'script_escape' : '';
    a.push({stmt:
	'\'use strict\'; var out = "", tmp, def, helpers, g;\n'
	+'if ('+it+' && '+it+'.helpers)\n'
        +'{ helpers = '+it+'.helpers; g = helpers; }\n'
	+'if ('+it+' && '+it+'.def)\n'
        +'    def = '+it+'.def;\n'});
    function expr(s){ a.push({expr: s}); }
    function stmt(s){ a.push({stmt: s}); }
    function handle_template(tmpl){
        var m, _m, scan, t, op, op_base, code, sep;
        for (scan = {s: tmpl}; scan_block(c, scan);)
        {
            m = scan.m;
            if (!scan.found)
            {
                a.push({val: m});
                continue;
            }
            _m = m.slice(c.open.length, -c.close.length);
            // IE9 does not support [^], so use [\S\s]
            if (op = /^( |-|!|=|([a-z0-9_]+)(\S*)(\s|$))([\S\s]*)$/i.exec(_m))
            {
                _m = op[5];
                op_base = op[2]||op[1];
                sep = op[4];
                op = op[2] ? op[2]+op[3] : op[1];
            }
            else
                op_base = undefined;
            switch (op_base)
            {
            case it: // assign/use it.xxx
                if (sep) // assign
                {
                    stmt(op+' = (function(){ var out = "";\n');
                    handle_template(_m);
                    stmt('; return out; })();\n');
                }
                else // use
                    expr(_html_escape+'(to_str('+op+'))');
                break;
            // JS expr
            case '=':
                if (_m.startsWith('json '))
                    expr(_script_escape+'(to_json('+_m.slice(5)+'))');
                else
                    expr('to_str('+_m+')');
                break;
            // encode
            case '!': expr(_html_escape+'(to_str('+_m+'))'); break;
            // raw JS code
            case ' ': stmt(_m+';\n'); break;
            case 'if': stmt('if ('+_m+'){\n'); break;
            case 'else':
                stmt('} else if ('+(sep&&_m.trim() || '1')+'){\n');
                break;
            case 'fi': stmt('}\n'); break;
            // include file
            case 'include': handle_template(''+E.include(_m)); break;
            // XXX antonp: replace with MD5_CDN
            case 'MD5':
                expr(it+'.MD5(""');
                handle_template(_m);
                expr('"")');
                break;
            case 'MD5_CDN':
                expr(it+'.MD5_CDN(""');
                handle_template(_m);
                expr('"")');
                break;
            case 'CDN_LINK':
            case 'CDN_REMOTE':
                expr(it+'.CDN_LINK(""');
                handle_template(_m);
                expr('"", '+(op_base=='CDN_REMOTE')+')');
                break;
            default:
                if (c.it_shortcut && op_base &&
                    /^[a-z_][a-z_0-9.\[\]]*$/i.exec(op))
                {
                    expr(_html_escape+'(to_str('+it+'.'+op+'))');
                    break;
                }
                E.last_err = 'template unknown section: '+m.substr(0, 50);
                a.push({val: m});
            }
        }
    }
    handle_template(tmpl);
    a.push({stmt: 'return out;\n'});
    var fn = '', in_expr = false;
    function set_in_expr(_in_expr){
	if (_in_expr==in_expr)
	    fn += in_expr ? '+' : '';
        else
        {
            fn += _in_expr ? 'out += ' : ';\n';
            in_expr = _in_expr;
        }
    }
    for (var i=0; i<a.length; i++)
    {
	var _a = a[i], v = _a.val||_a.expr||_a.stmt;
	if (!v)
	    continue;
	set_in_expr(!!(_a.val||_a.expr));
	fn += _a.val ? js_escape(v) : v;
    }
    set_in_expr(false);
    try {
	return new Function('html_escape', 'script_escape', 'to_str',
            'to_json', it, fn)
	.bind(null, html_escape, script_escape, to_str, to_json);
    } catch(e){
	console.log('could not create a template function', fn);
	throw e;
    }
};

return E; }); }());
