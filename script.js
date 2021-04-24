//'use strict';    //使わなくてもいいや 書き方を厳しくチェックするもの。あるとバグが起きにくくなりやすい。らしい

let localStream = null;
let peer = null;
let existingCall = null;
let isReceive = false;    //受信専用かどうか
var MAIN_VIDEO_CODEC = 'VP9';
var roomType = 'sfu';
let vidCodec = null;

let rcvStream = null;

const STATS_INTERVAL = 1000;    //Statsを保存する間隔 ms
let statsCount = 0;
let timer;
let data_csv = "";

let videoTrack;
let capabilities;
let constraints;
let settings;
let room;

function CreateVideoElement(id, width, height) {
    var s = document.createElement("video");
    s.setAttribute('id', id);
    s.setAttribute('width', width);
    s.setAttribute('height', height);
    document.body.appendChild(s);
    s.setAttribute('autoplay', '');
    s.setAttribute('muted', '');
    s.style.display = 'none';
}
function CreateCanvasElement(id, width, height) {
    var s = document.createElement("canvas");
    s.setAttribute('id', id);
    s.setAttribute('width', width);
    s.setAttribute('height', height);
    document.body.appendChild(s);
    s.setAttribute('autoplay', '');
    s.setAttribute('muted', '');
    s.style.display = 'none';
}

//カメラ映像、マイク音声の取得
function getmedia(wid, hei, fra) {    //引数は(幅,高さ,fps)
    //セットされている自分のビデオを削除
    $('#my-video').get(0).srcObject = undefined;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false }, video: true })
        .then(function (stream) {
            // Success
            videoTrack = stream.getVideoTracks()[0];           //MediaStreamから[0]番目のVideoのMediaStreamTrackを取得
            capabilities = videoTrack.getCapabilities();       //設定可能な値の範囲
            videoTrack.applyConstraints({ width: { ideal: wid }, height: { ideal: hei }, frameRate: { ideal: fra } })
                .then(() => {                                  //値を設定
                    constraints = videoTrack.getConstraints(); //設定した値
                    settings = videoTrack.getSettings();       //設定された値
                    $('#width').val(settings.width);           //今の解像度をresolutionのformに表示
                    $('#height').val(settings.height);
                    $('#framerate').val(settings.frameRate);
                    stream.addTrack(videoTrack);               //設定した動画を追加
                }).catch((err) => {
                    console.error('applyConstraints() error:', err);
                    $('#console').text('applyConstraints() error:' + err);
                });
            $('#my-video').get(0).srcObject = stream;          //設定した動画を画面にセット
            localStream = stream;                              //送信用にキープ
            if(room!=null){
                room.replaceStream(stream);
            }
        }).catch(function (error) {
            // Error
            console.error('mediaDevice.getUserMedia() error:', error);
            $('#console').text('mediaDevice.getUserMedia() error:' + error);
            return;
        });
}
//カメラ映像、マイク音声の取得
function gethttpsource(wid, hei, fra, videoid, canvasid) {    //引数は(幅,高さ,fps)
    var video = document.getElementById(videoid);
    if (video == null) {
        CreateVideoElement(videoid, wid, hei);
        video = document.getElementById(videoid);
    }
    var canvas = document.getElementById(canvasid);
    if (canvas == null) {
        canvas = CreateCanvasElement(canvasid, wid, hei);
    }
    canvas.height = hei;
    canvas.width = wid;

    const ctx = canvas.getContext('2d');
    setInterval(() => {
        if (canvas && ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
    }, 10000 / fra);
    const canvasStream = canvas.captureStream(fra);
    //セットされている自分のビデオを削除
    $('#my-video').get(0).srcObject = undefined;

    $('#my-video').get(0).srcObject = canvasStream;          //設定した動画を画面にセット
    localStream = canvasStream;                              //送信用にキープ
}


//指定した解像度の映像を取得
$('#4K30fps').click(function () {
    getmedia(3840, 1920, 30);
});

$('#4K15fps').click(function () {
    getmedia(3840, 1920, 15);
});


$('#FullHD').click(function () {
    getmedia(1920, 960, 30);
});

$('#960').click(function () {
    getmedia(960, 480, 15);
});

$('#480').click(function () {
    getmedia(480, 240, 10);
});

$('#240').click(function () {
    getmedia(240, 120, 5);
});
$('#LocalRight').click(function () {
    gethttpsource(3840, 1920, 30, 'right', 'canvasright');
});
$('#LocalLeft').click(function () {
    gethttpsource(3840, 1920, 30, 'left', 'canvasleft');
});

$('#Resolution').submit(function (e) {
    e.preventDefault();
    getmedia($('#width').val(), $('#height').val(), $('#framerate').val());
});

//peeridを取得
function getpeerid(id) {
    //ボタンをすべて消す　PeerIDがサーバーに残ってしまい初期化ができない
    $('#peerid-ui').hide();

    //peerオブジェクトの作成
    peer = new Peer(id, {
        key: '829682c4-f853-4d97-8691-aa0c10064efd',     //APIkey
        debug: 3
    });

    start();//イベント確認
}
//peeridを取得
function getpeerroom(roomid, idname) {
    //ボタンをすべて消す　PeerIDがサーバーに残ってしまい初期化ができない
    $('#peerid-ui').hide();
    var random = Math.floor(Math.random() * 10000);
    //peerオブジェクトの作成
    peer = new Peer(idname + random, {
        key: '829682c4-f853-4d97-8691-aa0c10064efd',     //APIkey
        debug: 3
    });
    //openイベント
    peer.on('open', function () {
        $('#my-id').text(peer.id);
        room = peer.joinRoom(roomid, {
            mode: roomType,
            stream: localStream,
            videoBandWidth: 20000,
        });
    });

    //着信処理
    peer.on('call', function (call) {
        call.answer(localStream, { videoCodec: vidCodec });
        setupCallEventHandlers(call);
    });
    peer.on('stream', function (stream) {
        addVideo(call, stream);
    });
}
//送受信の設定
function setCallOption(recieve, vCod) {
    isReceive = recieve;
    $('#isrcv').text(isReceive);
    vidCodec = vCod;
    $('#videocod').text(vidCodec);
}

//peeridの選択
$('#twincamL').click(function () {
    setCallOption(false, MAIN_VIDEO_CODEC);
    getpeerid("tcL");

    $('#callto-id').val("userL");
});

$('#twincamR').click(function () {
    setCallOption(false, MAIN_VIDEO_CODEC);
    getpeerid("tcR");
    $('#callto-id').val("userR");
});



$('#room1left').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room1Left", "tcL");

});

