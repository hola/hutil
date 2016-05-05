// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const sql_string = require('mysql/lib/protocol/SqlString.js');
const etask = require('./etask.js');
const zerr = require('./zerr.js');
const sql_util = require('./sql_util.js');
const slow = require('./slow.js');
const mysql = require('mysql');
const sqlite3 = require('sqlite3');
const array = require('./array.js');
const list = require('./list.js');
const E = exports;
const env = process.env;

var slow_opt = {};
function get_slow_opt(op, hdr){
    var key = op+' '+hdr;
    if (slow_opt[key])
	return slow_opt[key];
    return slow_opt[key] = slow.slow_opt(op, function(start_time, info){
        var q = info.query||'';
	return hdr+' '+q.slice(0, 256)+' '
	+(info.args ? ' args '+JSON.stringify(info.args).slice(0, 128) : '');
    });
}

function sql_query_pool(_pool, query, args, opt, conn_query_fn){
    var sql, slow_test, get_conn_retry = 0, get_conn_timer;
    return etask('sql_query_pool', [function try_catch$(){
	slow_test = new slow.slow(get_slow_opt('sql_pool_get', 'sql_pool_get'))
	.start({query: query, args: args});
        return etask.nfn_apply(_pool, '.getConnection', []);
    }, function try_catch$(res){
	slow_test.end();
	if (get_conn_timer)
	    get_conn_timer = clearTimeout(get_conn_timer);
	if (this.error)
	{
	    zerr('ERROR pool getConnection query '+query+' err '+this.error);
	    return this.ethrow(this.error);
	}
	sql = res;
	slow_test = new slow.slow(get_slow_opt('sql_query', 'sql_pool_query'))
	.start({query: query, args: args});
        sql.auto_prepare = _pool.auto_prepare!==undefined ?
	    _pool.auto_prepare : true;
	return conn_query_fn(sql, query, args, opt);
    }, function(res){
	slow_test.end();
	if (this.error)
	{
	    zerr('ERROR sql_query_pool '+query
		+(args ? ' args '+JSON.stringify(args).slice(0, 128) : '')
		+' err '+this.error);
	    return this.ethrow(this.error);
	}
	return res;
    }, function ensure$(res){
	if (sql)
	    sql.end();
    }]);
}

function sql_query_mysql(sql, query, args){
    return etask.nfn_apply(sql, '.query', [query, args]); }

const sql_query_sqlite3 = (sql, query, args, opt)=>etask(
function*sql_query_sqlite3(){
    let pquery = (opt.prepare===undefined && sql.auto_prepare) ||
        opt.prepare;
    if (!pquery)
        return yield etask.nfn_apply(sql, '.all', [query, args]);
    let stmt, q_cache;
    this.on('ensure', ()=>{
        if (!stmt)
            return;
        q_cache.used.rm(stmt);
        q_cache.free.push(stmt);
    });
    let pquery_cache = sql.pquery_cache = sql.pquery_cache||{};
    q_cache = pquery_cache[query] = pquery_cache[query]||
        {used: list.list(), free: list.list()};
    stmt = q_cache.free.pop()||sql.prepare(query);
    if (!stmt)
        throw new Error('failed prepare '+query);
    q_cache.used.push(stmt);
    return yield etask.nfn_apply(stmt, '.all', [args]);
});

E.query = function(sql, query, args, opt){
    /* XXX Dmitry: change constructor.name to instanceof. instanceof need
     * 'require' to the objects */
    opt = opt||{};
    if (sql.constructor.name=='zsql')
	return sql.do_query(query, args, opt);
    if (sql.constructor.name=='Pool' && sql._protocol)
	return sql_query_pool(sql, query, args, opt, sql_query_mysql);
    if (sql.constructor.name=='Connection' && sql._protocol)
        return sql_query_mysql(sql, query, args, opt);
    if (sql instanceof sqlite3.Database)
        return sql_query_sqlite3(sql, query, args, opt);
    throw new Error('invalid sql type '+sql.constructor.name);
};

