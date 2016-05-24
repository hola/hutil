// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const fs = require('fs');
const string = require('./string.js');
const zerr = require('./zerr.js');
const file = require('./file.js');
const array = require('./array.js');
const assert = require('assert');
const cli = require('./cli.js');
const os = require('os');
const E = exports;
const env = process.env;
const qw = string.qw;

var distro_release;
var procfs_fmt = {
    cpu: qw`cpu user nice system idle iowait irq softirq steal guest
        guest_nice`,
    pstat: qw`pid tcomm state ppid pgrp sid tty_nr tty_pgrp flags min_flt
        cmin_flt maj_flt cmaj_flt utime stime cutime cstime priority nice
        num_threads it_real_value start_time vsize rss rsslim start_code
        end_code start_stack esp eip pending blocked sigign sigcatch notused
        notused notused exit_signal task_cpu rt_priority policy blkio_ticks
        gtime cgtime start_data end_data start_brk arg_start arg_end env_start
        env_end exit_code`,
    filenr: qw`open unused max`,
    diskstats: qw`major minor reads reads_merged reads_sector reads_ms writes
	writes_merged writes_sector writes_ms io_current io_ms io_weighted_ms`,
};

// XXX vadim: all procfs-related funcs should use this and not magic numbers
function read_procfs_line(filepath, type){
    var str;
    if (!(str = file.read(filepath)))
        return;
    var res = {}, parts = str.split(/ +/);
    procfs_fmt[type].forEach((name, idx)=>res[name] = parts[idx]||0);
    return res;
}

// on some machines the lines are in a different order
E.meminfo_parse = function(info){
    var n = string.split_nl(info), mem = {};
    for (var i=0; i<n.length; i++)
    {
	if (!n[i])
	    continue;
	var m = /^([A-Za-z0-9_()]+):\s+([0-9]+)( kB)?$/.exec(n[i]);
	assert(m);
	switch (m[1])
	{
	case 'MemTotal': mem.memtotal = m[2]*1024; break;
	case 'MemFree': mem.memfree = m[2]*1024; break;
	case 'Buffers': mem.buffers = m[2]*1024; break;
	case 'Cached': mem.cached = m[2]*1024; break;
	}
    }
    return mem;
};

// os.freemem does not include buffers and cached as freemem
E.meminfo = function(){
    var info = file.read_e('/proc/meminfo');
    var mem = E.meminfo_parse(info);
    mem.buffers = mem.buffers||0; // openvz does not always have Buffers
    mem.memfree_all = mem.memfree+mem.buffers+mem.cached;
    return mem;
};
E.freemem = function(){ return E.meminfo().memfree_all; };
E.totalmem = function(){ return E.meminfo().memtotal; };
E.mem_usage = function(){
    var info = E.meminfo();
    return (info.memtotal-info.memfree_all)/info.memtotal;
};
E.freemem_percent = function(){ return 100*(1-E.mem_usage()); };
E.get_release = function(){
    if (file.is_win)
        distro_release = {};
    if (!distro_release)
    {
	var info = cli.exec_get_lines(['lsb_release', '-i', '-r', '-c', '-s']);
	distro_release = {
            id: info[0].toLowerCase(),
            version: info[1],
	    codename: info[2].toLowerCase(),
        };
    }
    return distro_release;
};
E.is_release = function(releases){
    E.get_release();
    return releases.some(function(e){
        var m = e.toLowerCase().match(/^(i|v|c):(.*)$/);
        switch (m[1])
        {
        case 'i':
            return distro_release.id==m[2];
        case 'v':
            return distro_release.version==m[2];
        case 'c':
            return distro_release.codename==m[2];
        }
    });
};
var swapfile = '/tmp/zapt.swap';
E.swapon = function(){
    if (!file.is_file(swapfile) || file.size(swapfile)<512*1024*1024)
    {
	cli.exec_rt_e('rm -f '+swapfile);
	// XXX sergey: we cannot use it anyway, it disabled by hoster
	if (cli.exec_rt('fallocate -l 512M '+swapfile))
	    return;
	cli.exec_rt_e('mkswap '+swapfile);
    }
    // XXX sergey: some openvz does not support swapon, ignore it
    cli.exec_rt('swapon '+swapfile);
};
E.swapoff = function(){ cli.exec_rt('swapoff '+swapfile); };
E.check_space = function(req){
    return +cli.exec_get_line('df --output=avail -k / | grep -iv avail')>req;
};

