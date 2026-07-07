const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let audioCtx, audioBuffer, audioSource;
let startTime = 0;
let isPlaying = false;
let currentMap = [];
let score = 0;

const LANE_COUNT = 4;
const keys = ['d', 'f', 'j', 'k'];
let laneWidth, judgmentLineY;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    laneWidth = canvas.width / LANE_COUNT;
    judgmentLineY = canvas.height * 0.85;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.getElementById('audio-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const reader = new FileReader();
    
    reader.onload = function(evt) {
        audioCtx.decodeAudioData(evt.target.result, function(buffer) {
            audioBuffer = buffer;
            alert("Audio loaded successfully! Choose a difficulty to play.");
        });
    };
    reader.readAsArrayBuffer(file);
});

function generateMap(difficulty, duration) {
    const map = [];
    const mobileMode = document.getElementById('mobile-mode').checked;
    
    let noteInterval = 0.5; 
    let sliderChance = 0.2;
    if (difficulty === 'easy') { noteInterval = 0.8; sliderChance = 0.1; }
    if (difficulty === 'hard') { noteInterval = 0.3; sliderChance = 0.4; }

    for (let time = 1.0; time < duration - 2; time += noteInterval) {
        let chordSize = Math.floor(Math.random() * 3) + 1;
        if (difficulty === 'hard' && !mobileMode) chordSize = Math.floor(Math.random() * 4) + 1;
        if (mobileMode && chordSize > 2) chordSize = 2;

        let lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

        for (let i = 0; i < chordSize; i++) {
            const lane = lanes[i];
            const isSlider = Math.random() < sliderChance;

            if (isSlider) {
                map.push({
                    type: 'slider',
                    lane: lane,
                    time: time,
                    duration: Math.random() * 1.5 + 0.5
                });
            } else {
                map.push({
                    type: 'tap',
                    lane: lane,
                    time: time
                });
            }
        }
        time += (Math.random() * 0.2 - 0.1);
    }
    return map.sort((a, b) => a.time - b.time);
}

function startGame(difficulty) {
    if (!audioBuffer) return alert("Please upload an audio file first!");
    
    document.getElementById('ui-container').style.display = 'none';
    canvas.style.display = 'block';

    currentMap = generateMap(difficulty, audioBuffer.duration);
    
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioCtx.destination);
    
    startTime = audioCtx.currentTime;
    audioSource.start(0);
    isPlaying = true;
    
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!isPlaying) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsedTime = audioCtx.currentTime - startTime;

    ctx.strokeStyle = '#333';
    for (let i = 1; i < LANE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, canvas.height);
        ctx.stroke();
    }

    ctx.strokeStyle = '#00adb5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, judgmentLineY);
    ctx.lineTo(canvas.width, judgmentLineY);
    ctx.stroke();

    const noteSpeed = 400;
    
    currentMap.forEach(note => {
        const timeDiff = note.time - elapsedTime;
        const y = judgmentLineY - (timeDiff * noteSpeed);

        if (y > -100 && y < canvas.height + 200) {
            ctx.fillStyle = note.type === 'slider' ? '#ff2e63' : '#00fff5';

            if (note.type === 'tap') {
                ctx.fillRect(note.lane * laneWidth + 5, y - 10, laneWidth - 10, 20);
            } else if (note.type === 'slider') {
                const length = note.duration * noteSpeed;
                ctx.globalAlpha = 0.5;
                ctx.fillRect(note.lane * laneWidth + 15, y - length, laneWidth - 30, length);
                ctx.globalAlpha = 1.0;
                ctx.fillRect(note.lane * laneWidth + 5, y - 10, laneWidth - 10, 20);
                ctx.fillRect(note.lane * laneWidth + 5, y - length - 10, laneWidth - 10, 20);
            }
        }
    });

    ctx.fillStyle = '#fff';
    ctx.font = '24px Arial';
    ctx.fillText(`Score: ${score}`, 20, 40);

    if (elapsedTime > audioBuffer.duration) {
        isPlaying = false;
        alert(`Song Finished! Your Score: ${score}`);
        location.reload();
    } else {
        requestAnimationFrame(gameLoop);
    }
}

window.addEventListener('keydown', function(e) {
    const keyIndex = keys.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) {
        checkHit(keyIndex);
    }
});

window.addEventListener('touchstart', function(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const laneClicked = Math.floor(touch.clientX / laneWidth);
        checkHit(laneClicked);
    }
});

function checkHit(lane) {
    if (!isPlaying) return;
    const elapsedTime = audioCtx.currentTime - startTime;
    const hitWindow = 0.15;

    for (let i = 0; i < currentMap.length; i++) {
        const note = currentMap[i];
        if (note.lane === lane && Math.abs(note.time - elapsedTime) < hitWindow) {
            score += 100;
            currentMap.splice(i, 1);
            break;
        }
    }
}
