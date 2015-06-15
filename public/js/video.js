var myEndpoint,
    caller,
    remoteParty,
    customerId;

    $(document).ready(function() {
        $(".video").hide();
        $(".transcript").hide();
        $(".controls").hide();
    });

    $(".customer-actions img.support").on("click", function() {
        caller = $(this).attr("data-purchase");
        remoteParty = "shopr-agent";
        setupVideoCall(caller, remoteParty);
    });

    $(".go-online").on("click", function() {
        var text = $(this).children(".text");
        caller = "shopr-agent";

        $(this).toggleClass("btn-danger");
        $(this).toggleClass("btn-success");
        if (text.text().indexOf("Online") === -1) {
            text.text("    Online");

            $.ajax("/agentStatus/online").done(function(data) {
                console.info("Agent went online");
            });

            setupVideoCall(caller);

        }
        else {
            text.text("    Offline");

            $.ajax("/agentStatus/offline").done(function(data) {
                console.info("Agent went offline");
            });
        }

    });

    function setupVideoCall() {
        if (caller === "shopr-agent") {
            customerId = remoteParty;
        }
        else {
            customerId = caller;
        }
        $.ajax('/ntsToken/' + caller).done(function(data) {
            window.ntsToken = data;
            myEndpoint = Twilio.Endpoint(ntsToken, {debug: true});

            myEndpoint.listen()
            .then(
              endpointConnected,
              function(error) {
                log("Could not connect to Twilio: " + error.message)
              }
            );
         });
    }

    function endpointConnected() {

        myEndpoint.on('invite', function(invite) {
            invite.accept().then(conversationActive);
            console.log('Received an Invite to join a Conversation from ' + invite.from);
            if (!customerId) {
                customerId = invite.from;
            }
        });

        if (remoteParty) {
            connectVideoCall(remoteParty);
        }

    }

    function connectVideoCall(remoteParty) {
        myEndpoint.createConversation(remoteParty).then(conversationActive,
            function(error) {
                console.error('Unable to set up call.');
                console.dir(error);
            });
    }

    function conversationActive(conversation) {
        console.log("Conversation active");
        //enableMultiParty(conversation);
        $("#collapse-" + customerId + " .video").show();
        $("#collapse-" + customerId + " .controls").show();
        showLocalVideo(conversation.localMedia);
        var mediaStreamSet = conversation.localMedia.mediaStreams;
        var firstMediaStream = mediaStreamSet.values().next().value;
        //startRecording(firstMediaStream);
        conversation.on('participantConnected', showRemoteVideo);

        conversation.on('participantDisconnected', function(participant) {
            console.log("Participant '" + participant.address + "' disconnected");
          });
          // when the conversation ends, remove local video
          conversation.on('ended', function(conversation) {
            console.log("Converstion ended by remote participant");
            conversation.localMedia.detach();
            conversation.leave();
            saveConversation();
          });

        $(".end-call").on("click", function() {
            conversation.localMedia.detach();
            conversation.leave();
        });
    };


    function saveConversation() {
        $("#collapse-" + customerId + " .local-video").prop("src", "");
        $("#collapse-" + customerId + " .remote-video").prop("src", "");
        $("#collapse-" + customerId + " .video").hide();
        $("#collapse-" + customerId + " .controls").hide();

        if (remoteParty !== "shopr-agent") {
            var transcript = {
                "transcript": $("#collapse-" + customerId + " .transcript .local.text").text()
            };

            $.post("/transcript/" + customerId, transcript, displayKeywords);
        }

        mySocket.disconnect();
    }

    function displayKeywords(result) {
        if (result.keywords.length > 0) {
            var html = '<p class="feedback-title">Feedback keywords:</p><div class="tags">';

            _.each(result.keywords, function (keyword) {
                html += '<span class="tag" data-name="' + keyword.text + '">' + keyword.text + ' </span>';
            });

            $("#collapse-" + customerId + " .transcript .keywords").empty();

            html += "</div>";
            $("#collapse-" + customerId + " .transcript .keywords").append(html);
        }
        if (result.sentiment.type) {
            var sentiment = "";
            if (result.sentiment.type === "neutral" || result.sentiment.type === "negative") {
                sentiment = "down";
            }
            else {
                sentiment = "up";
            }
            $("#collapse-" + customerId + " .transcript .sentiment").empty();
            $("#collapse-" + customerId + " .transcript .sentiment").append('<span>&nbsp;(Sentiment&nbsp;<span class="glyphicon glyphicon-thumbs-'+ sentiment + '">)</span>');
        }
    }

    function showLocalVideo(localStream) {
        $("#collapse-" + customerId).collapse("show");
        var videoElement = $("#collapse-" + customerId + " .local-video")[0];
        localStream.attach(videoElement);
    }

    function showRemoteVideo(participant) {
        console.info("Participant connected:", participant);
        var videoElement = $("#collapse-" + customerId + " .remote-video")[0];
        participant.media.attach(videoElement);
        var mediaStreamSet = participant.media.mediaStreams;
        var firstMediaStream = mediaStreamSet.values().next().value;
        if (remoteParty !== "shopr-agent") {
            startRecording(firstMediaStream);
        }
    }
