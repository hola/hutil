// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true*/
require('./config.js');
// JS implementation of list.h:__LIST_XXX API
var E = exports;

// to improve performance, specific instances are created for specific
// f_next/f_prev field names, so all lookups are next/prev, instead
// of this.f_next/this.f_prev.
var types = {}; // cache of list types
E.list = function(opt){
    opt = opt||{};
    var next = opt.next || (opt.prefix && opt.prefix+'next') || 'next';
    var prev = opt.prev || (opt.prefix && opt.prefix+'prev') || 'prev';
    var type_name = next+' '+prev;
    var type;
    if (!(type = types[type_name]))
        type = types[type_name] = new_list_type(next, prev);
    return new type();
};

function new_list_type(next, prev){
    function List_type(){
        this.head = null;
        this.length = 0;
    }
    var proto = List_type.prototype;
    proto.f_next = next;
    proto.f_prev = prev;
    proto.next = function(elm){ return elm[next]; };
    proto.prev = function(elm){ return this.head!==elm ? elm[prev] : null; };
    proto.first = function(){ return this.head; };
    proto.last = function(){ return this.head ? this.head[prev] : null; };
    proto.in_list = function(elm){ return !!elm[prev]; };
    proto.init = function(elm){ elm[next] = elm[prev] = null; };
    proto.forEach = function(cb){
        var _next; // allow removal of current element inside cb
        for (var elm = this.head; elm; elm = _next)
        {
            _next = elm[next];
            cb(elm, this);
        }
    };
    proto.forEach_rev = function(cb){
        var _prev; // allow removal of current element inside cb
        for (var elm = this.last(); elm; elm = _prev)
        {
            _prev = this.prev(elm);
            cb(elm, this);
        }
    };
    proto.rm = function(elm){
        if (elm[prev]===null)
            return elm;
        if (elm[prev]===undefined) // initialize fields
        {
            elm[next] = elm[prev] = null;
            return elm;
        }
        if (elm===this.head)
            this.head = elm[next];
        else
            elm[prev][next] = elm[next];
        if (elm[next])
            elm[next][prev] = elm[prev];
        else if (this.head)
            this.head[prev] = elm[prev];
        elm[next] = elm[prev] = null;
        this.length--;
        return elm;
    };
    proto.add_after = function(elm, after){
        this.rm(elm);
        if (!after)
            return this.add_head(elm);
        elm[prev] = after;
        if (elm[next] = after[next])
            elm[next][prev] = elm;
        else
            this.head[prev] = elm;
        after[next] = elm;
        this.length++;
        return elm;
    };
    proto.add_before = function(elm, before){
        this.rm(elm);
        if (!before)
            return this.add_tail(elm);
        elm[prev] = before[prev];
        elm[next] = before;
        if (before===this.head)
            this.head = elm;
        else
            elm[prev][next] = elm;
        before[prev] = elm;
        this.length++;
        return elm;
    };
    proto.unshift = proto.add_head = function(elm){
        this.rm(elm);
        if (elm[next] = this.head)
        {
            elm[prev] = elm[next][prev];
            elm[next][prev] = elm;
        }
        else
            elm[prev] = elm;
        this.head = elm;
        this.length++;
        return elm;
    };
    proto.push = proto.add_tail = function(elm){
        this.rm(elm);
        if (this.head)
        {
            elm[prev] = this.head[prev];
            this.head[prev] = elm;
            elm[prev][next] = elm;
        }
        else
        {
            elm[prev] = elm;
            this.head = elm;
        }
        elm[next] = null;
        this.length++;
        return elm;
    };
    proto.shift = proto.rm_head = function(){
        return this.head ? this.rm(this.head) : null; };
    proto.pop = proto.rm_tail = function(){
        return this.head ? this.rm(this.head[prev]) : null; };
    proto.free = function(){
        var _next;
        for (var elm = this.head; elm; elm = _next)
        {
            _next = elm[next];
            elm[next] = elm[prev] = null;
        }
        this.head = null;
        this.length = 0;
    };
    return List_type;
}

