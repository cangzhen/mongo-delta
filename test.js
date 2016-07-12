
//define schema
var Schema = require('mongoose').Schema;
var CatSchema = new Schema({
    name: {type:String},
    updatedAt: {type: Date, default: Date.now}
}, {versionKey: false,timestamps: true});


//mongo-delta options
var opts = {
    src: 'mongodb://localhost:27017/test2',
    dest: 'mongodb://localhost:27017/test1',
    schemas : [
        {name: 'Cat', schema: CatSchema} //transition this schema from src to dest
    ]
}

var mongoose = require('mongoose');
function createInA(cb) {
    var dbA = mongoose.createConnection(opts.src);
    var CatA = dbA.model('Cat', CatSchema);
    new CatA({name: 'kitty'}).save(function (err, doc) {
        if (err) {
            cb(err);
        } else {
            console.log('============create in DB B============', doc);
            cb();
        }
    });
}


function findInB(cb) {
    var dbB = mongoose.createConnection(opts.dest);
    var CatB = dbB.model('Cat', CatSchema);
    CatB.find({name: 'kitty'}, function (err, docs) {
        if (err) {
            cb(err);
        } else {
            console.log('============find in DB B=========', docs);
            cb();
        }
    });
}

function transDataDelta(cb) {

    //start mongo-delta
    var MongoDelta = require('./mongo-delta');
    var delta = new MongoDelta(opts);
    delta.startOne(function(err){
        console.log('============sync data from A to B============');
        cb(err);
    });
}

var async = require('async');
async.series([createInA,
    transDataDelta,
    findInB,
],function end(err){
    if (err) {
        console.log('test encounter an error:', err);
    } else {
        console.log('test sucess');
    }
    process.exit();
})


