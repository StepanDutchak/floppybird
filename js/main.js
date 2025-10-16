var debugmode = false;
let musicStarted = false;

var states = Object.freeze({
    SplashScreen: 0,
    GameScreen: 1,
    ScoreScreen: 2,
});

var currentstate;

var gravity = 0.25;
var velocity = 0;
var position = 180;
var rotation = 0;
var jump = -4.6;
var flyArea = $('#flyarea').height();

var score = 0;
var highscore = 0;

var pipeheight = 90;
var pipewidth = 52;
var pipes = new Array();

var replayclickable = false;
var isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

//sounds
var volume = 30;
var soundJump = new buzz.sound('assets/sounds/sfx_wing.ogg');
var soundScore = new buzz.sound('assets/sounds/sfx_point.ogg');
var soundHit = new buzz.sound('assets/sounds/sfx_hit.ogg');
var soundDie = new buzz.sound('assets/sounds/sfx_die.ogg');
var soundSwoosh = new buzz.sound('assets/sounds/sfx_swooshing.ogg');
if (isMobileDevice) {
    buzz.all().setVolume(0);
} else {
    buzz.all().setVolume(volume);
}
let audioContext;
let bgSource;
let gainNode;

async function initBackgroundMusic() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch('assets/sounds/mimi_bg.mp3');
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    gainNode = audioContext.createGain();
    gainNode.gain.value = 0.1;

    bgSource = audioContext.createBufferSource();
    bgSource.buffer = audioBuffer;
    bgSource.loop = true;
    bgSource.connect(gainNode).connect(audioContext.destination);
}

function playBackgroundMusic() {
    if (audioContext && bgSource) {
        audioContext.resume();
        bgSource.start(0);
    }
}

function stopBackgroundMusic() {
    if (bgSource) bgSource.stop();
}

var loopGameloop;
var loopPipeloop;

async function verifyCode(code) {
    const errorEl = $('#errorMessage');

    try {
        const res = await fetch('https://drimssy-game-server.onrender.com/auth/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('drimssyGameAccess', 'true');
            $('#accessModal').fadeOut();
            showSplash();
        } else {
            errorEl.text(data.message || 'Wrong code ❌');
        }
    } catch (err) {
        errorEl.text('⚠️ Server unavailable');
        console.error(err);
    }
}

$(document).ready(function () {
    if (window.location.search == '?debug') debugmode = true;
    if (window.location.search == '?easy') pipeheight = 200;

    var savedscore = getCookie('highscore');
    if (savedscore != '') highscore = parseInt(savedscore);

    // 🔹 1. Витягуємо код із URL (наприклад /ABC123)
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('code');

    // 🔹 2. Заповнюємо поле автоматично, якщо код є
    if (codeFromUrl && codeFromUrl.length > 0) {
        $('#accessCode').val(codeFromUrl.toUpperCase());
    }

    const hasAccess = localStorage.getItem('drimssyGameAccess') === 'true';
    if (hasAccess) {
        $('#accessModal').hide();
        showSplash();
    } else {
        $('#accessModal').show();
    }

    $('#submitCode').click(async function () {
        const code = $('#accessCode').val().trim();
        const email = $('#userEmail').val().trim();
        const errorEl = $('#errorMessage');
        if (!email) {
            errorEl.text('📧 Please enter your email');
            return;
        }
        if (!code) {
            errorEl.text('Use code');
            return;
        }

        await verifyCode(code);
        localStorage.setItem('drimssyUserEmail', email);
    });
});

function getCookie(cname) {
    var name = cname + '=';
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return '';
}

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
    var expires = 'expires=' + d.toGMTString();
    document.cookie = cname + '=' + cvalue + '; ' + expires;
}

function showSplash() {
    currentstate = states.SplashScreen;

    velocity = 0;
    position = 180;
    rotation = 0;
    score = 0;

    $('#player').css({ y: 0, x: 0 });
    updatePlayer($('#player'));
    if (!isMobileDevice) {
        soundSwoosh.stop();
        soundSwoosh.play();
    }

    $('.pipe').remove();
    pipes = new Array();

    $('.animated').css('animation-play-state', 'running');
    $('.animated').css('-webkit-animation-play-state', 'running');

    $('#splash').removeClass('fade-out').addClass('fade-in');
}

function startGame() {
    currentstate = states.GameScreen;

    $('#splash').removeClass('fade-in').addClass('fade-out');

    setBigScore();

    if (debugmode) {
        $('.boundingbox').show();
    }

    function gameLoopFrame() {
        gameloop();
        if (currentstate === states.GameScreen) {
            requestAnimationFrame(gameLoopFrame);
        }
    }
    requestAnimationFrame(gameLoopFrame);

    let lastPipeTime = 0;
    function pipeLoopFrame(timestamp) {
        if (currentstate !== states.GameScreen) return;

        if (timestamp - lastPipeTime > 1800) {
            updatePipes();
            lastPipeTime = timestamp;
        }

        requestAnimationFrame(pipeLoopFrame);
    }
    requestAnimationFrame(pipeLoopFrame);

    // Початковий стрибок
    playerJump();
}

