// video chat variables
var conversationsClient,
    activeConversation,
    previewMedia,
    startVideo;

// conversation variables
var recording,
    speech;

// user and item variables
var agentName = "shopr-agent",
    rowId = "05f29484a79f26982c787496729d55b7",
    user = "caller";

$(document).ready(function() {

  // initialize speech socket object
  recording = false;
  speech = new SpeechRecognizer({
    ws : '',
    model : 'WatsonModel'
  });

  // check for WebRTC
  if (!navigator.webkitGetUserMedia && !navigator.mozGetUserMedia) {
    alert('WebRTC is not available in your browser.');
  }

  // generate an AccessToken and create an AccessManager object
  $.ajax('/ntsToken/' + user).done(function(data) {
    var accessManager = new Twilio.AccessManager(data);

    // create a Conversations Client and connect to Twilio
    conversationsClient = new Twilio.Conversations.Client(accessManager);
    conversationsClient.listen().then(
      clientConnected,
      function (error) {
        console.error('Could not connect to Twilio: ' + error.message);
      }
    );
  });

  //===Speech event handlers====================================================
  speech.onstart = function() {
    console.log('speech.onstart()');
    recording = true;
  };

  speech.onerror = function(error) {
    console.log('speech.onerror():', error);
    recording = false;
    //displayError(error);
  };

  speech.onend = function() {
    console.log('speech.onend()');
    recording = false;
  };
});

// create a new conversation
var startVideo = function() {
  // if a conversation is already occuring, do not allow another participant
  if (activeConversation) {
    //activeConversation.invite(agentName);
  }
  // otherwise, create a new conversation
  else {
    var options = {};
    if (previewMedia) {
      options.localMedia = previewMedia;
    }
    // send an invite to chat to the agent
    conversationsClient.createConversation(agentName, options).then(
      conversationStarted,
      function (error) {
        console.error('Unable to create conversation', error);
      }
    );
  }
}

// successfully connected!
function clientConnected() {
  // display invite controls
  //document.getElementById('invite-controls').style.display = 'block';
  console.log("Connected to Twilio. Ready to make calls as '" + conversationsClient.identity + "'");

  $(".customer-actions img.support").on("click", startVideo);
};

// conversation is live
function conversationStarted(conversation) {
  console.log('In an active Conversation');
  $("#collapse-" + rowId + " .video").show();
  $("#collapse-" + rowId + " .controls").show();
  $(".customer-actions img.support").off("click", '**');
  activeConversation = conversation;

  // draw local video, if not already previewing
  if (!previewMedia) {
    conversation.localMedia.attach('#local-video');
  }
  // when a participant joins, draw their video on screen
  conversation.on('participantConnected', function (participant) {
    console.log("Participant '" + participant.identity + "' connected");
    participant.media.attach('#remote-video');
    adjustMedia();
    speech.start();
  });
  // when a participant disconnects, note in log
  conversation.on('participantDisconnected', function (participant) {
    console.log("Participant '" + participant.identity + "' disconnected");
    if (activeConversation)
      endConversation();
  });
  // when the conversation ends, stop capturing local video
  conversation.on('ended', function (conversation) {
    if (activeConversation)
      endConversation();
  });
};

function endConversation() {
  console.log("Connected to Twilio. Listening for incoming Invites as '" + conversationsClient.identity + "'");
  $("#collapse-" + rowId + " .video").hide();
  $("#collapse-" + rowId + " .controls").hide();
  $(".customer-actions img.support").on("click", startVideo);
  activeConversation.localMedia.stop();
  activeConversation.disconnect();
  activeConversation = null;
  speech.stop();
}

function adjustMedia() {
  document.getElementById("local-video").childNodes[1].style.height = "284px";
  document.getElementById("remote-video").childNodes[1].style.height = "284px";
}

// local video preview
/*document.getElementById('button-preview').onclick = function () {
  if (!previewMedia) {
    previewMedia = new Twilio.Conversations.LocalMedia();
    Twilio.Conversations.getUserMedia().then(
      function (mediaStream) {
        previewMedia.addStream(mediaStream);
        previewMedia.attach('#local-video');
      },
      function (error) {
        console.error('Unable to access local media', error);
      }
    );
  };
};*/
