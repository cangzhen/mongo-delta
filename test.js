var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var async = require('async');
var A =  'mongodb://localhost:27017/test';
var B = 'mongodb://localhost:27017/test1';

var CatSchema = new Schema({
    name: {type:String},
    money: Number,
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now}
}, {versionKey: false,timestamps: true});





function createInA(cb) {
    var dbA = mongoose.createConnection(A);
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
    var dbB = mongoose.createConnection(B);
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
    var opts = {
        src: A,
        dest: B,
        step:86400,//每次循环查询的时间片
    }
    opts.schemas = [
        {name: 'Cat', schema: CatSchema}
    ]
    var MongoDelta = require('./mongo-delta');
    var delta = new MongoDelta(opts);
    delta.startOne(function(err){
        console.log('============sync data from A to B============');
        cb(err);
    });
}


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

