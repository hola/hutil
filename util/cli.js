// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const getopt = require('node-getopt');
const file = require('./file.js');
const exec = require('./exec.js');
const zerr = require('./zerr.js');
const zutil = require('./util.js');
const array = require('./array.js');
const string = require('./string.js');
const sprintf = require('./sprintf.js');
const zescape = require('./escape.js');
const jtools = require('./jtools.js');
const etask = require('./etask.js');
var readline;
try { readline = require('readline-sync'); } catch(e){}
const E = exports;
E.dry_run = false;
E.opt = {};
E.L = {
    require: function(name, lib){
        this.__defineGetter__(name, function(){
           delete this[name];
           return this[name] = require(lib);
        });
    }
};

function find_opt(arg, argv){
    for (var a=0; a<argv.length; a++)
    {
        if (argv[a][0]==arg||argv[a][1]==arg)
            return a;
    }
    return -1;
}

function cmdpp(commands){
    if (!commands)
        return '';
    var maxlen = commands.reduce(function(n, cmd){
        return Math.max(n, cmd[0].length); }, 0);
    var dc = E.default_command ? `\n default: ${E.default_command}\n` : '';
    return commands.reduce((s, cmd)=>{
        return sprintf(`${s} %-${maxlen}s  ${cmd[1]}\n`, cmd[0]);
    }, 'Commands:\n')+dc;
}

function guess_dryrun(args){
    var dry = find_opt('dry-run', args)>=0;
    var real = find_opt('real-run', args)>=0;
    if (!dry&&!real)
        return;
    // Set dry-run mode if real-run or dry-run options requested
    E.dry_run = true;
    if (!dry)
        args.push(['', 'dry-run', 'emulate commands run']);
    if (!real)
        args.push(['', 'real-run', 'actually run commands']);
}

E.getopt = function(args, usage, commands){
    if (find_opt('h', args)<0)
        args.push(['h', 'help', 'show usage']);
    if (find_opt('v', args)<0)
        args.push(['v', 'verbose+', 'verbose output (-vv* to control level)']);
    guess_dryrun(args);
    if (commands)
    {
        E.commands = {};
        commands.forEach(cmd=>{
            E.commands[cmd[0]] = null;
            if (cmd[2])
                E.default_command = cmd[0];
        });
    }
    E._getopt = getopt.create(args).setHelp(
        usage.replace('[[COMMANDS]]', cmdpp(commands)));
};

// Do not process args immediatly, but store it
var p_modules = {};
E.getopt_p = function(module, args, usage, commands){
    p_modules[module.filename] = ()=>E.getopt(args, usage, commands); };

E.exit = function(msg, code){
    code = code===undefined ? 1 : code;
    if (msg)
        zerr.err(msg);
    process.exit(code);
};
E.usage = function(msg){
    E._getopt.showHelp();
    E.exit(msg);
};
E.verbose = function(msg){
    if (E.opt.verbose)
        console.log(msg);
};
E.exec = function(cmd, opt){
    E.verbose(Array.isArray(cmd) ? cmd.join(' ') : cmd);
    if (E.dry_run)
        return;
    var base_opt = Array.isArray(cmd) ? {} : {shell: true, stdio: 'inherit'};
    opt = Object.assign(base_opt, opt||{});
    return exec.sys_sync(cmd, opt);
};
E.exec_e = function(cmd, opt){
    var ret;
    if (ret = E.exec(cmd, opt))
        throw new Error("exec_e('"+cmd+"') exits with code "+ret);
};
E.exec_get_lines = function(cmd){
    return string.split_crlf(E.exec(cmd, {out: 'stdout', stdio: 'pipe'}));
};
E.exec_get_line = function(cmd){ return E.exec_get_lines(cmd)[0]; };
E.geteuid = function(){
    if (process.geteuid)
        return process.geteuid();
    var filename = '/proc/self/status';
    var status = file.is_win ?
        exec.sys_sync(['cat', filename], {out: 'stdout'}).split('\n') :
        file.read_lines(filename)||[];
    var euid = array.grep(status, /^Uid:\s*\d+\s*(\d+).*$/, '$1');
    return euid.length>0 ? +euid[0] : 1000;
};
if (E.geteuid())
{
    E.HAS_RT = !!exec.which('rt');
    E.RT = 'rt';
}
else
    E.HAS_RT = !(E.RT = '');
