// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const _mongodb = require('mongodb');
const _ = require('underscore');
const cookie = require('cookie');
const zcounter = require('./zcounter.js');
const etask = require('./etask.js');
const sprintf = require('./sprintf.js');
const zerr = require('./zerr.js');
const zexit = zerr.zexit;
const slow = require('./slow.js');
const array = require('./array.js');
const mutex = require('./mutex.js');
const date = require('./date.js');
const zescape = require('./escape.js');
const E = exports;
const assign = Object.assign, SEC = date.ms.SEC;
let mongo_mutex = {};
let open_conns = {};
let env = process.env;

let slow_opt = {};
let monitored_colls = {};
function mongo_slow(et, opt, op, zmongo, selector){
    if (opt.slow!==undefined && !opt.slow)
	return;
    et.zmongo_name = zmongo && zmongo.name;
    et.selector = selector;
    let tag = 'mongo';
    let collection = monitored_colls[et.zmongo_name];
    if (!slow_opt[op])
    {
        let format_cb = (start_time, et)=>sprintf(
            op+' %s %O ', et.zmongo_name, et.selector);
        slow_opt[op] = [slow.slow_opt(tag, format_cb)];
        if (collection)
            slow_opt[op].push(slow.slow_opt(tag+collection, format_cb));
    }
    slow.etask(et, slow_opt[op]);
}

E.monitor_slow = function(collections){
    collections.forEach(name=>{
        let i = name.indexOf(':');
        monitored_colls[i==-1 ? 'zserver:'+name : name] =
            '_'+name.substring(i+1);
    });
};

function log_query(query, name, selector, update, res, et){
    let level = +env.MONGODB_LOG_QUERIES ? zerr.L.NOTICE : zerr.L.DEBUG;
    if (zerr.is(level))
    {
	zerr.notice('mongodb %s db %s selector: %O, update: %O, res: %O,'
            +' position:\n %s', query, name, selector, update, res, et.ps());
    }
}

function handle_error(zmongo, type, err, selector, update){
    let err_fn = zerr.zexit;
    // XXX vladimir: filter only connection errors
    if (0 && zmongo.opt.no_zexit)
    {
        zmongo.stub = true;
        err_fn = zerr;
    }
    if (zmongo.opt.known_err && err.message &&
        err.message.includes(zmongo.opt.known_err))
    {
        err_fn = zerr;
    }
    err_fn('failed mongodb %s %s: %s %O %O', type, zmongo.name, err, selector,
        update);
    throw err;
}

function check_stub(zmongo){
    if (!zmongo.stub)
        return false;
    zerr('mongodb stub used for '+zmongo.opt.host);
    zcounter.inc('mongodb_err_use_stub');
    return true;
}

E.find_one = (zmongo, selector, sort, _opt)=>etask('mongo find_one',
function*(){
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    let opt, item;
    if (!_opt)
        opt = {};
    else
        opt = _.omit(_opt, 'read_preference');
    if (sort)
	opt.sort = sort;
    if (_opt&&_opt.read_preference)
        opt.readPreference = new _mongodb.ReadPreference(_opt.read_preference);
    mongo_slow(this, opt, 'find_one', zmongo, selector);
    zerr.debug('mongodb findOne %s %O', zmongo.name, selector);
    try { item = yield etask.nfn_apply(zmongo.collection, '.findOne',
        [selector, opt]); }
    catch(e){ handle_error(zmongo, 'findOne', e, selector); }
    log_query('findOne', zmongo.name, selector, null, item, this);
    return item;
});

E.find_all = (zmongo, selector, opt)=>etask(function*mongo_find_all(){
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    opt = opt||{};
    mongo_slow(this, opt, 'find_all', zmongo, selector);
    zerr.debug('mongodb find_all. selector: %O', selector);
    let opts = opt.hint ? {hint: opt.hint} : null, items;
    let cursor = zmongo.collection.find(selector, opt.projection||{}, opts);
    if (opt.sort)
        cursor.sort(opt.sort);
    if (opt.limit)
        cursor.limit(opt.limit);
    if (opt.skip)
        cursor.skip(opt.skip);
    try { items = yield etask.nfn_apply(cursor, '.toArray', []); }
    catch(e){ handle_error(zmongo, 'find.toArray', e, selector); }
    log_query('toArray', zmongo.name, selector, null, items, this);
    return items;
});

