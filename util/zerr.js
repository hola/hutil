// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define, process;
var is_node = typeof module=='object' && module.exports && module.children;
var is_node_ff = typeof module=='object' && module.exports;
var is_ff_addon = typeof module=='object' && module.uri
    && !module.uri.indexOf('resource://');
if (!is_node_ff)
{
    define = self.define;
    process = {env: {}};
}
else if (is_ff_addon)
{
    // XXX romank: tmp hack, find a better way to remove jquery
    define = function(deps, fn){
        deps.pop();
        return require('./require_node.js').define(module, '../')(deps, fn);
    };
    process = {env: {}};
}
else
{
    // XXX romank: tmp hack, find a better way to remove jquery
    define = function(deps, fn){
        deps.pop();
        return require('./require_node.js').define(module, '../')(deps, fn);
    };
    process = global.process||require('_process');
    require('./config.js');
    var cluster = require('cluster');
    var fs = require('fs');
    var version = require('./version.js').version;
}
define(['/util/array.js', '/util/date.js', '/util/util.js',
    '/util/sprintf.js', '/util/rate_limit.js', '/util/escape.js', 'jquery'],
    function(array, date, zutil, sprintf, rate_limit, zescape, $){
var E, _zerr;
var env = process.env;
var zerr = function(msg){ _zerr(L.ERR, arguments); };
E = zerr;
// XXX amir: why do we need both E and E.zerr to point to the same function?
E.zerr = zerr;
var L = E.L = {
    EMERG: 0,
    ALERT: 1,
    CRIT: 2,
    ERR: 3,
    WARN: 4,
    NOTICE: 5,
    INFO: 6,
    DEBUG: 7,
};
var perr_pending = [];
// inverted
var LINV = E.LINV = {};
for (var k in L)
    LINV[L[k]] = k;

['debug', 'info', 'notice', 'warn', 'err', 'crit'].forEach(function(l){
    var level = L[l.toUpperCase()];
    E[l] = function(){ return _zerr(level, arguments); };
});

E.assert = function(exp, msg){
    if (!exp)
	zerr.crit(msg);
};

E.json = function(o, replacer, space){
    try { return JSON.stringify(o, replacer, space)||''; }
    catch(err){ return '[circular]'; }
};

E.is = function(level){ return level<=E.level; };
['debug', 'info', 'notice', 'warn', 'err'].forEach(function(l){
    var level = L[l.toUpperCase()];
    E.is[l] = function(){ return level<=E.level; };
});

E.log_tail = function(size){ return E.log.join('\n').substr(-(size||4096)); };

/* perr is a stub overridden by upper layers */
E.perr = function(id, info, opt){
    E.zerr('perr '+id+' '+JSON.stringify(info));
    if (perr_pending && perr_pending.length<100)
	perr_pending.push(Array.from(arguments));
};
var perr_orig = E.perr;
E.perr_install = function(install_fn){
    E.perr = install_fn(perr_orig, perr_pending||[]);
    perr_pending = null;
};

function err_has_stack(err){ return err instanceof Error && err.stack; }

E.e2s = function(err){
    if (!is_node && err_has_stack(err))
    {
        var e_str = ''+err, e_stack = ''+err.stack;
        return e_stack.startsWith(e_str) ? e_stack : e_str+' '+e_stack;
    }
    return err_has_stack(err) ? ''+err.stack : ''+err;
};

E.on_exception = undefined;
E.set_exception_handler = function(prefix, err_func){
    E.on_exception = function(err){
        if (!(err instanceof TypeError || err instanceof ReferenceError) ||
            err.sent_perr)
        {
            return;
        }
        err.sent_perr = true;
        // XXX amir: better not to get a prefix arg, it can be added by the
        // err_func
        err_func((prefix ? prefix+'_' : '')+'etask_typeerror', null, err);
    };
};

E.on_unhandled_exception = undefined;
E.catch_unhandled_exception = function(func, obj){
    return function(){
        var args = arguments;
        try { return func.apply(obj, Array.from(args)); }
        catch(e){ E.on_unhandled_exception(e); }
    };
};

if (is_node)
{ // zerr-node
E.ZEXIT_LOG_DIR = '/tmp/zexit_logs';
E.prefix = '';

E.level = L.NOTICE;
E.set_level = function(level){
    var prev = 'L'+LINV[E.level];
    level = level||env.ZERR;
    if (!level)
	return prev;
    var val = L[level] || L[level.replace(/^L/, '')];
    if (val!==undefined)
	E.level = val;
    return prev;
};

E.flush = function(){};
E.set_log_buffer = function(on){
    if (!on)
    {
        if (E.log_buffer)
        {
            E.flush();
            E.log_buffer(0);
        }
        return;
    }
    E.log_buffer = require('log-buffer');
    E.log_buffer(32*1024);
    E.flush = function(){ E.log_buffer.flush(); };
    setInterval(E.flush, 1000).unref();
};
var node_init = function(){
    if (zutil.is_mocha())
        E.level = L.WARN;
    else
        E.prefix = !cluster.isMaster ? 'C'+cluster.worker.id+' ' : '';
};

var init = function(){
    if (is_node)
        node_init();
    E.set_level();
};
init();

var zerr_format = function(args){
    return args.length<=1 ? args[0] : sprintf.apply(null, args); };
var __zerr = function(level, args){
    var msg = zerr_format(args);
    var k = Object.keys(L);
    var prefix = E.hide_timestamp ? '' : E.prefix+date.to_sql_ms()+' ';
    console.error(prefix+k[level]+': '+msg);
};

E.set_logger = function(logger){
    __zerr = function(level, args){
        var msg = zerr_format(args);
        logger(level, msg);
    };
};

_zerr = function(level, args){
    if (level>E.level)
	return;
    __zerr(level, args);
};
E._zerr = _zerr;

E.zexit = function(args){
    var stack, zexit_args = arguments;
    if (err_has_stack(args))
    {
	stack = args.stack;
	__zerr(L.CRIT, [E.e2s(args)]);
    }
    else
    {
	var e = new Error();
	stack = e.stack;
	__zerr(L.CRIT, arguments);
	console.error(stack);
    }
    E.flush();
    if (zutil.is_mocha())
    {
	/*jslint -W087*/
	debugger;
	process.exit(1);
    }
    var zcounter_file = require('./zcounter_file.js');
    zcounter_file.inc('svc_zexit');
    args = zerr_format(arguments);
    write_zexit_log({id: 'server_zexit', info: ''+args, ts: date.to_sql(),
        backtrace: stack, version: version, cid: server_cid});
    E.flush();
    debugger;
    process.exit(1);
};

var server_cid = 0;
E.set_server_cid = function(cid){ server_cid = cid; };

var write_zexit_log = function(json){
    try {
        var file = require('./file.js');
        file.write_e(E.ZEXIT_LOG_DIR+'/'+date.to_log_file()+'_zexit_'+
            process.pid+'.log', JSON.stringify(json), {mkdirp: 1});
    } catch(e){ E.zerr(E.e2s(e)); }
};
}
else
{ // browser-zerr
var chrome = self.chrome;
E.conf = self.conf;
E.log = [];
var L_STR = E.L_STR = ['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING',
    'NOTICE', 'INFO', 'DEBUG'];
E.level = self.is_tpopup ? L.CRITICAL : E.conf && E.conf.zerr_level ?
    L[self.conf.zerr_level] : L.WARN;
E.log.max_size = 200;

var console_method = function(l){
    return l<=L.ERR ? 'error' : !chrome ? 'log' : l===L.WARN ? 'warn' :
        l<=L.INFO ? 'info' : 'debug';
};

_zerr = function(l, args){
    var s;
    try {
	var fmt = ''+args[0];
	var fmt_args = Array.prototype.slice.call(args, 1);
	/* XXX arik/bahaa HACK: use sprintf (note, console % options are
	 * differnt than sprintf % options) */
	s = (fmt+(fmt_args.length ? ' '+E.json(fmt_args) : ''))
	.substr(0, 1024);
	var prefix = date.to_sql_ms()+' '+L_STR[l]+': ';
	E.log.push(prefix+s);
	if (E.is(l))
	{
            Function.prototype.apply.bind(console[console_method(l)],
                console)([prefix+fmt].concat(fmt_args));
	}
	if (E.log.length>E.log.max_size)
	    E.log.splice(0, E.log.length - E.log.max_size/2);
    } catch(err){
	try {
	    /* XXX arik: console may fail (or be null) during loading of new
	     * version */
	    console.error('ERROR in zerr '+(err.stack||err)+' '+
		E.json(arguments));
	} catch(_err){}
    }
    if (l<=L.CRIT)
	throw new Error(s);
};
E._zerr = _zerr;

var perr_transport = function(id, info, opt){
    opt = zutil.clone(opt||{});
    var qs = opt.qs||{}, data = opt.data||{};
    var ms = (opt.rate_limit && opt.rate_limit.ms)||date.ms.HOUR;
    var count = (opt.rate_limit && opt.rate_limit.count)||10;
    var rl_hash = perr.rl_hash = perr.rl_hash||{};
    var rl = rl_hash[id] = rl_hash[id]||{};
    data.is_json = 1;
    if (info && typeof info!='string')
	info = zerr.json(info);
    if (opt.err && !info)
	info = ''+(opt.err.message||zerr.json(opt.err));
    data.info = info;
    qs.id = id;
    if (!opt.no_zerr)
    {
        zerr._zerr(opt.level, ['perr '+id+(info ? ' info: '+info : '')+
	    (opt.bt ? '\n'+opt.bt : '')]);
    }
    if (rate_limit(rl, ms, count))
    {
	return $.ajax(zescape.uri(E.conf.url_perr+'/perr', qs), {
	    type: 'POST', data: data, dataType: 'json'});
    }
    if (id=='be_perr_rate_limit')
	return;
    zerr('perr %s %s rate too high %s %d %d', id, info, zerr.json(rl),
        ms, count);
    opt.rate_limit = {ms: date.ms.HOUR, count: 1};
    // Don't include 'info' in be_perr_rate_limit because it makes people
    // confuse it with the original perr
    return E.perr('be_perr_rate_limit', {id: id}, opt);
};

var perr = function(perr_orig, pending){
    while (pending.length)
	perr_transport.apply(null, pending.shift());
    // set the zerr.perr stub to send to the clog serve
    return perr_transport;
};
E.perr_install(perr);

} // end of browser-zerr}

return E; }); }());
