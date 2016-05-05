// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, es6:false*/
require('./config.js');
var zutil = require('./util.js');
var zerr = require('./zerr.js');
var array = require('./array.js');
var etask = require('./etask.js');
var date = require('./date.js');
var zcounter = require('./zcounter.js');
var E = exports;

E.slow_list = {};
E.slow_id = 0;
E.disable = zutil.is_mocha();
var inited_counters = {};

E.add = function(slow_o){
    slow_o.id = E.slow_id++;
    E.slow_list[slow_o.id] = slow_o;
    return slow_o;
};
E.rm = function(slow_o){
    delete E.slow_list[slow_o.id]; };
E.slow_opt = function(op, format_cb){
    return {counter: 'slow_'+op, level: 'level_'+op,
	slow_level: 'level_slow_'+op, format_cb: format_cb};
};

E.init = function(opt){
    if (inited_counters[opt.counter])
        return;
    inited_counters[opt.counter] = true;
    zcounter.inc(opt.counter, 0);
    zcounter.inc_level(opt.level, 0);
    zcounter.inc_level(opt.slow_level, 0);
};

function Slow(opt){
    this.opt = opt;
    E.init(opt);
}
E.slow = Slow;

Slow.prototype.start = function(info){
    if (E.disable)
        return this;
    var opt = this.opt, _this = this;
    var timeout = opt.timeout||1000;
    var s = this.s = {
	timeout: timeout,
	opt: opt,
	is_slow: false,
	start_time: Date.now(),
	info: info,
	id: 0,
	timeout_cb: function(){
	    s._start_time = new Date(s.start_time);
	    s.format = function(){
		return opt.format_cb.call(_this, s._start_time, s.info); };
	    zerr('SLOW-progress '+s.format().slice(0, 128));
	    zcounter.inc(opt.counter);
	    zcounter.inc_level(opt.slow_level, 1);
	    E.add(s);
	    s.is_slow = true;
	},
	timer_id: setTimeout(function(){ s.timeout_cb(); }, timeout),
    };
    zcounter.inc_level(opt.level, 1);
    return this;
};

Slow.prototype.end = function(){
    var opt = this.opt, s = this.s;
    if (E.disable)
        return;
    if (s.done)
        return;
    s.done = true;
    clearTimeout(s.timer_id);
    zcounter.inc_level(opt.level, -1);
    var elapsed = Date.now()-s.start_time;
    /* make sure timeout_cb was not called */
    if (elapsed<=s.timeout && !s.is_slow)
	return;
    if (!s.is_slow)
	s.timeout_cb();
    zcounter.inc_level(opt.slow_level, -1);
    E.rm(s);
    zerr(date.ms_to_str(elapsed)+' SLOW-finished '+s.format().slice(0, 128));
};

E.start = function(opt){
    if (E.disable)
        return;
    var slow_test = new E.slow(opt);
    slow_test.start(arguments);
    return slow_test;
};

E.end = function(slow_test){
    if (!slow_test)
	return;
    slow_test.end();
};

E.etask = function(et, opt){
    function start_slow_test(_opt){
        var slow_test = new E.slow(_opt);
        slow_test.start(et);
        et.on('ensure', function(){ slow_test.end(); });
    }
    if (E.disable)
        return et;
    if (!(et instanceof etask) || et.tm_completed)
	return et;
    if (Array.isArray(opt))
        opt.forEach(function(_opt){ start_slow_test(_opt); });
    else
        start_slow_test(opt);
    return et;
};

E.etask_fn = function(et_fn, opt){
    if (E.disable)
        return et_fn;
    return function(){ return E.etask(et_fn.apply(this, arguments), opt); };
};
