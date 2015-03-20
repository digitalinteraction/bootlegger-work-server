var uploaddir = "/upload/";
var ss3 = require('s3');
var path = require('path');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
var knox = require('knox');
var AWS = require('aws-sdk');
var os = require('os');
var config = require('./local.js');
AWS.config.region = config.S3_REGION;
var _ = require('lodash');
var async = require('async');
var MongoClient = require('mongodb').MongoClient

module.exports = function(winston)
{
    var connection = null;
    var thedb = null;
    var logger = null;
    function DoEditHandler()
    {
        
        this.type = 'edit';
        connection = 'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database;
      
      //console.log('mongodb://'+config.db_user+':'+config.db_password+'@'+config.db_host+':'+config.db_port+'/'+config.db_database);
        MongoClient.connect(connection, function(err, db) {
           // MongoClient.connect('mongodb://localhost/bootlegger', function(err, db) {
            if(err) throw err;
            thedb = db;
          });
    }

    DoEditHandler.prototype.work = function(edit, callback)
    {
        
        try
        {
            logger.info("Edit Started: "+edit.id + " / "+edit.shortlink);
            //console.log(edit);
        // for (var i = 0; i < keys.length; i++)
        //     console.log(keys[i]);
        //console.log(edit);

            //console.log(os.platform());
            if (os.platform()=="win32")
            {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            }
            else
            {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            }

            //download files from s3
            //console.log(edit.media);
            //join files
            var calls = [];
            var thenewpath = '';

            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

            //download
            _.each(edit.media,function(m){
                calls.push(function(cb){
                    var media = m;
                    //download from s3
                    var s3 = ss3.createClient({
                        s3Options: {
                          accessKeyId: config.AWS_ACCESS_KEY_ID,
                          secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                          region: config.S3_REGION
                        },
                      });

                      var params = {
                        localFile: path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')),
                        s3Params: {
                          Bucket: config.S3_BUCKET,
                          Key: "upload/"+media.path.replace(config.S3_CLOUD_URL,'')
                        },
                      };
                      //console.log(params);
                      var downloader = s3.downloadFile(params);

                      downloader.on('error', function(err) {
                        cb(true);
                      });
                      downloader.on('end', function() {             
                        cb();
                      });
                });
            });


            //-c:v libx264
            _.each(edit.media,function(m){
                calls.push(function(cb){
                    //return cb();
                    var media = m;
                    //download from s3
                    var ff = ffmpeg();
                    ff.input(path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')));
                    ff.fps(30.333)
                    ff.videoCodec('libx264').outputOptions('-preset slower');
                    // ff.preset('slower');
                    ff.size('1920x?').aspect('16:9');
                    ff.outputOptions('-g 2')
                    ff.keepDAR();

                    ff.on('start',function(command){
                        console.log("ffmpeg "+command);
                    });
                    ff.on('error', function(err, stdout, stderr) {
                        //console.log(stderr);
                        //console.log(stdout);
                        logger.error('An error occurred: ' + err.message);
                        cb(true);
                      })
                      .on('end', function() {
                        logger.info('Conversion finished !');
                        cb();
                      })
                      .save(path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')));
                });
            });


            //edit
            // calls.push(function(cb){
            //  //# this is a comment
            //  // file '/path/to/file1'
            //  // file '/path/to/file2'
            //  // file '/path/to/file3'
            //  var filelist = _.reduce(edit.media,function(all,m)
            //  {
            //      return all + "file " + m.path.replace(sails.config.S3_CLOUD_URL,'') + "\r\n";
            //  },"");
            //  //fs.writeFileSync(path.normalize(dir+"/" + edit.code + '.txt'),filelist);
            //  cb();
            // });

            calls.push(function(cb){
                //return cb();
                var ff = ffmpeg();
                _.each(edit.media,function(m)
                {
                    ff.mergeAdd(path.normalize(path.dirname(require.main.filename) + '/upload/' + m.path.replace(config.S3_CLOUD_URL,'')));
                });

                ff.on('start',function(command){
                    logger.info("ffmpeg "+command);
                });
                ff.on('error', function(err, stdout, stderr) {
                    //console.log(stderr);
                    //console.log(stdout);
                    logger.error('An error occurred: ' + err.message);
                    cb(true);
                  })
                  .on('end', function() {
                    logger.info('Merging finished !');
                    cb();
                  })
                  .mergeToFile(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.shortlink + '.mp4'), path.normalize(path.dirname(require.main.filename) + '/.tmp/'));
            });

            // calls.push(function(cb){

            //  var ff = ffmpeg();
            //  ff.addInput(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + '.mp4'));
            //  ff.addInput(path.normalize(path.dirname(require.main.filename)+'/assets/images/logo.png'));
            //  ff.complexFilter('overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2');
            //  ff.output(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + '.mp4'));

            //  ff.on('error', function(err) {
            //      console.log('An error occurred: ' + err.message);
            //    })
            //    .on('end', function() {
            //      console.log('Watermarking Finished!');
            //      cb();
            //    }).run();
                  
            // });


            //ff.addInput(path.normalize(path.dirname(require.main.filename)+'/assets/images/logo.png'));
            //ff.complexFilter('overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2');

            //upload to s3

            calls.push(function(cb){
                var knox_params = {
                    key: config.AWS_ACCESS_KEY_ID,
                    secret: config.AWS_SECRET_ACCESS_KEY,
                    bucket: config.S3_BUCKET
                  };
                  var client = knox.createClient(knox_params);
                  client.putFile(path.normalize(path.dirname(require.main.filename) + '/upload/' +edit.shortlink + ".mp4"), 'upload/' + edit.shortlink + ".mp4", {'x-amz-acl': 'public-read'},
                        function(err, result) {
                            //console.log(err);
                            if (err)
                            {
                                logger.error(err);
                                cb(true);
                            }
                            else
                            {
                                logger.info("Uploaded");
                                cb();
                            }
                  });

            });

            calls.push(function(cb){
                AWS.config.update({accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY});
                var elastictranscoder = new AWS.ElasticTranscoder();
                elastictranscoder.createJob({ 
                  PipelineId: config.ELASTIC_PIPELINE,
                  //InputKeyPrefix: '/upload',
                  OutputKeyPrefix: 'upload/', 
                  Input: { 
                    Key: 'upload/' + edit.shortlink + '.mp4', 
                    FrameRate: 'auto', 
                    Resolution: 'auto', 
                    AspectRatio: 'auto', 
                    Interlaced: 'auto', 
                    Container: 'auto' }, 
                  Output: { 
                    Key: edit.shortlink + '.mp4', 
                    //ThumbnailPattern: 'thumbs-{count}',
                    PresetId: '1351620000001-000020', // specifies the output video format
                    Rotate: 'auto',
                    Watermarks:[
                    {
                       "InputKey":"logos/logo.png",
                       "PresetWatermarkId":"BottomRight"
                    }]
                } 
                  }, function(error, data) { 
                    // handle callback 
                   
                    //console.log(data);
                    // console.log('transcode submitted');
                    if (error)
                    {
                        logger.error(error);
                        cb(true);
                    }
                    else
                    {
                        logger.info("Transcode submitted");
                        cb();
                    }
                });

            });

            //console.log(calls);

            async.series(calls,function(err){
                if (err)
                {
                    logger.error("editing failed");
                    //edit.shortlink = edit.code;
                    edit.failed = true;
                    //delete edit.code;
                    logger.error("Editing Failed");
                    //update edit record
                    var collection = thedb.collection('edit');                   
                    collection.update({_id:edit.id}, {$set:{path:edit.path}}, {w:1}, function(err, result) {
                        //done update...
                        callback('bury');
                    });

                    // edit.save(function(err,done)
                    // {
                        
                    // });
                }
                else
                {
                    logger.info("Editing Done");
                    edit.path = edit.shortlink + '.mp4';
                    //edit.shortlink = edit.code;
                    //delete edit.code;
                    //update edit record

                    var collection = thedb.collection('edit');       
                   collection.update({_id:edit.id}, {$set:{path:edit.path}}, {w:1}, function(err, result) {
                        //done update...
                        callback('success');
                    });
                }
                //Edits.update({edit.id},{path:thenewpath}
            });
        }
        catch (e)
        {
            logger.error(e);
            callback('bury');
        }
    }

    var handler = new DoEditHandler();
    logger = winston;
    logger.info("Starting Edit Handler");
    return handler;
};