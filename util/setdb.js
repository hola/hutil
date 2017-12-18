// LICENSE_CODE ZON
'use strict'; /*jslint browser:true, es6:true*/
define(['lodash', 'events'], (_, EventEmitter)=>{

const E = new EventEmitter();
E.state = {};

E.on = (path, fn)=>{
    EventEmitter.prototype.on.call(E, path, fn);
    setTimeout(()=>fn(E.get(path)), 0);
    return {path, fn};
};

E.once = (path, fn)=>{
    EventEmitter.prototype.once.call(E, path, fn);
    setTimeout(()=>fn(E.get(path)), 0);
    return {path, fn};
};

E.off = listener=>{
    EventEmitter.prototype.off.call(E, listener.path, listener.fn);
};

E.get = path=>_.get(E.state, path);

E.set = (path, val)=>{
    if (_.get(E.state, path)===val)
        return;
    _.set(E.state, path, val);
    E.emit_path(path);
};

E.push = (path, val)=>{
    let arr = _.get(E.state, path);
    if (arr===undefined)
        _.set(E.state, path, arr=[]);
    let l = arr.push(val);
    E.emit_path(path+'.'+(l-1));
};

E.emit_path = path=>{
    path = path.split('.');
    do {
        let p = path.join('.');
        E.emit(p, _.get(E.state, p));
        path.pop();
    } while (path.length);
};

return E;

});