function updatePlayer(player) {
    //rotation
    rotation = Math.min((velocity / 10) * 90, 90);

    //apply rotation and position
    $(player).css({ rotate: rotation, top: position });
}

function gameloop() {
    var player = $('#player');

    velocity += gravity;
    position += velocity;

    updatePlayer(player);

    var box = document.getElementById('player').getBoundingClientRect();
    var origwidth = 34.0;
    var origheight = 24.0;

    var boxwidth = origwidth - Math.sin(Math.abs(rotation) / 90) * 8;
    var boxheight = (origheight + box.height) / 2;
    var boxleft = (box.width - boxwidth) / 2 + box.left;
    var boxtop = (box.height - boxheight) / 2 + box.top;
    var boxright = boxleft + boxwidth;
    var boxbottom = boxtop + boxheight;

    if (debugmode) {
        var boundingbox = $('#playerbox');
        boundingbox.css('left', boxleft);
        boundingbox.css('top', boxtop);
        boundingbox.css('height', boxheight);
        boundingbox.css('width', boxwidth);
    }

    if (box.bottom >= $('#land').offset().top) {
        playerDead();
        return;
    }

    var ceiling = $('#ceiling');
    if (boxtop <= ceiling.offset().top + ceiling.height()) position = 0;

    if (pipes[0] == null) return;

    var nextpipe = pipes[0];
    var nextpipeupper = nextpipe.children('.pipe_upper');

    var pipetop = nextpipeupper.offset().top + nextpipeupper.height();
    var pipeleft = nextpipeupper.offset().left - 2;
    var piperight = pipeleft + pipewidth;
    var pipebottom = pipetop + pipeheight;

    if (debugmode) {
        var boundingbox = $('#pipebox');
        boundingbox.css('left', pipeleft);
        boundingbox.css('top', pipetop);
        boundingbox.css('height', pipeheight);
        boundingbox.css('width', pipewidth);
    }

    if (boxright > pipeleft) {
        if (boxtop > pipetop && boxbottom < pipebottom) {
        } else {
            playerDead();
            return;
        }
    }

    if (boxleft > piperight) {
        pipes.splice(0, 1);

        playerScore();
    }
}

$(document).keydown(function (e) {
    if (e.keyCode == 32) {
        if (currentstate == states.ScoreScreen) $('#replay').click();
        else screenClick();
    }
});

document.addEventListener(
    'pointerdown',
    function (e) {
        if (e.pointerType === 'touch' && e.isPrimary === false) return;

        screenClick();
    },
    { passive: true }
);

function screenClick() {
    if (currentstate == states.GameScreen) {
        playerJump();
    } else if (currentstate == states.SplashScreen) {
        startGame();
    }
}

function playerJump() {
    velocity = jump;
    // if (!musicStarted) {
    //     musicStarted = true;
    //     if (!audioContext || !bgSource) {
    //         initBackgroundMusic().then(playBackgroundMusic);
    //     } else {
    //         audioContext.resume();
    //     }
    // }
    if (!isMobileDevice) {
        requestAnimationFrame(() => {
            try {
                soundJump.stop();
                soundJump.play();
            } catch (e) {}
        });
    }
}

