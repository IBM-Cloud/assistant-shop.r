/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/**
 *  @author Daniel Bolanos <dbolano@us.ibm.com>
 *  modified by German Attanasio <germanatt@us.ibm.com>
 *  also modified by Jake Peyser <jepeyser@us.ibm.com>
 *
 * @param {Object} _options configuration parameters
 * @param {String} _options.ws  WebSocket URL
 *
 */
function SpeechRecognizer(_options) {
  var options = _options || {};

  this.ws = options.ws || '';
  this.sessions = [];
}

/**
 * Create a Websocket and listen for server data
 */
SpeechRecognizer.prototype._init = function() {
  // If sockets exits then connect to it
  // otherwise create a new socket
  if (this.socket){
    this.socket.connect();
    return;
  }

  //console.log('SpeechRecognizer._init():', this.ws);
  var self = this;
  this.socket = io.connect(this.ws);

  this.socket.on('connect', function() {
    console.log('socket.onconnect()');
    self.connected = true;
    self.onstart();
  });

  this.socket.on('disconnect', function() {
    console.log('socket.ondisconnect()');
    self.onend();
  });

  this.socket.on('session', function(session) {
    console.log('Speech session:', session);
    self.sessions.push(session);
    self.session_id = session;
  });

  this.socket.on('connect_failed', function() {
    console.log('socket.connect_failed()');
    self.onerror('WebSocket can not be contacted');
  });

  var onError = function(error) {
    var errorStr = error ? error : 'A unknown error occurred';
    console.log('socket.onerror()', errorStr);
    self.onerror(errorStr);
  };

  this.socket.on('error', onError);
  this.socket.on('onerror', onError);

  this.socket.on('speech', function(msg){
    //console.log('socket.onmessage():', msg);
    self.onresult(msg);
  });

};

/**
 * The start method represents an instruction to the
 * recognition service to start listening
 */
SpeechRecognizer.prototype.start = function() {
  try {
    this._init();
  } catch (e) {
    this.onerror(e);
    return;
  }
};

/**
 * The stop method represents an instruction to the
 * recognition service to stop listening to more audio
 */
SpeechRecognizer.prototype.stop = function() {
  // do nothing
};

/**
 * The abort method is a request to immediately stop
 * listening and stop recognizing and do not return
 * any information but that the system is done.
 */
SpeechRecognizer.prototype.abort = function() {
  this.stop();
};

// Functions used for speech recognition events listeners.
SpeechRecognizer.prototype.onstart = function() {
  this._init();
};
SpeechRecognizer.prototype.onresult = function() {};
SpeechRecognizer.prototype.onerror = function() {};
SpeechRecognizer.prototype.onend = function() {};