function cpu_diff(prev, curr){
    var d = {};
    for (var i in curr)
	d[i] = curr[i]-prev[i];
    d.busy = d.user+d.nice+d.system+d.irq+d.softirq+d.steal+d.guest+
	d.guest_nice;
    d.total = d.busy+d.idle+d.iowait;
    if (d.total>0)
	d.busy_ratio = d.busy/d.total;
    return d;
}

function cpus_diff(prev, curr){
    var diff = [];
    for (var i = 0; i<curr.length; i++)
    {
	diff.push(cpu_diff(prev[i], curr[i]));
    }
    diff.all = cpu_diff(prev.all, curr.all);
    return diff;
}

// XXX vadim: cleanup
E.cpus = function(){
    var ll;
    if (file.is_win)
        ll = cli.exec_get_lines('cat /proc/stat');
    else
        ll = file.read_lines_e('/proc/stat');
    var cpus = [];
    var items = ['user', 'nice', 'system', 'idle', 'iowait', 'irq', 'softirq',
	'steal', 'guest', 'guest_nice'];
    ll.forEach(l=>{
	if (!/^cpu\d* /.test(l))
	    return;
        l = l.split(/ +/);
	var c = {}, name = l[0]=='cpu' ? 'all' : +l[0].slice(3), i;
	for (i=0; i<items.length; i++)
	    c[items[i]] = +(l[i+1]||0); // guest/guest_nice not on old kernels
	cpus[name] = c;
    });
    return cpus;
};

E.cpu_threads = function(){
    let res = {};
    E.ps().forEach(pid=>{
        const taskdir = `/proc/${pid}/task`;
        file.readdir(taskdir).map(d=>+d).forEach(tid=>{
            let stat;
            if (!(stat = read_procfs_line(`${taskdir}/${tid}/stat`, 'pstat')))
                return;
            res[tid] = +stat.utime+(+stat.stime);
        });
    });
    return res;
};

E.cpu_threads_prev = {};
E.cpu_threads_usage = function(){
    const curr = E.cpu_threads();
    let res = [];
    for (let tid in curr)
        res.push(curr[tid]-E.cpu_threads_prev[tid]||0);
    E.cpu_threads_prev = curr;
    return res;
};

E.cpus_prev = [null, null];
E.cpu_usage = function(cpus_curr, cpus_prev){
    var p = cpus_prev||E.cpus_prev;
    cpus_curr = cpus_curr||E.cpus();
    var zero = {all: 0, single: 0};
    if (!p[0])
    {
	p[1] = p[0] = cpus_curr;
	return zero;
    }
    var d = cpus_diff(p[0], cpus_curr);
    if (!d.all.total)
    {
	d = cpus_diff(p[1], cpus_curr);
	if (!d.all.total)
	    return zero;
    }
    else
    {
	p[1] = p[0];
	p[0] = cpus_curr;
    }
    const total_per_cpu = d.all.total/d.length;
    const threads = E.cpu_threads_usage();
    return {all: d.all.busy_ratio,
	single: Math.max.apply(null, d.map(e=>e.busy_ratio)),
        thread_single: Math.max.apply(null, threads.map(x=>x/total_per_cpu)),
        diff: d};
};
if (!file.is_darwin)
    E.cpu_usage(); // init

