'use strict';

let localStream = null;
let peer = null;
let existingCall = null;
let recordRTC = null;
let audioTrackClone = null;

// Prompt for user ID
var id = prompt('Enter your user ID: \n (if cancel, random ID will be generated)');

//get a Global Unique Identifier by appending various browser variables
//unique for each user's browser
var guid = function() {
    var nav = window.navigator;
    var screen = window.screen;
    var guid = nav.mimeTypes.length; //length of MimeTypesArray object
    guid += nav.userAgent.replace(/\D+/g, ''); //userAgentString, use Regex to remove non-numeric characters
    guid += nav.plugins.length; //number of browser plugins
    guid += screen.height || ''; //screen height
    guid += screen.width || ''; //screen width
    guid += screen.pixelDepth || ''; //

    return guid;
};

//var id = guid(); //set guid as the default ID

var screenshare = ScreenShare.create({ debug: true });

var FourKConstraints = { //4k video resolution constraints 3840 x 2160
    video: {
        width: 3840,
        height: 2160
    },
    audio: true
  };

var QuadHDConstraints = { //Quad HD resolution or 1440p
    video: {
        width: 2560,
        height: 1440
    },
    audio: true
};

var FullHDConstraints = { //Full HD resolution or 1080p
    video: {
        width: 1920,
        height: 1080
    },
    audio: true
};

var HDConstraints = { // HD resolution or 720p
    video:{
        width: 1280,
        height: 720,
    },
    audio: true
};

var callOptions = {
    videoBandwidth: 5000000, //set the maximum video bandwidth for WebRTC call
};

$(document).on('change','#resolution',function(){
    selectResolution($(this).find("option:selected").attr('value'));
});

function selectResolution(choice){
    if(choice == 1){
        startCam(FourKConstraints);
    } else if(choice == 2){
        startCam(QuadHDConstraints);
    } else if(choice == 3){
        startCam(FullHDConstraints);
    } else {
        startCam(HDConstraints);
    }
}

function startCam(constraints){
    if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
        });
    }

    navigator.mediaDevices.getUserMedia(constraints)  //get video feed from video cam
    .then(function (stream) {
        // Success
        $('#my-video').get(0).srcObject = stream; //display self video feed to GUI
        if(existingCall){
            existingCall.replaceStream(stream);
        }
        localStream = stream;
        if(audioTrackClone) {
            audioTrackClone.stop();
            audioTrackClone = null;
        }
        audioTrackClone = localStream.getAudioTracks()[0].clone();
        console.log('Cloned audio track: ', audioTrackClone);
        console.log('Current webcam stream: ', localStream);
        localStream.getTracks().forEach((track) => { console.log(`TRACK TYPE: ${track.kind}, LABEL: ${track.label}`); });
    }).catch(function (error) {
        // Error
        console.error('mediaDevice.getUserMedia() error:', error);
        return;
    });
}

startCam(FourKConstraints);

peer = new Peer(id,{ //Create new instance of peer
    key: 'cda7b712-3dd4-4f8d-af6b-f909303e2ccc', //API Key of SkyWay Application
    debug: 3 
});

peer.on('open', function(){ //Open event
    $('#my-id').text(peer.id);        //display ID at GUI
});

peer.on('error', function(err){ //handle error event
    alert(err.message);
});

peer.on('close', function(){
    //handle close event here
});

peer.on('disconnected', function(){ //Handle disconnected event
    alert("Call disconnected");
});

$('#make-call').submit(function(e){ 
    e.preventDefault();
    const call = peer.call($('#callto-id').val(), localStream, callOptions); //start call using peer.call()
    setupCallEventHandlers(call);
});

$('#end-call').click(function(){ //disconnect MediaConnection
    existingCall.close();
    existingCall = null;
});

peer.on('call', function(call){
    call.answer(localStream);
    setupCallEventHandlers(call);
});

$('#screenshareOn').submit(function(e){
    e.preventDefault();
    screenshare.start({
        width: 1920,
        height: 1080,
        frameRate: 60,
        mediaSource: 'screen', // Firefox only
      })
        .then(function(stream) {
            // success callback 
            stream.addTrack(audioTrackClone);
            $('#my-video').get(0).srcObject = stream; // Get the media stream for the screen share
            if(existingCall){
                existingCall.replaceStream(stream); //replace current call's stream
            }
            if (localStream) {
                localStream.getTracks().forEach((track) => {
                  track.stop();
                });
                localStream = stream;
            }
            console.log('Current Screenshare stream: ', localStream);
            localStream.getTracks().forEach((track) => { console.log(`TRACK TYPE: ${track.kind}, LABEL: ${track.label}`); });
        })
        .catch(function(error) {
            // error callback
            console.error('Screensharing error:', error);
            return;
        });
    $('#screenshareOn').hide();
    $('#screenshareOff').show();
});

$('#screenshareOff').submit(function(e){
    e.preventDefault();
    screenshare.stop();
    selectResolution($('#resolution').find("option:selected").attr('value'));
    $('#screenshareOn').show();
    $('#screenshareOff').hide();
});

$('#recordStart').submit(function(e){
    e.preventDefault();
    if(existingCall){
        recordRTC.startRecording();
        $('#recordStart').hide();
        $('#recordStop').show();
    }
});

$('#recordStop').submit(function(e){
    e.preventDefault();
    if(recordRTC){
        recordRTC.stopRecording(function (url) {
            var video = document.getElementById('record-video');
            video.src = url;
            video.play();
            console.log("video url: "+ url);
            var recordedBlob = recordRTC.getBlob();
            /*recordRTC.getDataURL(function(dataURL) { 
                console.log("dataURL: "+dataURL);
            });*/
        });
    }
    $('#recordStart').show();
    $('#recordStop').hide();
});

function setupCallEventHandlers(call){
    if (existingCall) {
        existingCall.close();  //remove existing call if there is one
    };

    existingCall = call;

    call.on('stream', function(stream){   //receive stream from the other peer
        addVideo(call, stream); 
        recordRTC = RecordRTC(stream, {
            mimeType: 'video/webm', // or video/webm\;codecs=h264 or video/webm\;codecs=vp9
            //audioBitsPerSecond: 128000,
            //videoBitsPerSecond: 128000,
            bitsPerSecond: 128000 // if this line is provided, skip above two
        });
        setupEndCallUI();
        $('#their-id').text(call.remoteId);
    });

    call.on('close', function(){    //end call
        removeVideo(call.remoteId);
        setupMakeCallUI();
    });
}

function addVideo(call, stream){
    $('#their-video').get(0).srcObject = stream;  //set peer's stream to GUI
}

function removeVideo(peerId){
    $('#their-video').get(0).srcObject = undefined;  //remove the peer's video from GUI
}

function setupMakeCallUI(){ //before call, show the call button
    $('#make-call').show();
    $('#end-call').hide();
}

function setupEndCallUI() { //during call, show the end call button
    $('#make-call').hide();
    $('#end-call').show();
}