// XXX vladimir: add undeprecated variants
E.find_and_modify = (zmongo, selector, sort, update, opt)=>etask(
    'mongo find_and_modify',
function*(){
    if (check_stub(zmongo))
        return null;
    opt = opt||{};
    mongo_slow(this, opt, 'find_and_modify', zmongo, selector);
    let res;
    try { res = yield etask.nfn_apply(zmongo.collection, '.findAndModify',
        [selector, sort, update, opt]); }
    catch(e){ handle_error(zmongo, 'findAndModify', e, selector); }
    log_query('findAndModify', zmongo.name, selector, update, res, this);
    return res.value;
});

E.get_next = (cursor, opt)=>etask(function*mongo_get_next(){
    opt = opt||{};
    mongo_slow(this, opt, 'get_next', cursor.zmongo,
        cursor.selector);
    zerr.debug('mongodb nextObject.');
    let res;
    try { res = yield etask.nfn_apply(cursor, '.nextObject', []); }
    catch(e){ zexit('failed mongodb nextObject: %s %O', e, cursor.selector); }
    log_query('nextObject', cursor.zmongo.name, cursor.selector, null, res,
        this);
    return res;
});

E.find = (zmongo, selector, opt)=>{
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    let args = [selector];
    if (opt)
	args.push(opt);
    zerr.debug('mongodb find. selector: %O', selector);
    let cursor = zmongo.collection.find.apply(zmongo.collection, args);
    cursor.selector = selector; // for debug
    cursor.zmongo = zmongo; // for debug
    return cursor;
};

E.update = (zmongo, selector, update, opt)=>etask(function*mongo_update(){
    if (check_stub(zmongo))
        return null;
    opt = opt||{upsert: true};
    selector = selector||{};
    mongo_slow(this, opt, 'update', zmongo, selector);
    zerr.debug('mongodb update %s. selector: %O', zmongo.name, selector);
    let res;
    try { res = yield etask.nfn_apply(zmongo.collection, '.update',
        [selector, update, opt]); }
    catch(e){ handle_error(zmongo, 'update', e, selector, update); }
    log_query('update', zmongo.name, selector, update, res, this);
    return res;
});

/* does not replace the entire obj, just $set/$unset relevant fields */
E.update_part = (zmongo, selector, update, opt)=>etask('mongo update_part',
function*(){
    if (check_stub(zmongo))
        return null;
    let set = {}, unset = {}, set_count = 0, unset_count = 0;
    selector = selector||{};
    opt = opt||{};
    for (let prop in update)
    {
	if (update[prop]===undefined)
	{
	    unset[prop] = update[prop];
	    unset_count++;
	}
	else
	{
	    set[prop] = update[prop];
	    set_count++;
	}
    }
    if (!set_count && !unset_count)
	throw new Error('update_part with no fields called');
    let modifier = {}, res;
    if (set_count)
	modifier.$set = set;
    if (unset_count)
	modifier.$unset = unset;
    mongo_slow(this, opt, 'update_part', zmongo, selector);
    zerr.debug('mongodb update selector: %O', selector);
    try { res = yield etask.nfn_apply(zmongo.collection, '.update',
        [selector, modifier, opt]); }
    catch(e){ handle_error(zmongo, 'update_part', e, selector, update); }
    log_query('update_part', zmongo.name, selector, modifier, res, this);
});

// XXX vladimir: remove deprecated eval
E.update_atomic = function(zmongo, selector, f){
    let params = array.slice(arguments, 3);
return etask(function*mongo_atomic_update(){
    if (check_stub(zmongo))
        return null;
    mongo_slow(this, {}, 'update_atomic', zmongo, selector);
    try { yield E.find_one(zmongo, selector); }
    catch(e){ zerr(e); throw e; }
    try { yield etask.nfn_apply(zmongo.db, '.eval', [f, params]); }
    catch(e){ handle_error(zmongo, 'eval', e, selector); throw e; }
}); };

