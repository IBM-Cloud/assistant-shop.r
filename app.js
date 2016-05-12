/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
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

var express = require('express'),
  app = express(),
  http = require('http'),
  server = http.Server(app),
  extend = require('util')._extend,
  restler = require('restler'),
  _ = require('underscore'),
  cloudantPkg = require('cloudant'),
  async = require('async'),
  bodyParser = require('body-parser'),
  dust = require("dustjs-linkedin"),
  consolidate = require("consolidate"),
  https = require('https'),
  cfenv = require('cfenv');

//---Deployment Tracker---------------------------------------------------------
require("cf-deployment-tracker-client").track();

//---Environment Vars-----------------------------------------------------------
var vcapLocal = null
try {
  vcapLocal = require('./vcap-local.json')
}
catch (e) {}

var appEnvOpts = vcapLocal ? {vcap:vcapLocal} : {}
var appEnv = cfenv.getAppEnv(appEnvOpts);

//---Global Vars----------------------------------------------------------------
var agentStatus = "offline",
    feedbackScore = 20;

//---Set up Speech to Text------------------------------------------------------
var watson = require('watson-developer-cloud'),
    speechToTextCreds = getServiceCreds(appEnv, "assistant-shop-r-speech-to-text"),
    watsonCreds = {
        version:'v1',
        url: speechToTextCreds.url,
        username: speechToTextCreds.username,
        password: speechToTextCreds.password
    },
    speechToText = watson.speech_to_text(watsonCreds);

//---Set up Twilio--------------------------------------------------------------
var twilio = require('twilio'),
    twilioCreds = getServiceCreds(appEnv, "assistant-shop-r-twilio");

//---Set up AlchemyAPI----------------------------------------------------------
var alchemyApi = require('alchemy-api'),
    alchemyCreds = getServiceCreds(appEnv, "assistant-shop-r-alchemy"),
    alchemy = new alchemyApi(alchemyCreds.apikey);

//---Set up Business Rules------------------------------------------------------
var businessRulesCreds = getServiceCreds(appEnv, "assistant-shop-r-rules"),
    rulesUrl = businessRulesCreds.executionRestUrl + "/productsRuleApp/1.0/productsRuleProject/json",
    rulesOptions = {
      username: businessRulesCreds.user,
      password: businessRulesCreds.password
    };

//---Set up Workflow------------------------------------------------------------
var workflowCreds = getServiceCreds(appEnv, "assistant-shop-r-workflow"),
    workflowOptions = {
      username: workflowCreds.user,
      password: workflowCreds.password,
    };

//---Set up Cloudant------------------------------------------------------------
var cloudant,
    db,
    cloudantCreds = getServiceCreds(appEnv, "assistant-shop-r-db"),
    cloudantOptions = {
      account: cloudantCreds.username,
      password: cloudantCreds.password
    },
    dbName = "assistant-shop-r";

cloudantPkg(cloudantOptions, function(error, dbInstance) {
  // Check to make sure Cloudant connection was successful
  cloudant = dbInstance;
  if (error) {
    return console.error('Error connecting to Cloudant account %s: %s', me, error.message);
  }

  // Obtain a list of all DBs in the Cloudant account
  console.log('Connected to Cloudant');
  cloudant.db.list(function(error, all_dbs) {
    if (error) {
      return console.log('Error listing databases: %s', error.message);
    }
    console.log('All my databases: %s', all_dbs.join(', '));

    // Check to make sure DB is in that list
    var dbCreated = false
    _.each(all_dbs, function(name) {
      if (name === dbName) {
        dbCreated = true;
      }
    });

    // Create DB if it does not yet exist
    if (dbCreated === false) {
      cloudant.db.create(dbName, seedDB);
    }
    else {
      db = cloudant.db.use(dbName);
      console.log("DB", dbName, "already exists");
    }
  });
});

//---Start server---------------------------------------------------------------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.engine("dust", consolidate.dust);
app.set("template_engine", "dust");
app.set("views", __dirname + '/views');
app.set("view engine", "dust");

app.use(express.static(__dirname + "/public"))

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

server.listen(appEnv.port, function() {
  console.log("server started on port " + appEnv.port);
});

//---Server Requests------------------------------------------------------------

//---Token Generators-----------------------------------------------------------
app.get('/ntsToken/:name', function (request, response) {
var AccessToken = require('twilio').AccessToken;

// Substitute your Twilio AccountSid and ApiKey details
var API_KEY_SID = process.ENV.TWILIO_API_KEY;
var API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;

// Create an Access Token
var accessToken = new AccessToken(
  twilioCreds.accountSID,
  API_KEY_SID,
  API_KEY_SECRET
);

// Set the Identity of this token
accessToken.identity = request.params.name;

// Grant access to Conversations
var grant = new AccessToken.ConversationsGrant();
grant.configurationProfileSid = process.env.TWILIO_PROFILE_SID;
accessToken.addGrant(grant);

// Serialize the token as a JWT
var jwt = accessToken.toJwt();
console.log(jwt);
response.send(jwt);
});