$('#room1right').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room1Right", "tcR");
});

$('#room2left').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room2Left", "tcL");

});

$('#room2right').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room2Right", "tcR");
});

$('#room3left').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room3Left", "tcL");

});

$('#room3right').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerroom("Room3Right", "tcR");
});

$('#recieve').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerid();
    $('#callto-id').val("tc");
});

$('#random').click(function () {
    setCallOption(true, MAIN_VIDEO_CODEC);
    getpeerid();
});


$('#vp9').click(function () {
    MAIN_VIDEO_CODEC = 'VP9';
});

$('#h264').click(function () {
    MAIN_VIDEO_CODEC = 'H264';
});
$('#sfu').click(function () {
    roomType = 'sfu';
});

$('#mesh').click(function () {
    roomType = 'mesh';
});


//Statsボタン
$('#getting-stats').on('click', () => {
    //setIntervalでSTATS_INTERVALで指定した間隔でgetRTCStatsを実行する
    timer = setInterval(() => {
        getRTCStats(existingCall._negotiator._pc.getStats())
    }, STATS_INTERVAL);
});

$('#stop-acquiring-stats').on('click', () => {
    clearInterval(timer);

    let bom = new Uint8Array([0xEF, 0xBB, 0xBF]);                       //文字コードをBOM付きUTF-8に指定
    let statsBrob = new Blob([bom, data_csv], { "type": "text/csv" });  //data_csvのデータをcsvとしてダウンロードする関数
    let anchor = $('#downloadlink-stats').get(0);
    anchor.text = 'Download Stats';
    anchor.download = 'stats.csv';
    anchor.href = window.URL.createObjectURL(statsBrob);
    //初期化
    data_csv = "";
    statsCount = 0;
});

