const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let audioCtx, audioBuffer, audioSource;
let startTime = 0;
let isPlaying = false;
let currentMap = [];

// Gameplay Stats
let score = 0;
let combo = 0;
let maxCombo = 0;
let lastJudgment = "";
let judgmentTimer = 0;

// Track which lanes are currently being held down (for sliders/visuals)
const activeLanes = [false, false, false, false];

const LANE_COUNT = 4;
const keys = ['d', 'f', 'j', 'k'];
let laneWidth, judgmentLineY;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    laneWidth = canvas.width / LANE_COUNT;
    judgmentLineY = canvas.height * 0.82;
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
            alert("Track Loaded! Choose difficulty to start.");
        });
    };
    reader.readAsArrayBuffer(file);
});

function generateMap(difficulty, duration) {
    const map = [];
    const mobileMode = document.getElementById('mobile-mode').checked;
    
    let noteInterval = 0.4; 
    let sliderChance = 0.25;
    if (difficulty === 'easy') { noteInterval = 0.7; sliderChance = 0.15; }
    if (difficulty === 'hard') { noteInterval = 0.25; sliderChance = 0.35; }

    for (let time = 1.5; time < duration - 2; time += noteInterval) {
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
                    duration: Math.random() * 1.2 + 0.4,
                    hitHead: false,
                    holdScoreTicks: 0
                });
            } else {
                map.push({
                    type: 'tap',
                    lane: lane,
                    time: time
                });
            }
        }
        time += (Math.random() * 0.15 - 0.05);
    }
    return map.sort((a, b) => a.time - b.time);
}

function startGame(difficulty) {
    if (!audioBuffer) return alert("Please upload an audio file first!");
    
    document.getElementById('ui-container').style.display = 'none';
    canvas.style.display = 'block';

    currentMap = generateMap(difficulty, audioBuffer.duration);
    score = 0; combo = 0; maxCombo = 0; lastJudgment = "";
    
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
    
    ctx.fillStyle = '#0d0e15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const elapsedTime = audioCtx.currentTime - startTime;
    const noteSpeed = 550; // Increased speed for snappier rhythm play

    // Draw Lane BG Highlights for active presses
    for(let i=0; i<LANE_COUNT; i++) {
        if(activeLanes[i]) {
            let gradient = ctx.createLinearGradient(0, 0, 0, judgmentLineY);
            gradient.addColorStop(0, "rgba(0, 255, 245, 0)");
            gradient.addColorStop(1, "rgba(0, 255, 245, 0.08)");
            ctx.fillStyle = gradient;
            ctx.fillRect(i * laneWidth, 0, laneWidth, judgmentLineY);
        }
    }

    // Draw Lane Dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 2;
    for (let i = 1; i < LANE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, canvas.height);
        ctx.stroke();
    }

    // Draw Judgment Line
    ctx.strokeStyle = '#00fff5';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00fff5';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, judgmentLineY);
    ctx.lineTo(canvas.width, judgmentLineY);
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset glow

    // Handle Missed Notes & Render Active Notes
    for (let i = currentMap.length - 1; i >= 0; i--) {
        const note = currentMap[i];
        const timeDiff = note.time - elapsedTime;
        const y = judgmentLineY - (timeDiff * noteSpeed);

        // Check for missed tap notes or missed slider starts
        if (timeDiff < -0.20 && !note.hitHead) {
            triggerJudgment("MISS");
            currentMap.splice(i, 1);
            continue;
        }

        // Handle Active Slider Holds
        if (note.type === 'slider' && note.hitHead) {
            const sliderEndTime = note.time + note.duration;
            if (elapsedTime <= sliderEndTime) {
                if (activeLanes[note.lane]) {
                    // Give points periodically while holding
                    score += 1;
                    combo++;
                } else {
                    // Broke the combo by letting go early
                    combo = 0;
                }
                // Keep rendering slider body relative to time remaining
                const remainingLength = (sliderEndTime - elapsedTime) * noteSpeed;
                ctx.fillStyle = 'rgba(255, 46, 99, 0.4)';
                ctx.fillRect(note.lane * laneWidth + 15, judgmentLineY - remainingLength, laneWidth - 30, remainingLength);
                ctx.fillStyle = '#ff2e63';
                ctx.fillRect(note.lane * laneWidth + 5, judgmentLineY - 10, laneWidth - 10, 20);
            } else {
                // Slider successfully held to completion
                triggerJudgment("PERFECT");
                currentMap.splice(i, 1);
            }
            continue;
        }

        // Render standard pending notes
        if (y > -150 && y < canvas.height + 100) {
            if (note.type === 'tap') {
                ctx.fillStyle = '#00fff5';
                ctx.fillRect(note.lane * laneWidth + 8, y - 12, laneWidth - 16, 24);
            } else if (note.type === 'slider') {
                const length = note.duration * noteSpeed;
                ctx.fillStyle = 'rgba(255, 46, 99, 0.4)';
                ctx.fillRect(note.lane * laneWidth + 15, y - length, laneWidth - 30, length);
                ctx.fillStyle = '#ff2e63';
                ctx.fillRect(note.lane * laneWidth + 8, y - 12, laneWidth - 16, 24);
                ctx.fillRect(note.lane * laneWidth + 12, y - length - 6, laneWidth - 24, 12);
            }
        }
    }

    // UI HUD Text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`SCORE: ${score.toLocaleString()}`, 30, 45);

    if (combo > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff2e63';
        ctx.font = 'italic bold 28px sans-serif';
        ctx.fillText(`${combo}`, canvas.width / 2, canvas.height * 0.4);
        ctx.fillStyle = '#rgba(255,255,255,0.6)';
        ctx.font = '14px sans-serif';
        ctx.fillText(`COMBO`, canvas.width / 2, canvas.height * 0.43);
    }

    if (judgmentTimer > 0) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px sans-serif';
        if (lastJudgment === "PERFECT") ctx.fillStyle = '#00fff5';
        else if (lastJudgment === "GREAT") ctx.fillStyle = '#f9d56e';
        else ctx.fillStyle = '#ff2e63';
        
        ctx.fillText(lastJudgment, canvas.width / 2, canvas.height * 0.5);
        judgmentTimer--;
    }
    ctx.textAlign = 'left'; // Reset

    if (elapsedTime > audioBuffer.duration) {
        isPlaying = false;
        alert(`Song Finished!\nFinal Score: ${score}\nMax Combo: ${maxCombo}`);
        location.reload();
    } else {
        requestAnimationFrame(gameLoop);
    }
}

