/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var app = require('express')(),
    server = require('http').Server(app),
    io = require('socket.io')(server),
    bluemix = require('./config/bluemix'),
    watson = require('watson-developer-cloud'),
    extend = require('util')._extend,
    twilio = require('twilio'),
    restler = require("restler"),
    _ = require("underscore"),
    Cloudant = require('cloudant'),
    async = require("async"),
    bodyParser = require('body-parser'),
    https = require('https'),
    AlchemyApi = require('alchemy-api'),
    dotenv = require("dotenv");

dotenv.load();

var vcapServices = {};

if (process.env.VCAP_SERVICES) {
    vcapServices = JSON.parse(process.env.VCAP_SERVICES);
}

var cloudant,
    db,
    cloudantUsername = vcapServices.cloudantNoSQLDB[0].credentials.username,
    cloudantPassword = vcapServices.cloudantNoSQLDB[0].credentials.password,
    dbName = "assistant-shop-r",
    watsonCredentials = {
        version:'v1',
        username: vcapServices.speech_to_text[0].credentials.username,
        password: vcapServices.speech_to_text[0].credentials.password
    },
    alchemyCredentials = _.findWhere(vcapServices["user-provided"], {name: "assistant-shop-r-alchemy"}),
    speechToText = watson.speech_to_text(watsonCredentials),
    alchemy = new AlchemyApi(alchemyCredentials.credentials.apikey);

app.use(bodyParser.json())

// Configure express
require('./config/express')(app, speechToText);

// Configure sockets
require('./config/socket')(io, speechToText);

app.get('/ntsToken/:name', function (request, response) {
    var url = "http://sat-token-generator.herokuapp.com/sat-token?AccountSid=" +
      process.env.TWILIO_ACCOUNT_SID + "&AuthToken=" +
      process.env.TWILIO_AUTH_TOKEN + "&EndpointName=" + request.params.name;

    restler.get(url).on('complete', function(data) {
      response.send(data);
    });
});

var agentStatus = "offline";

var feedbackScore = 20;

app.get("/agentStatus", function (request, response) {
    response.send({"status": agentStatus});
});

app.get("/agentStatus/:status", function (request, response) {
    agentStatus = request.params.status;
    response.sendStatus(204);
});

app.get('/agent', function (request, response) {
    db.view("purchases", "all", { sort: ["-date"] },function (error, result) {
        response.render('agent', {visits: result.rows, tagline: "Customer Feedback"});
    });
});

app.get("/api/v1/purchases/:id", function (request, response) {
    db.get(request.params.id ,function (error, result) {
        if (result) {
            response.send(result);
        }
        else {
            response.send({});
        }
    });
});

app.get('/', function( request, response) {
    db.view("purchases", "customer", { keys: ["David Colson"], sort: "-date" }, function (error, result) {
        response.render('index', {visits: result.rows, tagline: "My Purchases"});
    });
});

app.get("/tasks", function( request, response) {
    db.view("tasks", "all", function (error, result) {
        response.render("tasks", {tasks: result.rows, tagline: "Pending Tasks"});
    });
});

app.get("/api/v1/task", function (request, response) {
    var task = request.query;
    task.type = "task";
    async.waterfall([
        function (next) {
            db.view("purchases", "itemId", { keys: [task.productId]}, next);
        },
        function (result, headers, next) {
            if (result.rows.length > 0) {
                task.item = result.rows[0].value.item;
            }
            db.insert(task, next);
        }
    ], function (error) {
        if (error) {
            console.error(error);
            response.sendStatus(500);
        }
        else {
            response.sendStatus(204);
        }
    });
});

app.get("/api/v1/clear", function (request, response) {

    //TODO
    feedbackScore = 20;

    async.waterfall(
    [
        function (next) {
            db.view("purchases", "all", next);
        },
        function (result, headers, next) {
            var purchases = [];
            _.each(result.rows, function (row) {
                if (!row.value.preventDelete) {
                    delete row.value.transcript;
                    delete row.value.feedbackScore;
                    delete row.value.sentiment;
                    delete row.value.keywords;
                }
                purchases.push(row.value);
            });
            async.each(purchases, db.insert, next);
        },
        function (next) {
            db.view("tasks", "all", next);
        },
        function (result, headers, next) {
            var tasks = [];
            _.each(result.rows, function (row) {
                if (!row.value.preventDelete) {
                    row.value._deleted = true;
                    tasks.push(row.value);
                }
            });
            db.bulk({docs: tasks}, next);
        }
    ], function(error) {
        if (error) {
            console.error(error);
            response.sendStatus(500);
        }
        else {
            response.sendStatus(204);
        }
    });
});