E.upload_collection = (zmongo, docs, opt)=>etask('mongo upload_collection',
function*(){
    opt = opt||{};
    if (!docs)
	zexit('failed mongodb upload_collection: no docs');
    if (opt.sync)
    {
        mongo_slow(this, opt, 'upload_collection', zmongo, docs);
        zerr.debug('mongo upload_collection_sync');
        let q = [], ids = [];
        for (let doc of docs)
        {
            if (!doc._id)
                zexit('failed mongodb upload_collection: doc without _id');
            q.push(E.update(zmongo, {_id: doc._id}, doc));
            ids.push(doc._id);
        }
        q.push(E.remove(zmongo, {_id: {$nin: ids}}));
        return yield etask.all(q);
    }
    mongo_slow(this, opt, 'upload_collection', zmongo, docs);
    zerr.debug('mongo upload_collection remove');
    yield E.remove(zmongo);
    zerr.debug('mongo upload_collection insert');
    let q = [];
    for (let doc of docs)
        q.push(E.insert(zmongo, doc));
    return yield etask.all(q);
});

E.save = (zmongo, obj, opt)=>etask(function*mongo_save(){
    if (check_stub(zmongo))
        return null;
    opt = opt||{};
    mongo_slow(this, opt, 'save', zmongo, obj);
    zerr.debug('mongodb save');
    let res;
    try { res = yield etask.nfn_apply(zmongo.collection, '.save', [obj]); }
    catch(e){ handle_error(zmongo, 'save', e, obj); }
    log_query('save', zmongo.name, obj, null, res, this);
    return res._id;
});

E.insert = (zmongo, obj, opt)=>etask(function*mongo_insert(){
    if (check_stub(zmongo))
        return null;
    opt = opt||{};
    mongo_slow(this, opt, 'insert', zmongo, obj);
    zerr.debug('mongodb insert');
    let res;
    try { res = yield etask.nfn_apply(zmongo.collection, '.insert', [obj]); }
    catch(e){ handle_error(zmongo, 'insert', e, obj); }
    log_query('insert', zmongo.name, obj, null, res, this);
    return res;
});

E.remove = (zmongo, selector, opt)=>etask(function*mongo_remove(){
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    opt = opt||{};
    mongo_slow(this, opt, 'remove', zmongo, selector);
    zerr.debug('mongodb remove %s. selector: %O', zmongo.name, selector);
    let res;
    try { res = yield etask.nfn_apply(zmongo.collection, '.remove',
        [selector]); }
    catch(e){ handle_error(zmongo, 'remove', e, selector); }
    log_query('remove', zmongo.name, selector, null, res, this);
});

E.count = (zmongo, selector, opt)=>etask(function*mongo_count(){
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    opt = opt||{};
    mongo_slow(this, opt, 'count', zmongo, selector);
    zerr.debug('mongodb count. selector: %O', selector);
    let count;
    try { count = yield etask.nfn_apply(zmongo.collection, '.count',
        [selector]); }
    catch(e){ handle_error(zmongo, 'count', e, selector); }
    log_query('count', zmongo.name, selector, null, count, this);
    return count;
});

E.aggregate = (zmongo, pipeline, opt)=>etask(function*mongo_aggregate(){
    if (check_stub(zmongo))
        return null;
    pipeline = pipeline||[];
    opt = opt||{};
    mongo_slow(this, opt, 'aggregate', zmongo, pipeline);
    zerr.debug('mongodb aggregate. pipeline: %O', pipeline);
    let agg;
    try { agg = yield etask.nfn_apply(zmongo.collection, '.aggregate',
        [pipeline]); }
    catch(e){ handle_error(zmongo, 'aggregate', e, pipeline); }
    log_query('aggregate', zmongo.name, pipeline, null, agg, this);
    return agg;
});