E.net_dev = undefined;
function set_net_dev(){
    if (E.net_dev)
	return;
    // XXX vadim: rename to NET_DEV_STAT?
    if (env.NET_DEV)
    {
        E.net_dev = qw(env.NET_DEV);
        E.net_dev.forEach(dev=>{
            if (!file.exists('/sys/class/net/'+dev))
            {
                zerr.perr('err_assert_bad_conf', 'Device '+dev+' configured '+
                    'in NET_DEV env but it does not exist');
            }
        });
        return;
    }
    var search = ['eth0', 'venet0'];
    for (var i in search)
    {
	if (file.exists('/sys/class/net/'+search[i]))
	    return void(E.net_dev = [search[i]]);
    }
}
set_net_dev();

E.net_dev_stats = function(net_dev){
    var o = {};
    net_dev = array.to_array(net_dev||E.net_dev);
    if (!net_dev.length)
	return;
    net_dev.forEach((dev, index)=>{
        var ifname = index ? '_'+dev : '';
        var stats = ['rx_bytes', 'tx_bytes', 'tx_packets', 'rx_packets'];
        for (var i in stats)
        {
            try {
                o[stats[i]+ifname] = +file.read_e(
                    '/sys/class/net/'+dev+'/statistics/'+stats[i]);
            } catch(e){}
        }
    });
    return o;
};

function beancounter_value(value){
    return value=='9223372036854775807' ? null : +value; }

E.beancounters = function(){
    try {
	var info = file.read_lines_e('/proc/user_beancounters')
	.slice(2).map(line=>line.slice(12).split(/[^\w]+/g));
	var data = {total_failcnt: 0};
	info.forEach(line=>{
	    data[line[0]] = {
		held: +line[1],
	    	maxheld: +line[2],
	    	barrier: beancounter_value(line[3]),
	    	limit: beancounter_value(line[4]),
	    	failcnt: +line[5]
	    };
	    data.total_failcnt += +line[5];
	});
	return data;
    } catch(e){ return; }
};

E.TCP = { // net/tcp_states.h
    1: 'ESTABLISHED',
    2: 'SYN_SENT',
    3: 'SYN_RECV',
    4: 'FIN_WAIT1',
    5: 'FIN_WAIT2',
    6: 'TIME_WAIT',
    7: 'CLOSE',
    8: 'CLOSE_WAIT',
    9: 'LAST_ACK',
    10: 'LISTEN',
    11: 'CLOSING',
};
E.sockets_count = function(proto){
    // XXX: read_lines_e will fail on high socket count
    var conns = file.read_lines_e('/proc/net/'+proto);
    var i, v = {total: 0, lo: 0, ext: 0, err: 0};
    for (i in E.TCP)
	v[E.TCP[i]] = 0;
    for (i=1; i<conns.length; i++)
    {
	var conn = conns[i], start;
	if (!conn)
	    continue;
	if ((start = conn.indexOf(':'))==-1)
	{
	    v.err++;
	    continue;
	}
	v.total++;
	if (conn.substr(start+2, 8)=='0100007F')
	    v.lo++;
	else
	    v.ext++;
	var state = E.TCP[+('0x'+conn.substr(start+30, 2))];
	if (state)
	    v[state]++;
    }
    return v;
};

E.vmstat = function(){
    var vmstat = file.read_lines_e('/proc/vmstat');
    var ret = {};
    for (var i=0; i<vmstat.length; i++)
    {
	var n = qw(vmstat[i]);
	if (!n[0])
	    continue;
	ret[n[0]] = +n[1];
    }
    return ret;
};

E.disk_page_io = function(){
    var vmstat = E.vmstat();
    // pgpgin/pgpgout are reported in KB
    return {read: vmstat.pgpgin*1024, write: vmstat.pgpgout*1024};
};

