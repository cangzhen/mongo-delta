//migrate accounts/balanceSheet/resource  from buzDB to mlDB
"use strict";
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var async = require('async');
var _ = require('lodash');
var moment = require('moment');
module.exports = mongoDelta;
function mongoDelta(opts) {
    this._id = opts._id || 'mongodelta';
    if(!(opts.src&&typeof  opts.src === 'string')){
        throw new Error('opts.src must be string!');
    }
    if(!(opts.dest&&typeof  opts.dest === 'string')){
        throw new Error('opts.dest must be string!');
    }
    this.src = opts.src;
    this.dest = opts.dest;
    this.step = opts.step || 3600*12;//default is 12 hours
    this.interval = opts.interval || 300;//default is 5 minutes
    this.latency = 0;//default is 10 seconds
    this.migrateSyle = opts.migrateSyle || 'pull';

    if (opts.startTime) {
        this.startTime = opts.startTime;
    } else {
        var lastMigrateAt = new Date();
        lastMigrateAt.setTime(lastMigrateAt.getTime() - 10 * 86400 * 1000);
        this.startTime = lastMigrateAt;
    }


    this.srcDB = mongoose.createConnection(this.src);
    this.destDB = mongoose.createConnection(this.dest);
    var MigrateTimeSchema = new Schema({
        _id: String,
        lastMigrateAt: {type: Date},            // 记录最后更新时间
        latency: {type: Number, default: this.latency},                       // 更新延迟，单位秒
        step: {type: Number, default: this.step}                          //更新步长，单位秒
    }, {versionKey: false});
    var selfDB;

    if (this.migrateSyle == 'pull') {
        selfDB = this.destDB;
    } else {
        selfDB = this.srcDB;
    }
    var schemaName = '_MigrateTime';
    this.MigrateTime = selfDB.model(schemaName, MigrateTimeSchema, schemaName);

    opts.schemas.forEach(function (task) {
        task.destModel = this.destDB.model(task.name, task.schema);
        task.srcModel = this.srcDB.model(task.name, task.schema);
        task.timeField = task.timeField || 'updatedAt';
        task.uFileds = task.uFileds ? task.uFileds.split(/ +/) : [];
        //task.query = one.query;
        //task.fields = one.fields;
        if (!task.hasOwnProperty('update'))task.update = true;
        if (!task.hasOwnProperty('insert'))task.insert = true;
    }.bind(this));
    this.tasks = opts.schemas;

    if(!(opts.src&&typeof  opts.src === 'string')){
        throw new Error('opts.src must be string!');
    }
    if(!(opts.dest&&typeof  opts.dest === 'string')){
        throw new Error('opts.dest must be string!');
    }
    if(opts.schemas.length === 0){
        throw new Error('opts.schemas must has one');
    }
}