// Get token using your credentials
app.post('/api/token', function(req, res, next) {
  authService.getToken({url: speechConfig.url}, function(err, token) {
    if (err)
      next(err);
    else
      res.send(token);
  });
});

//---View Endpoints-------------------------------------------------------------
app.get('/agent', function (request, response) {
  db.view("purchases", "all", { sort: ["-date"] },function (error, result) {
    response.render('agent', {
      visits: result.rows,
      tagline: "Customer Feedback",
      title: "Agent",
      js: "/js/agentVideo.js",
      jsSpeech: "/js/speech-receiver.js"
    });
  });
});

app.get('/', function( request, response) {
  db.view("purchases", "customer", { keys: ["David Colson"], sort: "-date" }, function (error, result) {
    response.render('index', {
      visits: result.rows,
      tagline: "My Purchases",
      title: "Purchases",
      js: "/js/customerVideo.js",
      jsSpeech: "/js/speech-recognizer.js"
    });
  });
});

//---Agent Status Changes-------------------------------------------------------
app.get("/agentStatus", function (request, response) {
  response.send({"status": agentStatus});
});

app.get("/agentStatus/:status", function (request, response) {
  agentStatus = request.params.status;
  response.sendStatus(204);
});

//---DB Endpoints---------------------------------------------------------------
app.get("/tasks", function( request, response) {
  db.view("tasks", "all", function (error, result) {
    response.render("tasks", {tasks: result.rows, tagline: "Pending Tasks", title: "Tasks"});
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

// Resets the DB to a clean state for a new demo
app.get("/api/v1/clear", function (request, response) {
  //TODO
  feedbackScore = 20;

  async.waterfall([
    // Get all purchases in the DB
    function (next) {
      db.view("purchases", "all", next);
    },
    // Delete all analysis from all non-permanent purchases
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
    // Get all tasks from the DB
    function (next) {
      db.view("tasks", "all", next);
    },
    // Delete all analysis from all non-permanent purchases
    function (result, headers, next) {
      var tasks = [];
      _.each(result.rows, function (row) {
        if (!row.value.preventDelete) {
          row.value._deleted = true;
          tasks.push(row.value);
        }
      });
      db.bulk({docs: tasks}, next);
    }], function(error) {
    if (error) {
      console.error(error);
      response.sendStatus(500);
    }
    else {
      console.log("DB cleared successfully")
      response.sendStatus(204);
    }
  });
});

// Analyze a transcript for the input record and return analysis to client
app.post("/transcript/:id", function (request, response, callback) {
  var record;

  async.waterfall([
    // Get the input record from the DB
    function (next) {
      db.get(request.params.id, next);
    },
    // Analyze the transcript of the associated record
    function (result, headers, next) {
      record = result;
      record.transcript = request.body.transcript;
      analyzeTranscript(record.transcript, next);
    },
    // Get the keywords and sentiment of the transcript, then insert back into DB
    function (result, next) {
      record.keywords = result.keywords;
      record.sentiment = result.sentiment;
      db.insert(record, next);
    },
    // Send the updated record back to the agent (client)
    function (result, headers, next) {
      response.send(record);
      return next();
    }
  ], callback);
});

//---Socket IO Handlers---------------------------------------------------------
var io = require('socket.io')(server),
    sessions = [],
    sockets = [];

var socketLog = function(id) {
  return [
    '[socket.id:', id,
    sessions[id] ? ('session:' + sessions[id].cookie_session) : '', ']: '
  ].join(' ');
};

var observe_results = function(socket, recognize_end) {
  var session = sessions[socket.id];
  return function(err, chunk) {
    if (err) {
      console.error(socketLog(socket.id), 'error:', err);
      socket.emit('onerror', {
        error: err
      });
      session.req.end();
      socket.disconnect();
    }
    else {
      var transcript = (chunk && chunk.results && chunk.results.length > 0);

      if (transcript && !recognize_end) {
        //socket.emit('speech', chunk);
        emitSocketEvents ('speech', chunk);
      }
      if (recognize_end) {
        console.log(socketLog(socket.id), 'results:', JSON.stringify(chunk, null, 2));
        console.log('socket.disconnect()');
        socket.disconnect();
      }
    }
  };
};

// Create a session on socket connection
io.use(function(socket, next) {
  speechToText.createSession({}, function(err, session) {
    if (err) {
      console.error("The server could not create a session on socket ", socket.id);
      console.error(err);
      next(new Error('The server could not create a session'));
    }
    else {
      sessions[socket.id] = session;
      sessions[socket.id].open = false;
      sockets[socket.id] = socket;
      console.log(socketLog(socket.id), 'created session');
      console.log('The system now has:', Object.keys(sessions).length, 'sessions.');
      socket.emit('session', session.session_id);
      next();
    }
  });
});

io.on('connection', function(socket) {
  var session = sessions[socket.id];

  // Catch socket.io speech payload
  socket.on('speech', function(data) {
    // If session is not open, post and get speech-to-text results
    if (!session.open) {
      session.open = true;
      var payload = {
        session_id: session.session_id,
        cookie_session: session.cookie_session,
        content_type: 'audio/l16; rate=' + (data.rate || 48000),
        continuous: true,
        interim_results: true
      };
      // POST /recognize to send data in every message we get
      session.req = speechToText.recognizeLive(payload, observe_results(socket, true));
      // GET /observeResult to get live transcripts
      speechToText.observeResult(payload, observe_results(socket, false));
    }
    else {
      session.req.write(data.audio);
    }
  });

  // Speech session was disconnected
  socket.on('speech_disconnect', function(data) {
    var session = sessions[socket.id];
    session.req.end();
  });

  // Delete the session on disconnect
  socket.on('disconnect', function() {
    speechToText.deleteSession(session, function() {
      delete sessions[socket.id];
      delete sockets[socket.id];
      console.log(socketLog(socket.id), 'delete_session');
    });
  });
});

// Emit input eventType socket event
function emitSocketEvents (eventType, data) {
  for (var value in sockets) {
    sockets[value].emit(eventType, data);
  }
}

//---Server Functions-----------------------------------------------------------
// Ensures an input service is found in VCAPS
// If found, returns the service credentials
function getServiceCreds(appEnv, serviceName) {
  var serviceCreds = appEnv.getServiceCreds(serviceName)
  if (!serviceCreds) {
    console.log("service " + serviceName + " not bound to this application");
    return null;
  }
  return serviceCreds;
}

// Analyze the input transcript for sentiment and keywords
function analyzeTranscript(transcript, callback) {
  var response = {
    transcript: transcript
  };

  async.waterfall([
    // Extract keywords from the input transcript
    function (next) {
      console.log("Extracting keywords");
      alchemy.keywords(transcript, {}, next);
    },
    // Get overall sentiment of the transcript
    function (result, next) {
      //TODO match keyword to existing items
      console.log("Keywords:", result);
      console.log("Analyzing sentiment");
      response.keywords = result.keywords;
      alchemy.sentiment(transcript, {}, next);
    },
    function (result, next) {
      console.log("sentiment", result);

      // Increment/decrement feedback score based on sentiment
      if (result.docSentiment.type === "neutral" || result.docSentiment.type  === "negative") {
        feedbackScore--;
      }
      else {
        feedbackScore++;
      }
      response.sentiment = result.docSentiment;
      console.log("The feedback score for", "Product 101", "is", feedbackScore);

      // Create object to pass to the business rules service
      var json = {
        "theProduct": {
          "id": "102",
          "feedbackScore": feedbackScore
        }
      };

      // Call the business rules service
      restler.postJson(rulesUrl, json, rulesOptions).on('complete', function(data) {
        console.log("Rules results:", data);

        // If rules says to review the product for investment/divestment, start a new process
        if (data.theProduct.needsInvestmentReview === true || data.theProduct.needsDivestmentReview === true) {
          var reviewInvestment;
          if (data.theProduct.needsInvestmentReview === true) {
            reviewInvestment = "true";
            console.log("Product", json.theProduct.id, "needs an investment review");
          }
          else {
            reviewInvestment = "false";
            console.log("Product", json.theProduct.id, "needs a divestment review");
          }

          // Invoke the workflow service and create a new process
          var url = workflowCreds.url.replace("/info","") + "/myworkflow/productsWorkflow/_/start" +
            "?productId=" + json.theProduct.id + "&feedbackScore=" + json.theProduct.feedbackScore + "&reviewInvestment=" + reviewInvestment;
          restler.get(url, workflowOptions).on('complete', function(data) {
            console.log("Created new process in Workflow");
            console.log(data);
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

// Set up the DB to default status
function seedDB(callback) {
  db = cloudant.use(dbName);

  async.waterfall([
    // If designated, retrieve and insert design docs
    function (next) {
      var designDocs = require("./config/starter_docs/design-docs.json");
      async.each(designDocs, db.insert, next);
    },
    // Retrieve and insert starter data docs
    function (next) {
      var sampleDataDocs = require("./config/starter_docs/sample-data-docs.json");
      async.each(sampleDataDocs, db.insert, next);
    },
    function (next) {
      console.log("Created DB", dbName, "and populated it with starter docs");
      next();
    }
  ], callback);
}
