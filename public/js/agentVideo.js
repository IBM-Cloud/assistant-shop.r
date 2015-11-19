// video chat variables
var conversationsClient,
    activeConversation,
    previewMedia;

// conversation variables
var live,
    speech;

// user and item variables
var rowId = "05f29484a79f26982c787496729d55b7",
    user = "shopr-agent",
    saved = false;

$(document).ready(function() {

  // initialize speech socket object
  live = false;
  speech = new SpeechRecognizer({
    ws : ''
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

  speech.onresult = function(data) {
    var textElement = $("#collapse-" + rowId + " .transcript .local.text");
    textElement.show();
    textElement.parent().show();
    // If speech transcript received
    if (data.results && data.results.length > 0) {
      // if is a partial transcripts
      if (data.results.length === 1 ) {
        var paragraph = textElement.children().last(),
            text = data.results[0].alternatives[0].transcript || '';
        //Capitalize first word
        text = text.charAt(0).toUpperCase() + text.substring(1);
        console.log(text);
        // if final results, append a new paragraph and end speech collection
        if (data.results[0].final) {
          text = text.trim() + '.';
          $('<p></p>').appendTo(textElement);
          speech.stop();
        }
        // Place the text on the page
        paragraph.text(text);
      }
    }
  };
});

// allows the agent to go 'online', designating they can take calls
$(".go-online").on("click", function() {
  // toggle button color and update text
  $(this).toggleClass("btn-danger");
  $(this).toggleClass("btn-success");
  var onlineInd = $(this).children(".text");

  // if offline, set status to online
  if (onlineInd.text().indexOf("Online") === -1) {
    onlineInd.text("    Online");
    $.ajax("/agentStatus/online").done(function(data) {
      console.info("Agent went online");
    });
  }
  // otherwise, set status to offline
  else {
    onlineInd.text("    Offline");
    $.ajax("/agentStatus/offline").done(function(data) {
      console.info("Agent went offline");
    });
  }
});

// successfully connected!
function clientConnected() {
  // display invite controls
  //document.getElementById('invite-controls').style.display = 'block';
  console.log("Connected to Twilio. Listening for incoming Invites as '" + conversationsClient.identity + "'");

  // listen for invite and accept automatically
  conversationsClient.on('invite', function (invite) {
    console.log('Incoming invite from: ' + invite.from);
    invite.accept().then(conversationStarted);
  });
};

// conversation is live
function conversationStarted(conversation) {
  console.log('In an active Conversation');
  $("#collapse-" + rowId + " .video").show();
  $("#collapse-" + rowId + " .controls").show();
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
    speech.stop();
  });
  // when the conversation ends, stop capturing local video
  conversation.on('ended', function (conversation) {
    if (activeConversation)
      endConversation();
    speech.stop();
  });

  $(".end-call").on("click", function() {
    if (activeConversation)
      endConversation();
    speech.stop();
  });
};

function endConversation() {
  console.log("Connected to Twilio. Listening for incoming Invites as '" + conversationsClient.identity + "'");
  activeConversation.localMedia.stop();
  activeConversation.disconnect();
  activeConversation = null;
  if (!saved)
    saveConversation();
}

// save and analyze the transcript
function saveConversation() {
  saved = true;
  // hide the video controls
  $("#collapse-" + rowId + " .local-video").prop("src", "");
  $("#collapse-" + rowId + " .remote-video").prop("src", "");
  $("#collapse-" + rowId + " .video").hide();
  $("#collapse-" + rowId + " .controls").hide();

  // get the transcript
  var transcriptText = $("#collapse-" + rowId + " .transcript .local.text").text();
  console.log(transcriptText);
  //===Local testing injection===
  transcriptText = "Hello there I am very upset with my polo shirt. It is too tight and does not fit well please give me a refund.";
  $("#collapse-" + rowId + " .transcript .local.text").text(transcriptText);

  // analyze transcript and get back sentiment analysis and keywords
  var transcriptObj = {
    "transcript": transcriptText
  };
  $.post("/transcript/" + rowId, transcriptObj, displayAnalysis);
}

// compile and display the keywords & sentiment with the transcript
function displayAnalysis(result) {

  // create new section for analysis
  var analysis = document.createElement('div');
  analysis.setAttribute('class', "col-md-12");
  // append a seperator element
  var seperator = document.createElement('hr');
  seperator.setAttribute('class', "feedback-separator");
  analysis.appendChild(seperator);

  // assess whether pos or neg feedback, then inject corresponding glyph
  if (result.sentiment.type) {
    var sentiment;
    if (result.sentiment.type === "neutral" || result.sentiment.type === "negative") {
      sentiment = "down";
    }
    else {
      sentiment = "up";
    }

    // add sentiment analysis element
    var sentimentTitle = document.createElement('p');
    sentimentTitle.setAttribute('class', "feedback-title");
    sentimentTitle.innerHTML = "Customer Feedback:&nbsp;<span>(Sentiment&nbsp;<span class='glyphicon glyphicon-thumbs-" + sentiment + "'> </span>)</span>"
    analysis.appendChild(sentimentTitle);
  }

  // add transcript block
  var transcriptBlock = document.createElement('div');
  transcriptBlock.setAttribute('class', "follow-up-transcript");
  var transcriptWell = document.createElement('div');
  transcriptWell.setAttribute('class', "text well local transcript-box");
  var transcriptText = document.createElement('p');
  transcriptText.innerHTML = result.transcript;
  transcriptWell.appendChild(transcriptText);
  transcriptBlock.appendChild(transcriptWell);
  analysis.appendChild(transcriptBlock);

  // loop through returned keyqords and inject into item row
  if (result.keywords && result.keywords.length > 0) {
    // add keyword analysis title element
    var keyWordTitle = document.createElement('p');
    keyWordTitle.setAttribute('class', "feedback-title");
    keyWordTitle.innerHTML = "Feedback Keywords:"
    analysis.appendChild(keyWordTitle);

    // loop through tags and add each as a seperate element
    var tags = document.createElement('div');
    tags.setAttribute('class', "tags");
    _.each(result.keywords, function (keyword) {
      var tag = document.createElement('span');
      tag.setAttribute('class', "tag");
      tag.setAttribute('data-name', keyword.text);
      tag.innerHTML = keyword.text;
      tags.appendChild(tag);
    });
    analysis.appendChild(tags);
  }

  // Swap transcript out for analysis
  $("#collapse-" + rowId + " .transcript").hide();
  var row = document.getElementById("collapse-" + rowId);
  row.insertBefore(analysis, row.children[4]);

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