app.post("/transcript/:id", function (request, response, callback) {
    var record;

    async.waterfall([
        function (next) {
            db.get(request.params.id, next);
        },
        function (result, headers, next) {
            record = result;
            record.transcript = request.body.transcript;
            analyzeTranscript(record.transcript, next);
        },
        function (result, next) {
            record.keywords = result.keywords;
            record.sentiment = result.sentiment;
            db.insert(record, next);
        },
        function (result, headers, next) {
            response.send(record);
            return next();
        }
    ], callback);
});

function seedDB(callback) {
    db = cloudant.use(dbName);

    var dbEntries = [
        {
            "type": "purchase",
            "customer": {
                "name": "David Colson",
                "email": "dcolson@gmail.com"
            },
            "item": {
                "id": "101",
                "name": "Light Blue Jeans",
                "image": "http://i00.i.aliimg.com/wsphoto/v0/882138636/Mens-capri-jeans-Light-blue-Skinny-Whisker-Abrade-Cotton-Korean-style-Casual-Drop-shipping-1-Piece.jpg",
                "price": "$75"
            }
        },
        {
            "type": "purchase",
            "customer": {
                "name": "David Colson",
                "email": "dcolson@gmail.com"
            },
            "item": {
                "id": "102",
                "name": "Polo Shirt",
                "image": "http://i00.i.aliimg.com/wsphoto/v0/359840214/Wholesale-Men-s-Polo-Shirts-Brand-Tshirt-T-Shirt-Tee-Shirt-Polo-Shirt-Fashion-Cotton-Polo.jpg",
                "price": "$50"
            }
        },
        {
            "type": "purchase",
            "customer": {
                "name": "Jeff Davis",
                "email": "jdavis@gmail.com"
            },
            "item": {
                "id": "101",
                "name": "Light Blue Jeans",
                "image": "http://i00.i.aliimg.com/wsphoto/v0/882138636/Mens-capri-jeans-Light-blue-Skinny-Whisker-Abrade-Cotton-Korean-style-Casual-Drop-shipping-1-Piece.jpg",
                "price": "$75"
            },
            "transcript": "I am really upset with these blue jeans that I bought from Macy's" +
                " in Hoboken the other day. The jeans were ripped on the inseam and there was dark" +
                " blue dye all along the buttocks region in the inside of the jeans. Is this normally" +
                " an issue with this item? Ok, but how do I get a refund for these jeans?",
            "keywords": [
                {
                  "text": "blue jeans"
                },
                {
                  "text": "dark blue dye"
                },
                {
                  "text": "department store"
                },
                {
                  "text": "New Jersey"
                },
                {
                  "text": "Hoboken"
                },
                {
                  "text": "item"
                },
                {
                  "text": "refund"
                },
            ],
            "sentiment": {"type": "negative"},
            "preventDelete": true
        },
        {
            "productId": "102",
            "reviewInvestment": "true",
            "user": "Brooke",
            "replyLink": "https://workflow.ng.bluemix.net:443/2b082f1f-9d77-4029-a9ca-32da43630adc/myworkflow/productsWorkflow/PI-1-c777010d-eb8b-45bc-acce-e4b4e41bbec1/decision",
            "type": "task",
            "preventDelete": true,
            "item": {
                "id": "102",
                "name": "Polo Shirt",
                "image": "http://i00.i.aliimg.com/wsphoto/v0/359840214/Wholesale-Men-s-Polo-Shirts-Brand-Tshirt-T-Shirt-Tee-Shirt-Polo-Shirt-Fashion-Cotton-Polo.jpg",
                "price": "$50"
            }
        },
        {
            "productId": "101",
            "name": "Light Blue Jeans",
            "image": "http://i00.i.aliimg.com/wsphoto/v0/882138636/Mens-capri-jeans-Light-blue-Skinny-Whisker-Abrade-Cotton-Korean-style-Casual-Drop-shipping-1-Piece.jpg",
            "price": "$75",
            "type": "item"
        },
        {
            "productId": "102",
            "name": "Polo Shirt",
            "image": "http://i00.i.aliimg.com/wsphoto/v0/359840214/Wholesale-Men-s-Polo-Shirts-Brand-Tshirt-T-Shirt-Tee-Shirt-Polo-Shirt-Fashion-Cotton-Polo.jpg",
            "price": "$50",
            "type": "item"
        }
    ];

    async.waterfall([
        function (next) {
            var designDocs = [
                {
                    _id: '_design/purchases',
                    views: {
                        all: {
                            map: function (doc) { if (doc.type === 'purchase') { emit(doc._id, doc); } }
                        },
                        item: {
                            map: function (doc) { if (doc.type === 'purchase') { emit(doc.item.name, doc); } }
                        },
                        itemId: {
                            map: function (doc) { if (doc.type === 'purchase') { emit(doc.item.id, doc); } }
                        },
                        customer: {
                            map: function (doc) { if (doc.type === 'purchase') { emit(doc.customer.name, doc); } }
                        },
                        transcripts: {
                            map: function (doc) { if (doc.type === 'purchase' && doc.transcript) { emit(doc.item.name, doc); } }
                        }
                    }
                },
                {
                    _id: '_design/tasks',
                    views: {
                        all: {
                            map: function (doc) { if (doc.type === 'task') { emit(doc._id, doc); } }
                        }
                    }
                },
           ];

            async.each(designDocs, db.insert, next);
        },
        function (next) {
            async.each(dbEntries, db.insert, next);
        },
        function (next) {
            console.log("Created DB", dbName, "and populated it with initial purchases");
            next();
        }
    ], callback)
}