E.diskstats_prev = {};
E.diskstats = function(){
    // https://www.kernel.org/doc/Documentation/iostats.txt
    let diskstats;
    if (!(diskstats = file.read_lines('/proc/diskstats')))
        return;
    let ret = {};
    for (let i=0; i<diskstats.length; i++)
    {
	let n = diskstats[i].trim().split(/\s+/), dev = n[2];
        if (/\d+$/.test(dev)) // ignore paritions
            continue;
	let cur = ret[dev] = {major: +n[0], minor: +n[1], reads: +n[3],
	    reads_merged: +n[4], reads_sector: +n[5], reads_ms: +n[6],
	    writes: +n[7], writes_merged: +n[8], writes_sector: +n[9],
	    writes_ms: +n[10], io_current: +n[11], io_ms: +n[12],
	    io_weighted_ms: +n[13], await: 0, util: 0, ts: Date.now()};
        cur.rw_ms = cur.reads_ms+cur.writes_ms;
        cur.rw_ios = cur.reads+cur.writes;
        let prev;
        if (!(prev = E.diskstats_prev[dev]))
            continue;
        let d_ts = cur.ts-prev.ts;
        let d_ios = cur.rw_ios-prev.rw_ios;
        cur.await = d_ios ? (cur.rw_ms-prev.rw_ms)/d_ios : 0;
        cur.util = d_ts ? ((cur.io_ms-prev.io_ms)/d_ts)*100 : 0;
    }
    E.diskstats_prev = ret;
    return ret;
};

E.disk_io_time = function(){
    var diskstats = E.diskstats();
    if (!diskstats)
	return;
    var io = {read: 0, write: 0, total: 0, max_await: 0, max_util: 0};
    for (var i in diskstats)
    {
	io.read += diskstats[i].reads_ms;
	io.write += diskstats[i].writes_ms;
	io.total += diskstats[i].io_ms;
        io.max_await = Math.max(io.max_await, diskstats[i].await);
        io.max_util = Math.max(io.max_util, diskstats[i].util);
    }
    return io;
};

E.info = function(){
    var info = {type: os.type(), endianness: os.endianness(),
        hostname: os.hostname(), arch: os.arch()};
    var m;
    if (info.type=='Linux')
    {
        info.issue = file.read_line('/etc/issue');
        if (info.issue && (m = info.issue.match(/^Ubuntu ([0-9.]+) /)))
            info.ubuntu = m[1];
    }
    return info;
};

E.ps = function(){
    return file.readdir('/proc').filter(p=>/^\d+$/.test(p)).map(p=>+p)
    .sort((a, b)=>a-b);
};

E.fd_use = function(opt){
    opt = opt||{};
    var verbose = opt.verbose||0, pids = E.ps(), res = {log: '', use: -1};
    function log(msg){ res.log += msg+'\n'; }
    if (!pids.length)
        return res;
    var max_use = 0, max_pid = -1, pid, g_nopen, g_nmax, g_use, g_open = -1;
    var g_open_max = -1;
    var ln = file.read_line('/proc/sys/fs/file-nr').split('\t');
    if (ln.length==3)
    {
        g_open = +ln[0];
        g_open_max = +ln[2];
    }
    g_use = g_open<0 ? 0 : 100*g_open/g_open_max;
    max_use = g_use;
    if (verbose>=2)
    {
        log('PID\tUSED\tLIMIT\t%\n'
            +'global\t'+g_open+'\t'+g_open_max+'\t'+(g_use|0));
    }
    pids.forEach(pid=>{
        pid = ''+pid;
        var open = file.readdir('/proc/'+pid+'/fd');
        var nopen = file.error ? -1 : open.length;
        var ln = (file.read('/proc/'+pid+'/limits')||''), nmax = -1, m, use;
        if (m = /Max open files +([0-9]+)/g.exec(ln))
            nmax = m[1];
        use = nopen<0 ? 0 : 100*nopen/nmax;
        if (max_use<use)
        {
            max_use = use;
            max_pid = pid;
        }
        if (verbose>=2)
        {
            if (nopen<0)
                log(pid+'\tUNKNOWN');
            else
                log(pid+'\t'+nopen+'\t'+nmax+'\t'+(use|0));
        }
    });
    max_use = max_use|0;
    if (verbose>=2)
    {
        log('Maximum fd use: pid '
            +((max_pid==-1) ? 'global' : max_pid)
            +', '+max_use+'%');
    }
    else if (verbose)
        log(max_use|0);
    res.use = max_use;
    return res;
};
