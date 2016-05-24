// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
const array = require('./array.js');
const crypto = require('crypto');
const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');
const E = exports;
// file.xxx_e() throw exceptions. file.xxx() return null/false on fail.
E.errno = 0; // an integer/string error code
// XXX sergey: please implement
E.error = null; // an Error() object
E.read_buf_size = 8192;
E.is_win = /^win/.test(process.platform);
E.is_darwin = /^darwin/.test(process.platform);

let check_file = (dst, opt)=>{
    opt = opt||{};
    if (opt.rm_rf)
        E.rm_rf(dst);
    if (opt.mkdirp)
        E.mkdirp_file_e(dst);
    if (opt.unlink)
        E.unlink(dst);
};

E.read_e = (filename, opt)=>{
    if (opt===undefined)
        opt = 'utf8';
    return fs.readFileSync(filename, opt);
};
E.fread_cb_e = (fd, offset, length, pos, cb)=>{
    let res, buf = new Buffer(E.read_buf_size);
    while (res = fs.readSync(fd, buf, offset, length, pos))
    {
        if (cb(buf, res, pos))
            return true;
        pos += res;
    }
    return true;
};
E.read_cb_e = (filename, offset, length, pos, cb)=>{
    let fd = fs.openSync(filename, 'r');
    try { return E.fread_cb_e(fd, offset, length, pos, cb); }
    finally { fs.closeSync(fd); }
};
let bytes2str = (bytes, encoding)=>{
    let ret = new Buffer(bytes).toString(encoding||'utf8');
    // strip \r symbols on non-unix endlines
    if (ret[ret.length-1]=='\r')
        return ret.substr(0, ret.length-1);
    return ret;
};
let gen_read_line_cb = (bytes, cb, opt)=>(buf, read)=>{
    opt = opt||{};
    let nl = '\n'.charCodeAt(), idx, last_idx = 0;
    let size = read ? Math.min(buf.length, read) : buf.length;
    for (idx=0; idx<size; idx++)
    {
        if (buf[idx]==nl)
        {
            bytes.push.apply(bytes, buf.slice(last_idx, idx));
            let line = bytes2str(bytes, opt.encoding);
            bytes.length = 0;
            if (cb && cb(line))
                return true;
            last_idx = idx+1;
        }
    }
    bytes.push.apply(bytes, buf.slice(last_idx, idx));
    return opt.buf_size && size<opt.buf_size;
};
E.read_line_cb_e = (filename, cb, opt)=>{
    opt = opt||{};
    opt.buf_size = opt.buf_size||E.read_buf_size;
    // collect bytes in array first, and later translate to utf8 to avoid
    // bugs in multi-byte utf8 chars at block boundry
    let bytes = [];
    E.read_cb_e(filename, 0, E.read_buf_size, 0,
        gen_read_line_cb(bytes, cb, opt));
    if (bytes.length)
        cb(bytes2str(bytes));
    return true;
};
E.read_line_e = filename=>{
    let ret;
    E.read_line_cb_e(filename, line=>(ret = line, true));
    return ret;
};
E.read_lines_e = filename=>{
    let ret = E.read_e(filename).split(/\r?\n/);
    if (ret[ret.length-1]==='')
        ret.pop();
    return ret;
};
E.fread_e = (fd, start, size)=>{
    let buf, count = 0, ret = '';
    start = start||0;
    buf = new Buffer(E.read_buf_size);
    E.fread_cb_e(fd, 0, E.read_buf_size, start, (buf, read)=>{
        count += read;
        let len = size && size<=count ? Math.min(read, size) : read;
        ret += buf.slice(0, len);
        if (size && count<=0)
            return true;
    });
    return ret;
};
E.write_e = (file, data, opt)=>{
    opt = opt||{};
    check_file(file, opt);
    fs.writeFileSync(file, data, opt);
    return true;
};
E.write_atomic_e = (file, data, opt)=>{
    opt = opt||{};
    check_file(file, opt);
    let tmpfile = file+'.'+(1000000*Math.random()|0);
    try {
        fs.writeFileSync(tmpfile, data, opt);
        fs.renameSync(tmpfile, file);
    } finally {
        E.unlink(tmpfile);
    }
    return true;
};
E.write_lines_e = (file, data, opt)=>{
    data = Array.isArray(data) ?
        (data.length ? data.join('\n')+'\n' : '') : ''+data+'\n';
    return E.write_e(file, data, opt);
};
E.append_e = (file, data, opt)=>{
    opt = opt||{};
    check_file(file, opt);
    fs.appendFileSync(file, data, opt);
    return true;
};
E.head_e = (file, size)=>{
    if (size<0)
        size = 0;
    let fd = fs.openSync(file, 'r');
    try { return E.fread_e(fd, 0, size); }
    finally { fs.closeSync(fd); }
};
E.tail_e = (file, count)=>{
    let fd, start;
    count = count||E.read_buf_size;
    start = E.size_e(file)-count;
    if (start<0)
        start = 0;
    fd = fs.openSync(file, 'r');
    try { return E.fread_e(fd, start); }
    finally { fs.closeSync(fd); }
};
E.size_e = file=>fs.statSync(file).size;
E.mtime_e = file=>+fs.statSync(file).mtime;
function mkdirp(p, mode){
    if (mode===undefined)
        mode = 0o777 & ~(process.umask&&process.umask());
    if (typeof mode==='string')
        mode = parseInt(mode, 8);
    let made = null;
    p = path.resolve(p);
    let paths = [];
    while (p && !E.exists(p))
    {
        paths.unshift(p);
        p = path.dirname(p);
    }
    for (let i=0; i<paths.length; i++)
    {
        fs.mkdirSync(paths[i], mode);
        made = made||paths[i];
    }
    return made||p;
}
E.mkdirp_e = (p, mode)=>{
    if (mode===undefined || !process.umask)
        return mkdirp(p);
    let oldmask = process.umask(0);
    try { return mkdirp(p, mode); }
    finally { process.umask(oldmask); }
};
E.mkdirp_file_e = (file, mode)=>{
    E.mkdirp_e(path.dirname(file), mode);
    return file;
};
E.rm_rf_e = rimraf.sync;
E.unlink_e = path=>{
    fs.unlinkSync(path);
    return true;
};
E.rmdir_e = dir=>fs.rmdirSync(dir);
E.touch_e = path=>{
    let tm = Date.now()/1000;
    let h = fs.openSync(path, 'a');
    fs.futimesSync(h, tm, tm);
    fs.closeSync(h);
    return true;
};
E.readdir_e = dir=>fs.readdirSync(dir);
function get_owner(stat, opt){
    let has_uid = 'user' in opt, has_gid = 'group' in opt;
    if (!has_uid&&!has_gid&&!opt.preserve)
        return;
    return {
        user: has_uid ? opt.user :
            opt.preserve||E.is_win ? stat.uid : process.getuid(),
        group: has_gid ? opt.group :
            opt.preserve||E.is_win ? stat.gid : process.getgid(),
    };
}
function copy_file(src, dst, opt){
    var fdw, stat, mode;
    opt = opt||{};
    stat = fs.statSync(src);
    if (E.is_dir(dst)||dst[dst.length-1]=='/')
        dst = dst+'/'+path.basename(src);
    check_file(dst, opt);
    mode = 'mode' in opt ? opt.mode : stat.mode & 0o777;
    fdw = fs.openSync(dst, 'w', mode);
    try {
        E.read_cb_e(src, 0, E.read_buf_size, 0, (buf, read)=>{
            fs.writeSync(fdw, buf, 0, read); });
        let owner = get_owner(stat, opt);
        if (owner)
            fs.fchownSync(fdw, owner.user, owner.group);
        // Does it really needed?
        if (opt.preserve_ts)
            fs.futimesSync(fdw, stat.atime, stat.mtime);
    } finally { fs.closeSync(fdw); }
    return true;
}
function copy_dir(src, dst, opt){
    let files = E.readdir_e(src);
    for (let f=0; f<files.length; f++)
    {
        if (!E.copy_e(src+'/'+files[f], dst+'/'+files[f], opt))
            return false;
    }
    return true;
}
E.copy_e = (src, dst, opt)=>{
    src = E.normalize(src);
    dst = E.normalize(dst);
    return (E.is_dir(src) ? copy_dir : copy_file)(src, dst, opt);
};
E.readlink_e = src=>fs.readlinkSync(src);
E.link_e = (src, dst, opt)=>{
    opt = opt||{};
    src = E.normalize(src);
    dst = E.normalize(dst);
    check_file(dst, opt);
    try { fs.linkSync(src, dst); }
    catch(e){
        if (opt.no_copy)
            throw e;
        return E.copy_e(src, dst, opt);
    }
    return true;
};
E.link_r_e = (src, dst, opt)=>{
    opt = opt||{};
    src = E.normalize(src);
    dst = E.normalize(dst);
    E.mkdirp_file(dst);
    if (!opt.follow_symlinks && E.is_symlink(src))
        return E.symlink_e(src, dst, opt);
    if (!E.is_dir(src))
        return E.link_e(src, dst, opt);
    E.readdir_e(src).forEach(f=>{
        if (!opt.exclude || !opt.exclude.test(f))
            E.link_r_e(src+'/'+f, dst+'/'+f, opt);
    });
    return true;
};
E.symlink_e = (src, dst, opt)=>{
    opt = opt||{};
    if (E.is_win && !opt.force)
        return E.link_e(src, dst, opt);
    src = E.normalize(src);
    dst = E.normalize(dst);
    check_file(dst, opt);
    let target = src;
    if (!opt.keep_relative)
        target = fs.realpathSync(src);
    else if (E.is_symlink(src))
        target = E.readlink_e(src);
    fs.symlinkSync(target, dst);
    return true;
};
E.hashsum_e = (filename, type)=>{
    let hash = crypto.createHash(type||'md5');
    E.read_cb_e(filename, 0, E.read_buf_size, 0, (buf, read)=>{
        hash.update(buf.slice(0, read)); });
    return hash.digest('hex');
};
let hash_re = /([0-9a-fA-F]+) [ |*](.*)/;
E.hashsum_check_e = (type, filename)=>{
    let data = E.read_lines_e(filename);
    let base = path.dirname(filename);
    for (let i=0; i<data.length; i++)
    {
        let match = hash_re.exec(data[i]);
        if (!match)
            throw new Error('Incorrect line found: '+data[i]);
        let source = E.absolutize(match[2], base);
        let hash = E.hashsum_e(source, type);
        if (hash!=match[1])
            throw new Error('Hash mismatch '+source+': '+hash+' != '+match[1]);
    }
    return true;
};