var port = process.env.VCAP_APP_PORT || 3000;
server.listen(port, function() {
    var dbCreated = false;
    Cloudant({account:cloudantUsername, password:cloudantPassword}, function(er, dbInstance) {
        cloudant = dbInstance;
        if (er) {
            return console.log('Error connecting to Cloudant account %s: %s', me, er.message);
        }

        console.log('Connected to cloudant');
        cloudant.ping(function(er, reply) {
            if (er) {
                return console.log('Failed to ping Cloudant. Did the network just go down?');
            }

            console.log('Server version = %s', reply.version);
            console.log('I am %s and my roles are %j', reply.userCtx.name, reply.userCtx.roles);

            cloudant.db.list(function(er, all_dbs) {
                if (er) {
                    return console.log('Error listing databases: %s', er.message);
                }

                console.log('All my databases: %s', all_dbs.join(', '));

                _.each(all_dbs, function(name) {
                    if (name === dbName) {
                        dbCreated = true;
                    }
                });
                if (dbCreated === false) {
                    cloudant.db.create(dbName, seedDB);
                }
                else {
                    db = cloudant.db.use(dbName);
                    console.log("DB", dbName, "is already created");
                }
            });
        });
    });
});
console.log('listening at:', port);

function analyzeTranscripts() {

    async.waterfall([
        function (next) {
            db.view("visits", "all", next);
        },
        function (body, headers, next) {
            async.each(body.rows, analyzeTranscript, next);
        }

    ], function(error) {
        if (error) {
            console.log(error);
        }
        return;
    });

}

function analyzeTranscript(transcript, callback) {

    var response = {};

    async.waterfall([
        function (next) {
            console.log("Extracting keywords");
            alchemy.keywords(transcript, {}, next);
        },
        function (result, next) {
            //TODO match keyword to existing items
            console.log("keywords", result);
            console.log("Extracting sentiment");
            response.keywords = result.keywords;
            alchemy.sentiment(transcript, {}, next);
        },
        function (result, next) {
            console.log("sentiment", result);
            if (result.docSentiment.type === "neutral" || result.docSentiment.type  === "negative") {
                feedbackScore--;
            }
            else {
                feedbackScore++;
            }
            response.sentiment = result.docSentiment;

            console.log("The feedback score for", "101", "is", feedbackScore);

            var json = {
                "theProduct": {
                    "id": "101",
                    "feedbackScore": feedbackScore
                }
            };

            var options = {
                username: vcapServices.businessrules[0].credentials.user,
                password: vcapServices.businessrules[0].credentials.password
            };
            var url = vcapServices.businessrules[0].credentials.executionRestUrl + "/productsRuleApp/1.0/productsRuleProject/json";
            restler.postJson(url, json, options).on('complete', function(data) {
                console.log(data);
                if (data.theProduct.needsInvestmentReview === true || data.theProduct.needsDivestmentReview === true) {
                    var options = {
                        "username": vcapServices.Workflow[0].credentials.user,
                        "password": vcapServices.Workflow[0].credentials.password,
                    };

                    var reviewInvestment = "false";

                    if (data.theProduct.needsInvestmentReview === true) {
                        reviewInvestment = "true";
                    }

                    console.log("Product", json.theProduct.id, "needs reviewInvestment", reviewInvestment);

                    var url = vcapServices.Workflow[0].credentials.url.replace("/info") + "/myworkflow/productsWorkflow/_/start" +
                        "?productId=" + json.theProduct.id + "&feedbackScore=" + json.theProduct.feedbackScore + "&reviewInvestment=" + reviewInvestment;
                    restler.get(url, options).on('complete', function(data) {
                        console.log("finished calling the workflow service");
                        next(null, response);
                    });
                }
                else {
                    next(null, response);
                }
            });
        }
    ], callback);
}