E.distinct = (zmongo, key, selector, opt)=>etask(function*mongo_distinct(){
    if (check_stub(zmongo))
        return null;
    selector = selector||{};
    let args = [key, selector];
    if (opt)
        args.push(opt);
    zerr.debug('mongodb distinct. key %O selector %O', key, selector);
    return yield zmongo.collection.distinct.apply(zmongo.collection, args);
});

E.initialize_ordered_bulk_op = (zmongo, opt)=>
    zmongo.collection.initializeOrderedBulkOp(opt);

E.initialize_unordered_bulk_op = (zmongo, opt)=>
    zmongo.collection.initializeUnorderedBulkOp(opt);

E.execute = (bulk, opt)=>etask(function*mongo_bulk_execute(){
    zerr.debug('mongodb bulk execute');
    try { return yield etask.nfn_apply(bulk, '.execute', [opt]); }
    catch(e){ zexit('failed mongodb bulk execute: %s', e); }
});

E.options = zmongo=>etask(function*mongo_options(){
    if (check_stub(zmongo))
        return null;
    mongo_slow(this, {}, 'options', zmongo);
    zerr.debug('mongodb options %s', zmongo.name);
    let options;
    try { options = yield etask.nfn_apply(zmongo.collection, '.options', []); }
    catch(e){ handle_error(zmongo, 'options', e); }
    log_query('options', zmongo.name, {}, null, options, this);
    return options;
});

E.close = zmongo=>etask(function*mongo_close(){
    if (check_stub(zmongo))
        return null;
    if (+env.MONGO_REUSE_CONNS)
    {
        for (let i in open_conns)
        {
            if (open_conns[i]==zmongo.db)
                open_conns[i] = null;
        }
    }
    return yield etask.nfn_apply(zmongo.db, '.close', []);
});

E.connect = (conn, db, collection)=>etask(function*mongo_connect(){
    let opt = assign({host: 'localhost', port: 27017},
	conn instanceof Object ? conn : cookie.parse(conn||''));
    let can_reuse = +env.MONGO_REUSE_CONNS;
    let url, ret = {opt: opt}, _db, _collection;
    // XXX vladimir: deprecate and remove db param, it is overridden by opt
    db = opt.db||db;
    let hosts = opt.host+':'+opt.port, host;
    for (let i=1; host = opt['host'+i]; i++)
        hosts += ','+host+':'+(opt['port'+i]||'27017');
    let url_opts = {};
    let conv_table = {w: 'w', pool_size: 'maxPoolSize',
        read_preference: 'readPreference', replica_set: 'replicaSet'};
    for (let o in opt)
    {
        let mongo_name = conv_table[o];
        if (mongo_name)
            url_opts[mongo_name] = opt[o];
    }
    url = zescape.uri('mongodb://'+hosts+'/'+db, url_opts);
    if (can_reuse)
    {
        this.on('ensure', ()=>mutex.leave(mongo_mutex, url));
        yield mutex.enter(mongo_mutex, url);
    }
    if (can_reuse && open_conns[url])
    {
        zerr.info('reusing conn '+url);
        _db = open_conns[url];
    }
    else
    {
        let connect_timeout = +opt.connect_timeout_ms||90*SEC;
        let config = {
            server: {socketOptions: {connectTimeoutMS: connect_timeout,
                socketTimeoutMS: 24*date.ms.HOUR, keepAlive: 1}},
            replSet: {socketOptions: {connectTimeoutMS: connect_timeout,
                socketTimeoutMS: 24*date.ms.HOUR, keepAlive: 1}},
            db: {},
        };
        config.server.auto_reconnect = opt.auto_reconnect ?
            !!+opt.auto_reconnect : true;
        if (!config.server.auto_reconnect)
            config.db.bufferMaxEntries = 0;
        else if (opt.buffer_max_entries)
            config.db.bufferMaxEntries = +opt.buffer_max_entries;
        try { _db = yield etask.nfn_apply(_mongodb.MongoClient, '.connect',
            [url, config]); }
        catch(e){
            if (opt.no_zexit)
            {
                zerr('mongodb stub %s/%s %O', db, collection, e);
                return {stub: true, opt: opt};
            }
            zexit('failed opening db %s/%s %O', db, collection, e);
        }
    }
    ret.db = _db;
    // handle disconnect
    _db.serverConfig.on('close', err=>zerr.debug(err));
    if (can_reuse && !open_conns[url])
        open_conns[url] = _db;
    try { _collection = yield etask.nfn_apply(_db, '.collection',
        [collection]); }
    catch(e){
        if (opt.no_zexit)
        {
            zerr('mongodb stub %s/%s %O', db, collection, e);
            return {stub: true, opt: opt};
        }
        zexit('failed opening collection %s/%s %O', db, collection, e);
    }
    zerr.info('opened collection '+collection);
    ret.collection = _collection;
    ret.name = db+':'+collection;
    return ret;
});