// Safe methods
function errno_wrapper(func, ret){
    let args = array.slice(arguments, 2);
    E.errno = 0;
    E.error = null;
    try { return func.apply(null, args); }
    catch(err){
        E.errno = err.code||err;
        E.error = err;
        return ret;
    }
}
E.find_e = (dir, opt)=>{
    opt = opt||{};
    let ret = [];
    let exclude = opt.exclude, match = opt.match, strip = opt.strip;
    E.readdir_e(dir).forEach(f=>{
        let name = E.normalize(dir+'/'+f);
        let stripped = strip ? name.replace(strip, '') : name;
        if (exclude && exclude.test(stripped))
            return;
        if (E.is_dir(name))
        {
            if (opt.dirs)
                ret.push(stripped);
            if (!opt.follow_symlinks && E.is_symlink(name))
                return;
            ret.push.apply(ret, E.find(name, opt));
        }
        else
            ret.push(stripped);
    });
    if (match)
        ret = ret.filter(f=>match.test(f));
    return ret;
};
E.realpath_e = path=>fs.realpathSync(path);
E.stat_e = path=>fs.statSync(path);
E.lstat_e = path=>fs.lstatSync(path);
let err_retval = {
    read: null, read_line: null, read_lines: null, fread: null, find: null,
    tail: null, head: null, size: null, mkdirp: null, mkdirp_file: null,
    hashsum: null, stat: null, lstat: null, realpath: null, readlink: null,
    hashsum_check: false, fread_cb: false, read_cb: false, read_line_cb: false,
    write: false, write_lines: false, append: false, unlink: false,
    rmdir: undefined, rm_rf: false, touch: false, readdir: [], copy: false,
    link: false, link_r: false, symlink: false, mtime: -1,
};
Object.keys(err_retval).forEach(method=>
    E[method] = errno_wrapper.bind(null, E[method+'_e'], err_retval[method]));