async function getRTCStats(statsObject) {

    //let trasportArray = [];
    //let candidateArray = [];
    //let candidatePairArray = [];
    //let inboundRTPAudioStreamArray = [];
    //let inboundRTPVideoStreamArray = [];
    //let outboundRTPAudioStreamArray = [];
    //let outboundRTPVideoStreamArray = [];
    //let codecArray = [];
    let mediaStreamTrack_senderArray = [];
    let mediaStreamTrack_receiverArray = [];
    //let mediaStreamTrack_local_audioArray = []
    //let mediaStreamTrack_remote_audioArray = []
    let mediaStreamTrack_local_videoArray = []
    let mediaStreamTrack_remote_videoArray = []
    //let candidatePairId = '';
    //let localCandidateId = '';
    //let remoteCandidateId = '';
    //let localCandidate = {};
    //let remoteCandidate = {};
    //let inboundAudioCodec = {};
    //let inboundVideoCodec = {};
    //let outboundAudioCode = {};
    //let outboundVideoCode = {};

    let stats = await statsObject;
    stats.forEach(stat => {
        //if (stat.id.indexOf('RTCTransport') !== -1) {
        //    trasportArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCIceCandidatePair') !== -1) {
        //    candidatePairArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCIceCandidate_') !== -1) {
        //    candidateArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCInboundRTPAudioStream') !== -1) {
        //    inboundRTPAudioStreamArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCInboundRTPVideoStream') !== -1) {
        //    inboundRTPVideoStreamArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCOutboundRTPAudioStream') !== -1) {
        //    outboundRTPAudioStreamArray.push(stat);
        //}
        //if (stat.id.indexOf('RTCOutboundRTPVideoStream') !== -1) {
        //    outboundRTPVideoStreamArray.push(stat);
        //}
        if (stat.id.indexOf('RTCMediaStreamTrack_sender') !== -1) {
            mediaStreamTrack_senderArray.push(stat);
        }
        if (stat.id.indexOf('RTCMediaStreamTrack_receiver') !== -1) {
            mediaStreamTrack_receiverArray.push(stat);
        }
        //if (stat.id.indexOf('RTCCodec') !== -1) {
        //    codecArray.push(stat);
        //}
    });

    //trasportArray.forEach(transport => {
    //    if (transport.dtlsState === 'connected') {
    //        candidatePairId = transport.selectedCandidatePairId;
    //    }
    //});
    //candidatePairArray.forEach(candidatePair => {
    //    if (candidatePair.state === 'succeeded' && candidatePair.id === candidatePairId) {
    //        localCandidateId = candidatePair.localCandidateId;
    //        remoteCandidateId = candidatePair.remoteCandidateId;
    //    }
    //});
    //candidateArray.forEach(candidate => {
    //    if (candidate.id === localCandidateId) {
    //        localCandidate = candidate;
    //    }
    //    if (candidate.id === remoteCandidateId) {
    //        remoteCandidate = candidate;
    //    }
    //});
    //inboundRTPAudioStreamArray.forEach(inboundRTPAudioStream => {
    //    codecArray.forEach(codec => {
    //        if (inboundRTPAudioStream.codecId === codec.id) {
    //            inboundAudioCodec = codec;
    //        }
    //    });
    //});
    //inboundRTPVideoStreamArray.forEach(inboundRTPVideoStream => {
    //    codecArray.forEach(codec => {
    //        if (inboundRTPVideoStream.codecId === codec.id) {
    //            inboundVideoCodec = codec;
    //        }
    //    });
    //});
    //outboundRTPAudioStreamArray.forEach(outboundRTPAudioStream => {
    //    codecArray.forEach(codec => {
    //        if (outboundRTPAudioStream.codecId === codec.id) {
    //            outboundAudioCodec = codec;
    //        }
    //    });
    //});
    //outboundRTPVideoStreamArray.forEach(outboundRTPVideo => {
    //    codecArray.forEach(codec => {
    //        if (outboundRTPVideo.codecId === codec.id) {
    //            outboundVideoCodec = codec;
    //        }
    //    });
    //});
    mediaStreamTrack_senderArray.forEach(mediaStreamTrack => {
        if (mediaStreamTrack.kind === 'audio') {
            //mediaStreamTrack_local_audioArray.push(mediaStreamTrack)
        } else if (mediaStreamTrack.kind === 'video') {
            mediaStreamTrack_local_videoArray.push(mediaStreamTrack)
        }
    });
    mediaStreamTrack_receiverArray.forEach(mediaStreamTrack => {
        if (mediaStreamTrack.kind === 'audio') {
            //mediaStreamTrack_remote_audioArray.push(mediaStreamTrack)
        } else if (mediaStreamTrack.kind === 'video') {
            mediaStreamTrack_remote_videoArray.push(mediaStreamTrack)
        }
    });

    //力技　先に0で宣言しといて，tryで代入失敗したら無視する
    let lfHei = 0;
    let lfWid = 0;
    let lfSen = 0;
    let rfHei = 0;
    let rfWid = 0;
    let rfRec = 0;

    try {
        lfHei = mediaStreamTrack_local_videoArray[0].frameHeight;
        lfWid = mediaStreamTrack_local_videoArray[0].frameWidth;
        lfSen = mediaStreamTrack_local_videoArray[0].framesSent;
    } catch (e) { }
    try {
        rfHei = mediaStreamTrack_remote_videoArray[0].frameHeight;
        rfWid = mediaStreamTrack_remote_videoArray[0].frameWidth;
        rfRec = mediaStreamTrack_remote_videoArray[0].framesReceived;
    } catch (e) { }

    $('#local-video').text('frameHeight:' + lfHei
        + ' frameWidth:' + lfWid
        + ' framesSent:' + lfSen);
    $('#remote-video').text('frameHeight:' + rfHei
        + ' frameWidth:' + rfWid
        + ' framesReceived:' + rfRec);

    data_csv += statsCount * STATS_INTERVAL + ','
        + lfHei + ','
        + lfWid + ','
        + lfSen + ','
        + rfHei + ','
        + rfWid + ','
        + rfRec + "\n";

    statsCount++;
}

