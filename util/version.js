// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, es6:false*/
require('./config.js');
var fs = require('fs');
var version;
var paths = ['.', __dirname, __dirname+'/../..', __dirname+'/../../..'];
if (process.browser)
    version = require('zon_config.js').ZON_VERSION;
else if (process.zon)
    version = process.zon.version;
else
{
    for (var i=0; i<paths.length; i++)
    {
        var path = paths[i]+'/version';
        try {
            version = fs.readFileSync(path, 'utf8');
            break;
        } catch(e){}
    }
}
version = version.trimRight();
exports.version = version;
