'use strict';
const fs = require('fs');
const path = require('path');

const source = '/Users/gilad/zon/pkg/util';
const target = path.join(__dirname, 'util');
fs.readdirSync(target).forEach(filename=>{
    if (filename.match(/config.js/))
        return;
    try{
    fs.createReadStream(path.join(source, filename)).pipe(fs.createWriteStream(path.join(target, filename)));
    }
    catch(e){ console.log(e); }
});
