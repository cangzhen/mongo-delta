


#`mongo-delta`: Delta Update data between two mongodb

[![Build Status](https://api.travis-ci.org/cangzhen/mongo-delta.svg?branch=master)](https://travis-ci.org/cangzhen/mongo-delta)
[![NPM version](https://badge.fury.io/js/mongo-delta.svg)](https://www.npmjs.com/package/mongo-delta)

`mongo-delta` 增量同步两个mongodb的数据


##Installing

```
npm install mongo-delta
```

##Usage

```javascript

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

//start mongo-delta
var MongoDelta = require('./mongo-delta');
var delta = new MongoDelta(opts);
delta.startOne(function(err){
    console.log('============sync data from A to B============');
    cb(err);
});


```

##Opts

- src 源数据库的url
- dest 目标数据库的url
- step 每次比较数据的时间片段长度，单位秒,默认是3600*12
- schemas 定义的schema，是个数组
    - name shema的名称
    - schema shema的定义
    - timeField 时间字段名称，默认是updatedAt
    - uFileds 需要更新的字段，如果不定义，默认是所有字段都更新
    

## License

(The MIT License)

Copyright (c) by Tolga Tezel <tolgatezel11@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