E.exists = path=>{
    try { fs.accessSync(path); }
    catch(e){ return false; }
    return true;
};
E.is_file = path=>{
    let stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isFile();
};
E.is_dir = path=>{
    let stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isDirectory();
};
E.is_symlink = path=>{
    let stat;
    try { stat = fs.lstatSync(path); }
    catch(e){ return false; }
    return stat.isSymbolicLink();
};
E.is_chardev = path=>{
    let stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isCharacterDevice();
};
E.is_socket = path=>{
    let stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isSocket();
};
E.is_exec = path=>{
    try { fs.accessSync(path, fs.X_OK); }
    catch(e){ return false; }
    return true;
};
function is_binary(filename){
    filename = E.normalize(filename);
    if (!E.is_file(filename))
        throw new Error('Not a file');
    let fd = fs.openSync(filename, 'r');
    let buf = new Buffer(E.read_buf_size);
    let size = fs.readSync(fd, buf, 0, E.read_buf_size, 0);
    if (!size)
        throw new Error('Empty file');
    // UTF-8 BOM
    if (size >= 3 && buf[0]==0xEF && buf[1]==0xBB && buf[2]==0xBF)
        return false;
    let bytes = 0;
    for (let i=0; i<size; i++)
    {
        if (!buf[i])
            return true;
        if ((buf[i]<7 || buf[i]>14) && (buf[i]<32 || buf[i]>127))
        {
            // UTF-8 detection
            if (buf[i]>193 && buf[i]<224 && i+1<size)
            {
                i++;
                if (buf[i]>127 && buf[i]<192)
                    continue;
            }
            else if (buf[i]>223 && buf[i]<240 && i+2<size)
            {
                i++;
                if (buf[i]>127 && buf[i]<192 && buf[i+1]>127 && buf[i+1]<192)
                {
                    i++;
                    continue;
                }
            }
            bytes++;
            // Read at least 32 bytes before making a decision
            if (i>32 && bytes*100/size > 10)
                return true;
        }
    }
    return bytes*100/size > 10;
}
E.is_binary = filename=>{
    try { return is_binary(filename); }
    catch(e){ return false; }
};
E.which = bin=>{
    bin = E.normalize(bin);
    if (E.is_absolute(bin)&&E.is_exec(bin))
        return bin;
    let paths = process.env.PATH.split(E.is_win ? ';' : ':');
    for (let i=0; i<paths.length; i++)
    {
        let filename = E.normalize(`${paths[i]}/${bin}`);
        // In cygwin .exe extensions is omitting
        if (E.is_win&&!E.exists(filename)&&E.exists(filename+'.exe'))
            filename += '.exe';
        if (E.exists(filename)&&E.is_exec(filename))
            return filename;
    }
};
let watch_files = {};
E.file_changed = (file_path, scope)=>{
    scope = scope||'';
    let mtime = E.mtime(file_path);
    watch_files[scope] = watch_files[scope]||{};
    if (watch_files[scope][file_path]===mtime)
	return false;
    watch_files[scope][file_path] = mtime;
    return true;
};

