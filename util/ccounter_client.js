// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define;
var is_node = typeof module=='object' && module.exports && module.children;
if (!is_node)
    define = self.define;
else
    define = require('./require_node.js').define(module, '../');
define(['underscore'], function(_){
var E = {};

E.update_affiliate = function(events, new_events){
    events = events||[];
    if (!new_events)
        return events;
    var no_new_events = events.length>=5;
    function merge_event(new_event){
        if (!new_event||!new_event.event)
            return;
        new_event.last = +new_event.last||Date.now();
        new_event.first = +new_event.first||new_event.last;
        new_event.count = new_event.count||1;
        for (var i=0; i<events.length; i+=1)
        {
            if (events[i].event==new_event.event)
                break;
        }
        if (i>=events.length)
        {
            if (!no_new_events)
                events.push(new_event);
            return;
        }
        var existing_event = events[i];
        var need_update_first = !existing_event.first||
            existing_event.first>new_event.first;
        var need_update_last = !existing_event.last||
            existing_event.last<new_event.last;
        if (need_update_first||need_update_last)
            existing_event.count = (existing_event.count||0)+new_event.count;
        if (need_update_first)
            existing_event.first = new_event.first;
        if (need_update_last)
            existing_event.last = new_event.last;
    }
    _.each(new_events, merge_event);
    return events;
};

return E; }); }());
