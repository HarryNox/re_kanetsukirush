import './style.css';
import { Game } from './game.js';

document.addEventListener('DOMContentLoaded', () => {
  const screens = {
    title: document.getElementById('screen-title'),
    howTo: document.getElementById('screen-how-to'),
    credits: document.getElementById('screen-credits'),
    game: document.getElementById('screen-game'),
    gameOver: document.getElementById('screen-game-over'),
    pause: document.getElementById('screen-pause'),
  };

  const btnSettings = document.getElementById('btn-settings');
  const gameInstance = new Game();
  let currentScreen = 'title';

  function showScreen(screenId) {
    Object.values(screens).forEach(screen => {
      screen.classList.add('hidden');
      screen.classList.remove('active');
    });
    screens[screenId].classList.remove('hidden');
    screens[screenId].classList.add('active');
    currentScreen = screenId;

    // Show gear button on all screens except title
    if (screenId === 'title' || screenId === 'pause') {
      btnSettings.classList.add('hidden');
    } else {
      btnSettings.classList.remove('hidden');
    }
  }

  // Title Screen Buttons
  document.getElementById('btn-play').addEventListener('click', () => {
    showScreen('game');
    gameInstance.startNewGame();
  });

  document.getElementById('btn-how-to').addEventListener('click', () => {
    showScreen('howTo');
  });

  document.getElementById('btn-credits').addEventListener('click', () => {
    showScreen('credits');
  });

  // Back Buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      gameInstance.stopGame();
      showScreen('title');
    });
  });

  // Settings / Gear Button
  btnSettings.addEventListener('click', () => {
    if (currentScreen === 'game') {
      gameInstance.pauseGame();
    }
    showScreen('pause');
  });

  // Pause Menu Buttons
  document.getElementById('btn-resume').addEventListener('click', () => {
    showScreen('game');
    gameInstance.resumeGame();
  });
  document.getElementById('btn-pause-retry').addEventListener('click', () => {
    showScreen('game');
    gameInstance.retryGame(false);
  });
  document.getElementById('btn-pause-title').addEventListener('click', () => {
    gameInstance.stopGame();
    showScreen('title');
  });

  // Game Over Buttons
  document.getElementById('btn-retry-keep').addEventListener('click', () => {
    showScreen('game');
    gameInstance.retryGame(true); // Keep blocks
  });

  document.getElementById('btn-retry-reset').addEventListener('click', () => {
    showScreen('game');
    gameInstance.retryGame(false); // Reset blocks
  });

  // Setup Mobile-Friendly Drag and Drop for UI to Canvas
  const dragger = document.getElementById('block-dragger');
  const canvasContainer = document.getElementById('canvas-container');
  let activeGhost = null;

  dragger.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (gameInstance.blocksLeft <= 0 || gameInstance.isTurnActive) return;

    activeGhost = document.createElement('div');
    activeGhost.className = 'draggable-block';
    activeGhost.style.position = 'fixed';
    activeGhost.style.pointerEvents = 'none';
    activeGhost.style.zIndex = '9999';
    activeGhost.style.opacity = '0.7';
    activeGhost.style.left = (e.clientX - 25) + 'px';
    activeGhost.style.top = (e.clientY - 10) + 'px';
    document.body.appendChild(activeGhost);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  function onPointerMove(e) {
    if (!activeGhost) return;
    activeGhost.style.left = (e.clientX - 25) + 'px';
    activeGhost.style.top = (e.clientY - 10) + 'px';
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (!activeGhost) return;
    
    document.body.removeChild(activeGhost);
    activeGhost = null;

    const rect = canvasContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      if (gameInstance.isTurnActive || gameInstance.blocksLeft <= 0) return;

      if (gameInstance.ball) {
        const dx = x - gameInstance.ball.position.x;
        const dy = y - gameInstance.ball.position.y;
        if (Math.hypot(dx, dy) < 60) return; // Too close to ball
      }
      gameInstance.placeBlock(x, y);
    }
  }

  // Expose gameOver callback to Game instance
  gameInstance.onGameOver = (score) => {
    document.getElementById('final-score-val').innerText = score;
    showScreen('gameOver');
  };
});
