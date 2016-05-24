// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const mysql = require('mysql');
const cookie = require('cookie');
const match = require('./match.js');
const E = exports;

E.last_err = undefined;

E.make_in_list = function(list){
    return '('+(s2a_length(list) ?
	E.str2array(list).map(E.escape).join(',') : 'NULL')+')';
};

E.str2array = function(s_or_a){
    return typeof s_or_a=='string' ? [s_or_a] : s_or_a; };
function s2a_length(s_or_a){
    return s_or_a ? s_or_a.length : 0; }

/* Construct SQL SELECT query string from object */
E.build_select_query = function(query){
    var q = '', s2a = E.str2array;
    if (s2a_length(query.select))
    {
	q += 'SELECT ';
	if (query.calc_found)
	    q += 'SQL_CALC_FOUND_ROWS ';
	q += s2a(query.select).join(',\n  ')+'\n';
    }
    if (s2a_length(query.from))
	q += 'FROM '+s2a(query.from).join(',\n  ')+'\n';
    if (s2a_length(query.join))
	q += ' '+s2a(query.join).join('\n  ')+'\n';
    if (s2a_length(query.where_and) || s2a_length(query.where_or))
    {
	q += 'WHERE ';
	if (s2a_length(query.where_or))
	{
	    q += '(('+s2a(query.where_or).join(')\n OR (')+'))'
	    +(s2a_length(query.where_and) ? ' AND' : '')+'\n';
	}
	if (s2a_length(query.where_and))
	    q += '(('+s2a(query.where_and).join(')\n AND (')+'))\n';
    }
    if (s2a_length(query.group_by))
	q += 'GROUP BY '+s2a(query.group_by).join(',\n  ')+'\n';
    if (s2a_length(query.order_by))
	q += 'ORDER BY '+s2a(query.order_by).join(',\n  ')+'\n';
    if (query.limit_from || query.limit_count)
	q += 'LIMIT '+(query.limit_from||0)+','+(query.limit_count||0)+'\n';
    return q;
};

E.escape = function(val){ return mysql.escape(val); };

E.get_mysql_conn_opt = function(conn_str, defaults){
    var conn = Object.assign({host: 'localhost', user: 'root', pass: '',
	db: 'zserver', multipleStatements: false, timezone: '+00:00'},
	defaults||{}, cookie.parse(conn_str||''));
    return {host: conn.host, user: conn.user, password: conn.pass,
	database: conn.db, multipleStatements: conn.multipleStatements,
	timezone: conn.timezone, connectionLimit: conn.connectionLimit,
        socketPath: conn.socket};
};

E.match_to_sql = function(filter, field){
    var cmd = match.match_parse(filter, {glob: 're'}), i, q = '(';
    for (i=0; i<cmd.length; i++)
    {
        var c = cmd[i];
        if (c.join)
            q += c.join=='&&' ? 'AND ' : c.join=='||' ? 'OR ' : '';
        if (c.eq!==undefined)
            q += field+'='+E.escape(c.eq)+' ';
        else if (c.re!==undefined)
            q += field+' REGEXP '+E.escape(c.re)+' ';
        if (c.fn)
            q += c.fn=='!' ? 'NOT ' : c.fn+' ';
    }
    return q+')';
};
