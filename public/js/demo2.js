
var mySocket,
    connected = false,
    sessions = [],
    session_id,
    audioContext,
    analyser,
    microphone,
    bufferSize = 2048,
    inputChannels = 1,
    outputChannels = 1,
    bufferUnusedSamples = new Float32Array(0),
    blah;

function startRecording(myStream) {

    blah = myStream;

    // the context in which all the audio processing will take place
    audioContext = new AudioContext();

    var gain = audioContext.createGain();
    var audioInput = audioContext.createMediaStreamSource(myStream);

    audioInput.connect(gain);

    microphone = audioContext.createScriptProcessor(bufferSize, inputChannels, outputChannels);

    microphone.onaudioprocess = _onaudioprocess.bind(this);

    gain.connect(microphone);
    microphone.connect(audioContext.destination);

    mySocket = io.connect();

    mySocket.on('connect', function() {
        console.log('socket.onconnect()');
        connected = true;
        onstart();
    });

    mySocket.on('disconnect', function() {
      console.log('socket.ondisconnect()');
      onend();
    });

    mySocket.on('session', function(session) {
      console.log('session:',session);
      sessions.push(session);
      session_id = session;
    });

    mySocket.on('connect_failed', function() {
      console.log('socket.connect_failed()');
    });

    mySocket.on('message', function(msg){
      console.log(msg);
      //console.log('demo.onresult()');
      showResult(msg, "local");
    });

}

 function _onaudioprocess(data) {

  // Check the data to see if we're just getting 0s
  // (the user isn't saying anything)
  var chan = data.inputBuffer.getChannelData(0);

  //onAudio(_exportDataBufferTo16Khz(new Float32Array(chan)));
  onAudio(_exportDataBuffer(new Float32Array(chan)));

  //export with microphone mhz, remember to update the this.sampleRate
  // with the sample rate from your microphone
  //this.onAudio(this._exportDataBuffer(new Float32Array(chan)));

}

function stopRecording() {
  recording = false;
  mySocket.emit('message', {disconnect:true});
}

function onstart() {
    console.log('demo.onstart()');
    recording = true;
    $('.errorMsg').hide();
    $('#text').show();
}

function onerror(error) {
    console.log('demo.onerror():', error);
    recording = false;
    displayError(error);
  };

  function onend() {
    console.log('demo.onend()');
    recording = false;
  };

  function onresult(data) {

  };

  function displayError(error) {
    var message = error;
    try {
      var errorJson = JSON.parse(error);
      message = JSON.stringify(errorJson, null, 2);
    } catch (e) {
      message = error;
    }

    $('.errorMsg').text(message);
    $('.errorMsg').show();
    $('#text').hide();
  }

  function showResult(data, streamLocation) {
    var textElement = $("#collapse-" + customerId + " .transcript ." + streamLocation + ".text");
    textElement.show();
    textElement.parent().show();
    //console.log(data);
    //if there are transcripts
    if (data.results && data.results.length > 0) {

      //if is a partial transcripts
      if (data.results.length === 1 ) {
        var paragraph = textElement.children().last(),
          text = data.results[0].alternatives[0].transcript || '';

        //Capitalize first word
        text = text.charAt(0).toUpperCase() + text.substring(1);
        // if final results, append a new paragraph
        if (data.results[0].final){
          text = text.trim() + '.';
          $('<p></p>').appendTo(textElement);
        }
        paragraph.text(text);
      }
    }
  }

function onAudio(data) {
    //console.log('onAudio():',data);
    if (mySocket.connected)
      mySocket.emit('message', {audio: data, rate: microphone.sampleRate});
  };

/**
 * Creates a Blob type: 'audio/l16' with the chunk and downsampling to 16 kHz
 * coming from the microphone.
 * Explanation for the math: The raw values captured from the Web Audio API are
 * in 32-bit Floating Point, between -1 and 1 (per the specification).
 * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
 * Multiply to control the volume of the output. We store in little endian.
 * @param  {Object} buffer Microphone audio chunk
 * @return {Blob} 'audio/l16' chunk
 * @deprecated This method is depracated
 */
function _exportDataBufferTo16Khz(bufferNewSamples) {
  var buffer = null,
    newSamples = bufferNewSamples.length,
    unusedSamples = bufferUnusedSamples.length;

  if (unusedSamples > 0) {
    buffer = new Float32Array(unusedSamples + newSamples);
    for (var i = 0; i < unusedSamples; ++i) {
      buffer[i] = bufferUnusedSamples[i];
    }
    for (i = 0; i < newSamples; ++i) {
      buffer[unusedSamples + i] = bufferNewSamples[i];
    }
  } else {
    buffer = bufferNewSamples;
  }

  // downsampling variables
  var filter = [
      -0.037935, -0.00089024, 0.040173, 0.019989, 0.0047792, -0.058675, -0.056487,
      -0.0040653, 0.14527, 0.26927, 0.33913, 0.26927, 0.14527, -0.0040653, -0.056487,
      -0.058675, 0.0047792, 0.019989, 0.040173, -0.00089024, -0.037935
    ],
    samplingRateRatio = audioContext.sampleRate / 16000,
    nOutputSamples = Math.floor((buffer.length - filter.length) / (samplingRateRatio)) + 1,
    pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
    dataView16k = new DataView(pcmEncodedBuffer16k),
    index = 0,
    volume = 0x7FFF, //range from 0 to 0x7FFF to control the volume
    nOut = 0;

  for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
    var sample = 0;
    for (var j = 0; j < filter.length; ++j) {
      sample += buffer[i + j] * filter[j];
    }
    sample *= volume;
    dataView16k.setInt16(index, sample, true); // 'true' -> means little endian
    index += 2;
    nOut++;
  }

  var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
  var remaining = buffer.length - indexSampleAfterLastUsed;
  if (remaining > 0) {
    bufferUnusedSamples = new Float32Array(remaining);
    for (i = 0; i < remaining; ++i) {
      bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i];
    }
  } else {
    bufferUnusedSamples = new Float32Array(0);
  }

  return new Blob([dataView16k], {
    type: 'audio/l16'
  });
  };

/**
 * Creates a Blob type: 'audio/l16' with the
 * chunk coming from the microphone.
 */
function _exportDataBuffer(buffer) {
  var pcmEncodedBuffer = null,
    dataView = null,
    index = 0,
    volume = 0x7FFF; //range from 0 to 0x7FFF to control the volume

  pcmEncodedBuffer = new ArrayBuffer(bufferSize * 2);
  dataView = new DataView(pcmEncodedBuffer);

  /* Explanation for the math: The raw values captured from the Web Audio API are
   * in 32-bit Floating Point, between -1 and 1 (per the specification).
   * The values for 16-bit PCM range between -32768 and +32767 (16-bit signed integer).
   * Multiply to control the volume of the output. We store in little endian.
   */
  for (var i = 0; i < buffer.length; i++) {
    dataView.setInt16(index, buffer[i] * volume, true);
    index += 2;
  }

  // l16 is the MIME type for 16-bit PCM
  return new Blob([dataView], { type: 'audio/l16' });
};