function triggerJudgment(type) {
    lastJudgment = type;
    judgmentTimer = 25; // Frame display window
    if (type === "MISS") {
        combo = 0;
    } else {
        combo++;
        if (combo > maxCombo) maxCombo = combo;
    }
}

// Input Handling Matrix (Keyboard)
window.addEventListener('keydown', function(e) {
    const keyIndex = keys.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1 && !activeLanes[keyIndex]) {
        activeLanes[keyIndex] = true;
        checkHit(keyIndex);
    }
});
window.addEventListener('keyup', function(e) {
    const keyIndex = keys.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) activeLanes[keyIndex] = false;
});

// Input Handling Matrix (Mobile Tapping)
window.addEventListener('touchstart', function(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const laneIdx = Math.floor(touch.clientX / laneWidth);
        if(laneIdx >= 0 && laneIdx < LANE_COUNT) {
            activeLanes[laneIdx] = true;
            checkHit(laneIdx);
        }
    }
}, {passive: false});

window.addEventListener('touchend', function(e) {
    e.preventDefault();
    // Reset lanes that are no longer actively touched
    for (let i = 0; i < LANE_COUNT; i++) activeLanes[i] = false;
    for (let i = 0; i < e.touches.length; i++) {
        const laneIdx = Math.floor(e.touches[i].clientX / laneWidth);
        if(laneIdx >= 0 && laneIdx < LANE_COUNT) activeLanes[laneIdx] = true;
    }
}, {passive: false});

// Strict Rhythm Plus/Project Sekai Window Accuracy Calculator
function checkHit(lane) {
    if (!isPlaying) return;
    const elapsedTime = audioCtx.currentTime - startTime;

    for (let i = 0; i < currentMap.length; i++) {
        const note = currentMap[i];
        if (note.lane !== lane) continue;

        const diff = Math.abs(note.time - elapsedTime);

        if (note.type === 'tap' && diff < 0.16) {
            evaluateAccuracy(diff);
            currentMap.splice(i, 1);
            break;
        } else if (note.type === 'slider' && !note.hitHead && diff < 0.16) {
            evaluateAccuracy(diff);
            note.hitHead = true; // Flips state to verify it's being anchored down
            break;
        }
    }
}

function evaluateAccuracy(diff) {
    if (diff <= 0.05) { score += 300; triggerJudgment("PERFECT"); }
    else if (diff <= 0.11) { score += 150; triggerJudgment("GREAT"); }
    else { score += 50; triggerJudgment("GOOD"); }
}