E.exec_rt = function(cmd, opt){
    if (Array.isArray(cmd))
        cmd = cmd.slice();
    if (!file.is_win && E.RT)
    {
        if (E.HAS_RT)
        {
            if (Array.isArray(cmd))
                cmd.unshift(E.RT);
            else
                cmd = E.RT+' '+cmd;
        }
        else if (process.stdin.isTTY)
        {
            if (Array.isArray(cmd))
                cmd = ['su', 'root', '-c', cmd.join(' ')];
            else
                cmd = 'su root -c '+zescape.sh(cmd);
        }
        else
        {
            zerr.err("need rt or 'su root' to exec "+cmd);
            return 1;
        }
    }
    return E.exec(cmd, opt);
};
E.exec_rt_e = function(cmd, opt){
    var ret;
    if (ret = E.exec_rt(cmd, opt))
        throw new Error("exec_rt_e('"+cmd+"') exits with code "+ret);
};
E.run_from_tree = function(filename, script, opt){
    var exec_opt = process.argv.slice(2);
    return jtools.exec_in_zon_tree(filename, script, exec_opt, opt);
};

E.process_commands = function(commands){
    if (!commands||!E.commands)
        return;
    E.command = E.argv.shift()||E.default_command;
    for (var cmd in E.commands)
    {
        if (!(cmd in commands))
            E.usage('Unknown command '+cmd);
        E.commands[cmd] = commands[cmd];
    }
    if (!E.command || !(E.command in E.commands))
        E.usage();
};

E.process_args = function(commands){
    // Execute delayed options
    if (module.parent.filename in p_modules)
        p_modules[module.parent.filename]();
    var options = E.sys_opt = E._getopt.parseSystem();
    var opt = E.opt = {};
    for (var o in options.options)
        opt[o] = opt[o.replace(/-/g, '_')] = options.options[o];
    E.argv = options.argv.slice();
    zerr.hide_timestamp = true;
    if (opt.help)
        E.usage();
    E.process_commands(commands);
    if (opt.verbose)
    {
        // Compact verbose to int value
        var l = opt.verbose = opt.verbose.length;
        // Default is INFO, -vv = CRIT
        zerr.set_level(l==1 ? 'INFO' : zerr.LINV[l]);
    }
    if (E.dry_run)
    {
        if (!zutil.xor(opt.dry_run, opt.real_run))
            E.usage('choose either --dry-run or --real-run');
        E.dry_run = !opt.real_run;
    }
};

E.script_error = function(name){
    function err(msg, opt){
        msg = msg||'';
        opt = opt||{};
        this.name = name;
        this.message = msg.message||msg;
        this.stack = msg.stack||(new Error(this)).stack;
        this.output = opt.output||'';
    }
    err.prototype = Object.create(Error.prototype);
    err.prototype.constructor = err;
    return err;
};

function flush_stream(stream, cb){ stream.write('', cb); }
function exit_with_code(opt, exit_code){
    if (!opt.drain)
        process.exit(exit_code);
    flush_stream(process.stdout, ()=>
        flush_stream(process.stderr, ()=>process.exit(exit_code)));
}

E.process_exit = (promise, opt)=>etask(function*process_main(){
    opt = opt||{};
    try {
        yield promise;
    } catch(e){
        console.error(opt.skip_stack ? ''+e : (e.stack||e));
        exit_with_code(opt, 1);
    }
    exit_with_code(opt, 0);
});

// get input from user that works also in cygwin
E.get_input = function(prompt, hide){
    var res, hide_cmd = hide ? '-s' : '';
    process.stdout.write(prompt+' ');
    res = E.exec('read '+hide_cmd+' param && echo $param',
        {out: 'stdout', stdio: [0, 'pipe']});
    if (hide)
        process.stdout.write('\n');
    return string.chomp(res);
};

// prompt user for approval, using cli.get_input
E.ask_approval = function(prompt, opt){
    var res;
    opt = opt||{};
    opt.limit = opt.limit||/^(?:y|n|yes|no)$/i;
    if (E.opt.quiet)
        return true;
    while (!opt.limit.test(res))
    {
        if (!(res = E.get_input(prompt)) && opt.default_input)
        {
            res = opt.default_input;
            break;
        }
    }
    if (opt.return_ans)
        return res;
    return !/^n.*$/i.test(res);
};

E.ask_password = function(prompt){
    return readline.question(prompt, {hideEchoBack: true, mask: ''}); };