if (E.is_win)
{
    E.cygwin_root = E.is_dir('C:/cygwin') ? 'C:/cygwin' :
	E.is_dir('D:/cygwin') ? 'D:/cygwin' : null;
}
E.cyg2unix = path=>{
    if (!E.is_win)
	return path;
    // /cygdrive/X/yyy --> X:/yyy
    path = path.replace(/^\/cygdrive\/(.)(\/(.*))?$/, '$1:/$3');
    // /usr/lib --> c:/cygwin/lib
    path = path.replace(/^\/usr\/lib(\/.*)?$/, E.cygwin_root.toLowerCase()+
        '/lib$1');
    // /usr/bin --> c:/cygwin/bin
    path = path.replace(/^\/usr\/bin(\/.*)?$/, E.cygwin_root.toLowerCase()+
        '/bin$1');
    // /xxx --> c:/cygwin/xxx
    path = path.replace(/^\//, E.cygwin_root.toLowerCase()+'/');
    return path;
};
E.unix2cyg = path=>{
    if (!E.is_win)
	return path;
    // c:/cygwin/lib -> /usr/lib
    path = path.replace(new RegExp('^'+E.cygwin_root.toLowerCase()+'/lib(.*)'),
        '/usr/lib$1');
    // c:/cygwin/bin -> /usr/bin
    path = path.replace(new RegExp('^'+E.cygwin_root.toLowerCase()+'/bin(.*)'),
        '/usr/bin$1');
    // c:/cygwin/xxx -> /xxx
    path = path.replace(new RegExp('^'+E.cygwin_root.toLowerCase()+'/(.*)'),
        '/$1');
    return path;
};
E.unix2win = path=>{
    if (!E.is_win)
	return path;
    // c:/xxx -> C:/xxx
    path = path.replace(/^[cd]:/, s=>s.toUpperCase());
    // C:/xxx/yyy -> C:\xxx\yyy
    path = path.replace(/\//g, '\\');
    return path;
};
E.win2unix = (path, force)=>{
    if (!force && !E.is_win)
        return path;
    // C:\xxx\yyy --> C:/xxx/yyy
    path = path.replace(/\\/g, '/');
    // C:/ --> c:/
    path = path.replace(/^[cd]:/i, s=>s.toLowerCase());
    return path;
};
E.win2cyg = path=>{
    if (!E.is_win)
	return path;
    path = E.win2unix(path);
    let escaped_root = E.cygwin_root.replace(/([\?\\\/\[\]+*])/g, '\\$1');
    path = path.replace(new RegExp('^'+escaped_root+'/?', 'i'), '/');
    path = path.replace(/^[cd]:/i, s=>'/cygdrive/'+s[0].toLowerCase());
    return path;
};
E.is_absolute = path=>/^(\/|([cd]:))/i.test(path);
E.absolutize = (p, d1, d2)=>{
    if (!p||E.is_absolute(p))
        return p;
    if (d2&&E.exists(d2+'/'+p))
        return d2+'/'+p;
    return d1+'/'+p;
};
E.normalize = p=>E.cyg2unix(E.win2unix(path.normalize(p)));
E.is_subdir = (root, sub)=>{
    let nroot = root.length;
    return !root || (sub.startsWith(root) && (root[nroot-1]=='/' ||
        sub[nroot]===undefined || sub[nroot]=='/'));
};