function setBigScore(erase) {
    var elemscore = $('#bigscore');
    elemscore.empty();

    if (erase) return;

    var digits = score.toString().split('');
    for (var i = 0; i < digits.length; i++)
        elemscore.append("<img src='assets/font_big_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setSmallScore() {
    var elemscore = $('#currentscore');
    elemscore.empty();

    var digits = score.toString().split('');
    for (var i = 0; i < digits.length; i++)
        elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setHighScore() {
    var elemscore = $('#highscore');
    elemscore.empty();

    var digits = highscore.toString().split('');
    for (var i = 0; i < digits.length; i++)
        elemscore.append("<img src='assets/font_small_" + digits[i] + ".png' alt='" + digits[i] + "'>");
}

function setMedal() {
    var elemmedal = $('#medal');
    elemmedal.empty();

    if (score < 10) return false;

    if (score >= 10) medal = 'bronze';
    if (score >= 20) medal = 'silver';
    if (score >= 30) medal = 'gold';
    if (score >= 80) medal = 'platinum';

    elemmedal.append('<img src="assets/medal_' + medal + '.png" alt="' + medal + '">');
    return true;
}

function playerDead() {
    $('.animated').css('animation-play-state', 'paused');
    $('.animated').css('-webkit-animation-play-state', 'paused');

    var playerbottom = $('#player').position().top + $('#player').width();
    var floor = flyArea;
    var movey = Math.max(0, floor - playerbottom);
    $('#player').transition({ y: movey + 'px', rotate: 90 }, 1000, 'easeInOutCubic');

    currentstate = states.ScoreScreen;

    clearInterval(loopGameloop);
    clearInterval(loopPipeloop);
    loopGameloop = null;
    loopPipeloop = null;

    if (isIncompatible.any()) {
        showScore();
    } else {
        soundHit.play().bindOnce('ended', function () {
            soundDie.play().bindOnce('ended', function () {
                showScore();
            });
        });
    }
}

async function fetchWinn() {
    const email = localStorage.getItem('drimssyUserEmail');

    try {
        const res = await fetch('https://drimssy-game-server.onrender.com/winner/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });

        const data = await res.json();

        if (data.success) {
            const bannerOverlay = $(`
                <div id="winnerOverlay">
                    <div id="winnerBanner">
                        🎉 Congratulations! You’ve won a Mi Mi!<br>
                        We’ll send all the details to your email soon.
                    </div>
                </div>
            `);

            $('body').append(bannerOverlay);

            // стилі для темного фону
            $('#winnerOverlay').css({
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                opacity: 0, // стартова прозорість
            });

            // стилі для банера
            $('#winnerBanner').css({
                background: '#e0b495ff',
                color: '#fff',
                padding: '24px 48px',
                borderRadius: '18px',
                fontSize: '20px',
                fontWeight: '600',
                textAlign: 'center',
                boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                transform: 'scale(0.9)',
            });

            // ✨ додаємо появу з анімацією
            $('#winnerOverlay').animate({ opacity: 1 }, 400);
            $('#winnerBanner').animate(
                { transform: 'scale(1)' },
                {
                    step: function (now, fx) {
                        if (fx.prop === 'transform') {
                            $(this).css('transform', `scale(${now})`);
                        }
                    },
                    duration: 500,
                }
            );

            localStorage.clear();
        } else {
            messageEl.text(`⚠️ ${data.message}`);
            localStorage.removeItem('drimssyUserEmail');
        }
    } catch (err) {
        console.error(err);
        messageEl.text('⚠️ Server unavailable, please try again later.');
    }
}
async function showScore() {
    $('#scoreboard').css('display', 'block');
    setBigScore(true);

    if (score > highscore) {
        highscore = score;
        setCookie('highscore', highscore, 999);
    }

    setSmallScore();
    setHighScore();
    var wonmedal = setMedal();

    if (!isMobileDevice) {
        soundSwoosh.stop();
        soundSwoosh.play();
    }

    $('#scoreboard').css({ y: '40px', opacity: 0 });
    $('#replay').css({ y: '40px', opacity: 0 });
    $('#scoreboard').transition({ y: '0px', opacity: 1 }, 600, 'ease', function () {
        if (!isMobileDevice) {
            soundSwoosh.stop();
            soundSwoosh.play();
        }
        $('#replay').transition({ y: '0px', opacity: 1 }, 600, 'ease');

        if (wonmedal) {
            $('#medal').css({ scale: 2, opacity: 0 });
            $('#medal').transition({ opacity: 1, scale: 1 }, 1200, 'ease');
        }
    });

    if (score >= 100) {
        await fetchWinn();
        localStorage.removeItem('drimssyGameAccess');
    }

    replayclickable = true;
}

$('#replay').click(function () {
    if (!replayclickable) return;
    else replayclickable = false;
    if (!isMobileDevice) {
        soundSwoosh.stop();
        soundSwoosh.play();
    }

    $('#scoreboard').transition({ y: '-40px', opacity: 0 }, 1000, 'ease', function () {
        $('#scoreboard').css('display', 'none');

        showSplash();
    });
});

function playerScore() {
    score += 1;
    //play score sound
    if (!isMobileDevice) {
        soundScore.stop();
        soundScore.play();
    }
    setBigScore();
}
function updatePipes() {
    $('.pipe')
        .filter(function () {
            return $(this).position().left <= -pipewidth;
        })
        .remove();

    if (pipes.length > 6) {
        const oldPipe = pipes.shift();
        if (oldPipe && oldPipe.remove) oldPipe.remove();
    }

    const padding = 80;
    const constraint = flyArea - pipeheight - padding * 2;
    const topheight = Math.floor(Math.random() * constraint + padding);
    const bottomheight = flyArea - pipeheight - topheight;

    const newpipe = $(`
        <div class="pipe animated" style="will-change: transform;">
            <div class="pipe_upper" style="height:${topheight}px;"></div>
            <div class="pipe_lower" style="height:${bottomheight}px;"></div>
        </div>
    `);

    $('#flyarea').append(newpipe);
    pipes.push(newpipe);
}

var isIncompatible = {
    Android: function () {
        return navigator.userAgent.match(/Android/i);
    },
    BlackBerry: function () {
        return navigator.userAgent.match(/BlackBerry/i);
    },
    iOS: function () {
        return navigator.userAgent.match(/iPhone|iPad|iPod/i);
    },
    Opera: function () {
        return navigator.userAgent.match(/Opera Mini/i);
    },
    Safari: function () {
        return navigator.userAgent.match(/OS X.*Safari/) && !navigator.userAgent.match(/Chrome/);
    },
    Windows: function () {
        return navigator.userAgent.match(/IEMobile/i);
    },
    any: function () {
        return (
            isIncompatible.Android() ||
            isIncompatible.BlackBerry() ||
            isIncompatible.iOS() ||
            isIncompatible.Opera() ||
            isIncompatible.Safari() ||
            isIncompatible.Windows()
        );
    },
};