mongoDelta.prototype = {
    getMigrateTime: function (cb) {
        var self = this;
        self.MigrateTime.findOne({_id: this._id}, function (err, doc) {
            if (err) return cb(err);
            if (doc) return cb(null, doc);

            //if not exist,create new one
            var initObj = {
                _id: self._id,
                lastMigrateAt: self.startTime,
                step: self.step,
                latency: self.latency,
            }
            new self.MigrateTime(initObj).save(function (err, doc) {
                if (err) throw new Error('save encounter an error!', err);
                else cb(null, doc);
            })
        });
    },
    startLoop: function () {
        var self = this;
        self.migrate(function (err, isIdle) {
            var sleepTime = 1;
            if (err) {
                sleepTime = 10 * 1000;
                console.warn('migrate encounter an err %j sleep %d second', err, sleepTime / 1000);

            }
            if (isIdle) {
                console.log('migrate idle sleep %d second', self.interval);
                sleepTime = self.interval * 1000;
                setTimeout(self.startLoop.bind(self), sleepTime);
            } else {
                setImmediate(self.startLoop.bind(self));
                return;
            }
        })
    },
    startOne: function (cb) {
        var self = this;
        if(cb)self.endCb = cb;
        self.migrate(function (err, isIdle) {
            var sleepTime = 1;
            if (err) {
                sleepTime = 10 * 1000;
                console.warn('migrate encounter an err %j sleep %d second', err, sleepTime / 1000);

            }
            if (isIdle) {
                if(self.endCb){
                    self.endCb();
                }else{
                    console.log("exited!");
                    process.exit();
                }
            } else {
                setImmediate(self.startOne.bind(self));
                return;
            }
        })
    },
    migrate: function (cb) {
        var self = this;
        self.getMigrateTime(function (err, migrateTime) {
            var startTime = migrateTime.lastMigrateAt;
            startTime.setTime(startTime.getTime()-10*1000);//多扫描10秒
            var endTime = new Date();
            endTime.setTime(startTime.getTime() + migrateTime.step * 1000);
            var now = new Date();
            var isIdle = false;
            if (endTime.getTime() > (now.getTime() - migrateTime.latency * 1000)) {
                isIdle = true;
                endTime.setTime(now.getTime() - migrateTime.latency * 1000);
            }
            console.log("[%s][%s]Detection data changes...",
                moment(startTime).format('YY-MM-DD HH:mm:ss'), moment(endTime).format('YY-MM-DD HH:mm:ss'));
            async.eachSeries(self.tasks, function (task, callback) {
                self.migrateOneCollection(task, startTime, endTime, callback);
            }, function end(err) {
                if (err) {
                    return cb(err);
                } else
                    self.updateMigrateTime(endTime, function (err) {
                        cb(err, isIdle);
                    });
            });
        })
    },
    migrateOneCollection: function (task, startTime, endTime, cb) {
        var srcModel = task.srcModel;
        var destModel = task.destModel;
        var type = srcModel.modelName;
        var query = task.query || {};
        query[task.timeField] = {$gte: startTime, $lt: endTime};
        srcModel.find(query, '_id', function (err, docs) {
            if (docs.length === 0)return cb();
            var updateN = 0, saveN = 0;
            async.eachLimit(docs, 20, function (doc, docCb) {
                srcModel.findOne({_id: doc._id}, task.fields, function (err, srdDoc) {
                    if (err || !srdDoc)return docCb(err || type + " " + doc._id + " not exist!");
                    var srcData = srdDoc.toObject();
                    destModel.findOne({_id: srcData._id}, task.fields, function (err, destDoc) {
                        if (err) {
                            return docCb(err);
                        }

                        //不存在且可以插入
                        if (!destDoc) {
                            if (!task.insert)return docCb();
                            return destModel.collection.save(srcData, function (err) {
                                if (err && /duplicate/.test(err.errmsg)) {
                                    //如果重复,解析重复的key;
                                    //E11000 duplicate key error index: jfjun_ml_dev.balancesheets.$account_1_issue_1 dup key: { : ObjectId('577cd4c4124e00ae7f9ab1a7'), : "2016-05" }
                                    var values = err.errmsg.match(/\{.*\}/)[0].match(/'([^']+)'|"([^"]+)"/g);
                                    var keys = [];

                                    // read the definition of index in the schema
                                    for (var i in  task.schema._indexes) {
                                        keys = Object.keys(task.schema._indexes[i][0]);
                                        if (task.schema._indexes[i][1].unique && keys.length == values.length) {
                                            break;
                                        } else {
                                            keys = [];
                                        }
                                    }
                                    if (keys.length === 0) {
                                        console.log("find  duplicate record，but not find unique index definition,", condition);
                                        return docCb(err);
                                    }
                                    var condition = {};
                                    for (var i = 0; i < keys.length; i++) {
                                        condition[keys[i]] = values[i].replace(/'|"/g, "");
                                    }
                                    destModel.remove(condition, function (err) {
                                        if (err) return docCb(err);
                                        console.log("remove dupliate record success,", condition);
                                        destModel.collection.save(srcData, function (err) {
                                            saveN++;
                                            return docCb(err);
                                        });
                                    });
                                } else {
                                    saveN++;
                                    return docCb(err);
                                }
                            });
                        }
                        if (!task.update)return docCb();

                        //更新操作
                        var destData = destDoc.toObject();
                        delete srcData._id;
                        var update;
                        if (task.uFileds.length > 0) {
                            update = {};
                            for (var i in task.uFileds) {
                                if (srcData.hasOwnProperty(task.uFileds[i]))
                                    update[task.uFileds[i]] = srcData[task.uFileds[i]];
                            }
                        } else {
                            update = srcData;
                        }
                        //compare update and exist;
                        var keys = Object.keys(update);
                        for (var i in keys) {
                            var key = keys[i];
                            if (_.isEqual(update[key], destData[key]))
                                delete update[key];
                        }
                        if (Object.keys(update).length === 0)return docCb();

                        destModel.collection.update({_id: destDoc._id}, {$set: update}, function (err) {
                            updateN++;
                            docCb(err);
                        });
                    });//end destModel.findOne
                });//end srcModel.findOne
            }, function (err) {
                console.log("[%s][%s]%s changed %d insert %d update %d",
                    moment(startTime).format('YY-MM-DD HH:mm:ss'), moment(endTime).format('YY-MM-DD HH:mm:ss'),
                    type, docs.length, saveN, updateN);
                cb(err);
            });//end async.eachLimit
        });//end srcModel.find
    },
    updateMigrateTime: function (endTime, cb) {
        this.MigrateTime.update({_id: this._id}, {$set: {lastMigrateAt: endTime}}, {upsert: true}, function (err) {
            if (cb)return cb(err);
        });
    },
    reset: function (cb) {
        this.MigrateTime.remove({_id: this._id}, function (err) {
            if (cb)return cb(err);
        });
    }
}
