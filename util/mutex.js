// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const etask = require('./etask.js');
const slow = require('./slow.js');
const E = exports;

function format_mutex_slow(mutex_id, type){
    return 'mutex '+type+' '+(mutex_id || '(id undefined)'); }

E.enter = (mutex, id, force)=>{
    if (id!==undefined && !force)
    {
        mutex[id] = mutex[id]||{};
        return E.enter(mutex[id], id, 1);
    }
    mutex.waiting = mutex.waiting||[];
    if (mutex.used)
    {
	let e = etask(function*mutex_enter(){
	    this.info.id = ''+id;
	    return yield this.wait();
	});
	e.__mutex_id__ = id;
	e.__slow__ = slow.start(slow.slow_opt('mutex_waiting',
	    ()=>format_mutex_slow(id, 'waiting')));
	mutex.waiting.push(e);
        return e;
    }
    mutex.used = true;
    mutex.slow = slow.start(slow.slow_opt('mutex_holding',
	()=>format_mutex_slow(id, 'holding')));
};

E.leave = (mutex, id)=>{
    if (id!==undefined)
    {
	E.leave(mutex[id]);
	/* mutex[id] might get deleted by d.resolve at the end of this func
	 * (since promise engine is synchronous) */
        if (mutex[id]!==undefined && !mutex[id].used && !mutex[id].__fast)
            delete mutex[id];
        return;
    }
    slow.end(mutex.slow);
    let e = mutex.waiting[0];
    if (!e)
	return void(mutex.used = false);
    slow.end(e.__slow__);
    mutex.slow = slow.start(slow.slow_opt('mutex_holding',
	()=>format_mutex_slow(e.__mutex_id__, 'holding')));
    mutex.waiting.shift();
    e.econtinue(1);
};

E.used = (mutex, id)=>{
    if (id!==undefined)
	return mutex[id] && mutex[id].used;
    return mutex.used;
};