//reloadボタン
$('#reload').click(function () {
    location.reload(true);
});

//発信処理
$('#make-call').submit(function (e) {
    e.preventDefault();
    const call = peer.call($('#callto-id').val(), localStream, {
        videoCodec: vidCodec,
        videoReceiveEnabled: isReceive,
        audioReceiveEnabled: isReceive,
    });
    setupCallEventHandlers(call);
});

//切断処理
$('#end-call').click(function () {
    existingCall.close();
});

//イベント id取得後じゃないと動作しない
function start() {
    //openイベント
    peer.on('open', function () {
        $('#my-id').text(peer.id);
    });

    //errorイベント
    peer.on('error', function (err) {
        //alert(err.message);
        $('#console').text(err.message);
        setupMakeCallUI();
    });

    //closeイベント
    peer.on('close', function () {
        //alert(err.message);
        $('#console').text(err.message);
        setupMakeCallUI();
    });

    //disconnectedイベント
    peer.on('disconnected', function () {
        //alert(err.message);
        $('#console').text(err.message);
        setupMakeCallUI();
    });

    //着信処理
    peer.on('call', function (call) {
        call.answer(localStream, { videoCodec: vidCodec });
        setupCallEventHandlers(call);
    });
}


//Callオブジェクトに必要なイベント
function setupCallEventHandlers(call) {
    if (existingCall) {
        existingCall.close();
    };

    existingCall = call;

    setupEndCallUI(call);

    call.on('stream', function (stream) {
        addVideo(call, stream);
    });

    call.on('close', function () {    //??なぜか実行された側で発火せず??
        removeVideo(call.remoteId);
        setupMakeCallUI();
    });
}

//video要素の再生
function addVideo(call, stream) {
    rcvStream = stream;                         //録画用にキープ
    $('#their-video').get(0).srcObject = stream;
}

//video要素の削除
function removeVideo(peerId) {
    $('#their-video').get(0).srcObject = undefined;
}

//ボタンの表示
function setupMakeCallUI() {
    $('#make-call').show();
    $('#end-call-ui').hide();
}

//ボタン非表示切り替え
function setupEndCallUI(call) {
    $('#make-call').hide();
    $('#end-call-ui').show();
    $('#their-id').text(call.remoteId);
    $('#console').text('');
}