E.ensure_index = (conn, collection, index, opt)=>etask('mongo ensure_index',
function*(){
    if (check_stub(conn))
        return null;
    return yield etask.nfn_apply(conn.db, '.ensureIndex',
        [collection, index, opt||{}]);
});

E.create_collection = (conn, collection, indexes, opt)=>etask(
    'mongo create_collection',
function*(){
    if (check_stub(conn))
        return null;
    let col = yield etask.nfn_apply(conn.db, '.createCollection',
        [collection, opt]);
    if (!indexes)
        return col;
    yield etask.all(indexes.map(ind=>E.ensure_index(conn, collection, ind)));
    return col;
});

E.drop_collection = zmongo=>etask(function*mongo_drop_collection(){
    if (check_stub(zmongo))
        return null;
    try { return yield etask.nfn_apply(zmongo.collection, '.drop', []); }
    catch(e){ handle_error(zmongo, 'drop', e); }
});

E.serverStatus = (zmongo, _opt)=>{
    let opt = {};
    if (_opt&&_opt.read_preference)
        opt.readPreference = _opt.read_preference;
    return E.command(zmongo, {serverStatus: 1},
        assign({ignoreCommandFilter: true}, opt));
};

E.command = (zmongo, command, opt)=>etask(function*mongo_command(){
    if (check_stub(zmongo))
        return null;
    let args = [command];
    if (opt)
        args.push(opt);
    try { return yield etask.nfn_apply(zmongo.db, '.command', args); }
    catch(e){ handle_error(zmongo, 'command', e); }
});
E.use_power_of_2_sizes = (zmongo, collection, val)=>etask(
    'mongo use_power_of_2_sizes',
function*(){
    try { return yield E.command(zmongo,
        {collMod: collection, usePowerOf2Sizes: val!==false}); }
    catch(e){ handle_error(zmongo, 'usePowerOf2Sizes', e); }
});

E.current_op = (zmongo, query)=>zmongo.db.admin().command(
    assign({currentOp: 1}, query));

E.Iterator = Iterator;
function Iterator(name, cursor, opt){
    assign(this, {done: false, limit: 0, progress: 0}, opt);
    this.curr = null;
    this.cursor = cursor;
    this.name = name;
    this.num_read = 0;
}

Iterator.prototype.next = function(){
    let _this = this;
    return etask(function*(){
	if (_this.done)
	    return;
	let e = yield E.get_next(_this.cursor);
	if (_this.limit && _this.num_read==_this.limit)
	{
	    e = null;
	    zerr.notice('Iterator '+_this.name+': reached limit');
	}
        if (!e)
	{
	    _this.cursor.close();
            _this.done = true;
	}
	else
	{
	    _this.num_read++;
	    if (_this.progress && !(_this.num_read % _this.progress))
		zerr.notice(_this.name+': '+_this.num_read);
	}
        return _this.curr = e;
    });
};

Iterator.prototype.close = function(){
    if (this.done)
	return;
    this.cursor.close();
};