function sql_object(sql, command, object){
    return E.query(sql, command+' ('+Object.keys(object).join()
	+') VALUES ('
	+Object.keys(object).map(s=>'?').join()+')',
	Object.keys(object).map(k=>object[k]));
}

E.insert = function(sql, table, object){
    return sql_object(sql, 'INSERT INTO '+table, object); };

E.replace = function(sql, table, object){
    return sql_object(sql, 'REPLACE INTO '+table, object); };

E.conn_like_pool = function(pool){
    if (!pool.do_conn_from_pool)
	throw new Error('zsql is not a pool');
    return pool.do_conn_from_pool();
};

function zsql(driver){
    var slow_test = 1, def_conn_limit = 10;
    switch (driver)
    {
    case 'mysql':
	this.do_connect = function(opt){
	    this.sql = mysql.createConnection(opt);
	    this.sql.connect();
	};
	this.do_query = function(query, args, opt){
	    return sql_query_mysql(this.sql, query, args, opt); };
	this.do_destroy = function(query, args){ this.sql.destroy(); };
	break;
    case 'mysql_pool':
	slow_test = 0;
	this.do_connect = function(opt){
	    opt.connectionLimit = opt.connectionLimit||def_conn_limit;
	    this.sql = mysql.createPool(opt);
	};
	this.do_query = function(query, args, opt){
	    return sql_query_pool(this.sql, query, args, opt,
		sql_query_mysql);
	};
	this.do_destroy = function(query, args){ this.sql.end(); };
	this.do_conn_from_pool = function(){
	    return E.connect(this.opt, 'mysql'); };
	break;
    case 'sqlite3':
	this.do_connect = function(opt){
            var mode = opt.readonly ? sqlite3.OPEN_READONLY : null;
            this.sql = new sqlite3.Database(opt.database, mode);
	    this.sql.auto_prepare = env.SQLITE_AUTOPREPARE!==undefined ?
                +env.SQLITE_AUTOPREPARE : true;
        };
	this.do_query = function(query, args, opt){
	    return sql_query_sqlite3(this.sql, query, args, opt); };
	this.do_destroy = function(query, args){
            var sql = this.sql, pquery_cache = sql.pquery_cache;
            for (var p in pquery_cache)
            {
                var _p = pquery_cache[p];
                _p.free.forEach(stmt=>stmt.finalize());
                _p.used.forEach(stmt=>stmt.finalize());
            }
            this.sql.close();
        };
	break;
    default: throw 'invalid mysql driver '+driver;
    }
    if (slow_test)
    {
	this.do_query = slow.etask_fn(this.do_query, get_slow_opt(
	    'sql_query', 'sql_query'));
    }
    this.driver = driver;
}

E.connect = function(conn, driver){
    var opt = conn instanceof Object ? conn :
	sql_util.get_mysql_conn_opt(conn);
    var sql;
    opt.db = opt.database;
    zerr.info('sql connect '+driver+' '+opt.host+' user '+
	opt.user+' password '+opt.password+' database '+opt.database);
    sql = new zsql(driver);
    /* XXX dmitry: maybe omit opt from do_connect */
    sql.opt = opt;
    sql.do_connect(opt);
    return sql;
};

E.destroy = function(sql){
    if (sql.do_destroy)
	sql.do_destroy();
};

E.sqlite_create = (sql, table, create)=>etask(function*(){
    let op;
    let res = yield E.query(sql, 'SELECT sql FROM sqlite_master WHERE name=?',
            [table]);
    if (!res.length)
        op = 'create';
    else if (res[0].sql.toUpperCase()==create.toUpperCase())
        yield this.ereturn('noop');
    else
    {
        op = 'drop_create';
        yield E.query(sql, 'DROP TABLE "'+table+'"');
    }
    yield E.query(sql, create);
    return op;
});