Iterator.prototype.etask_forEach = etask._fn(
function*mongo_it_foreach(_this, item_fn){
    for (;;)
    {
        let ret = yield _this.next();
        if (_this.done)
            return;
        yield item_fn(ret);
    }
});

function _escape(o, re, replace){
    let i;
    if (o instanceof Array)
    {
	for (i=0; i<o.length; i++)
	    _escape(o[i], re, replace);
    }
    else if (o instanceof Object)
    {
	for (i in o)
	{
	    let _i = i;
	    if (re.test(i))
	    {
		_i = replace(i);
		o[_i] = o[i];
		delete o[i];
	    }
	    _escape(o[_i], re, replace);
	}
    }
    return o;
}

E.escape = o=>_escape(o, /[$.]/,
    i=>i.replace(/\$/g, '\uff04').replace(/\./g, '\uff0e'));

E.unescape = o=>_escape(o, /[\uff04\uff0e]/,
    i=>i.replace(/\uff04/g, '$').replace(/\uff0e/g, '.'));

E.read_preference = _mongodb.ReadPreference;

function mk_selector(sample, keys, prefix){
    let res = {};
    prefix = prefix||'';
    _.each(keys, key=>res[prefix+key] = sample[key]);
    return res;
}

function is_object(x){ return x && x.constructor===Object; }

function do_push(changeset, path, values){
    changeset.$push = changeset.$push||{};
    if (values.length == 1)
        changeset.$push[path] = values[0];
    else
        changeset.$push[path] = {$each: values};
}

function do_set(changeset, path, value){
    changeset.$set = changeset.$set||{};
    changeset.$set[path] = value;
}

function object_compare(prev, cur, special_arr, prefix){
    let changeset = {}, selector;
    special_arr = special_arr||{};
    prefix = prefix ? prefix+'.' : '';
    _.each(cur, (cur_value, key)=>{
        let prev_value = prev[key];
        let path = prefix+key;
        let arr_keys = special_arr[key];
        let res;
        if (Array.isArray(cur_value) && Array.isArray(prev_value) && arr_keys)
        {
            res = arr_compare_with_key(prev_value, cur_value, arr_keys, key);
            if (res.full || (res.changed && selector))
            {
                do_set(changeset, path, cur_value);
                return;
            }
            if (res.added)
            {
                do_push(changeset, path, res.added);
                return;
            }
            if (res.changed)
            {
                object_extend_deep(changeset, {$set: res.changed});
                selector = res.selector;
            }
            return;
        }
        if (is_object(cur_value) && is_object(prev_value))
        {
            res = object_compare(prev_value, cur_value, null, path);
            if (res)
                object_extend_deep(changeset, res.modifier);
            return;
        }
        if (!_.isEqual(prev_value, cur_value))
            do_set(changeset, path, cur_value);
    });
    if (_.isEmpty(changeset))
        return;
    return {selector: selector||{}, modifier: changeset};
}

function arr_compare_with_key(prev, cur, keys, prefix){
    let added, changed, selector;
    prefix = prefix ? prefix+'.' : '';
    for (let i=0; i < cur.length; i++)
    {
        let cur_element = cur[i];
        if (!is_object(cur_element))
            return {full: 1};
        let prev_element = _.findWhere(prev, mk_selector(cur_element, keys));
        if (!prev_element)
        {
            if (changed)
                return {full: 1};
            added = added||[];
            added.push(cur_element);
            continue;
        }
        let res = object_compare(prev_element, cur_element, {}, prefix+'$');
        if (res)
        {
            if (changed || added)
                return {full: 1};
            selector = mk_selector(cur_element, keys, prefix);
            changed = res.modifier.$set;
            continue;
        }
    }
    return {added: added, selector: selector, changed: changed};
}

function object_extend_deep(target, source){
    for (let prop in source)
    {
        if (prop in target)
            object_extend_deep(target[prop], source[prop]);
        else
            target[prop] = source[prop];
    }
    return target;
}

E.mongo_diff = object_compare;
E.object_id = _mongodb.ObjectID;
E.double = _mongodb.Double;
E.binary = _mongodb.Binary;
