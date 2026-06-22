import Matter from 'matter-js';
import confetti from 'canvas-confetti';

const { Engine, Render, Runner, World, Bodies, Body, Events, Vector, Composite } = Matter;

export class Game {
  constructor() {
    this.engine = null;
    this.render = null;
    this.runner = null;
    this.blocks = [];
    this.ball = null;
    this.bell = null;
    
    this.score = 0;
    this.shotsLeft = 3;
    this.blocksLeft = 5;
    this.isTurnActive = false;
    
    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    this.draggingBlock = null;
    
    this.onGameOver = null;
    
    const container = document.getElementById('canvas-container');
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;
    
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;
        
        if (this.render) {
          this.render.canvas.width = this.width * window.devicePixelRatio;
          this.render.canvas.height = this.height * window.devicePixelRatio;
          this.render.options.width = this.width;
          this.render.options.height = this.height;
          Matter.Render.lookAt(this.render, {
            min: { x: 0, y: 0 },
            max: { x: this.width, y: this.height }
          });
        }
        
        if (this.walls) {
          const thickness = 200;
          Body.setPosition(this.walls.top, { x: this.width / 2, y: -thickness/2 });
          Body.setPosition(this.walls.bottom, { x: this.width / 2, y: this.height + thickness/2 });
          Body.setPosition(this.walls.left, { x: -thickness/2, y: this.height / 2 });
          Body.setPosition(this.walls.right, { x: this.width + thickness/2, y: this.height / 2 });
        }
        
        if (this.bell) {
          this.createBell();
        }
      }, 150); // Debounce resize to prevent jitter and excessive re-renders
    });
    
    this.initPhysics();
  }

  initPhysics() {
    this.engine = Engine.create({
      positionIterations: 10,
      velocityIterations: 10
    });
    this.engine.world.gravity.y = 0; 

    const container = document.getElementById('canvas-container');
    
    this.render = Render.create({
      element: container,
      engine: this.engine,
      options: {
        width: this.width,
        height: this.height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio
      }
    });

    // Create walls (make them very thick and bouncy to prevent going out of bounds)
    const wallOptions = { isStatic: true, render: { fillStyle: '#1e293b' }, restitution: 1.0, friction: 0, frictionStatic: 0 };
    const thickness = 200;
    
    this.walls = {
      top: Bodies.rectangle(this.width / 2, -thickness/2, this.width * 2, thickness, wallOptions),
      bottom: Bodies.rectangle(this.width / 2, this.height + thickness/2, this.width * 2, thickness, wallOptions),
      left: Bodies.rectangle(-thickness/2, this.height / 2, thickness, this.height * 2, wallOptions),
      right: Bodies.rectangle(this.width + thickness/2, this.height / 2, thickness, this.height * 2, wallOptions)
    };
    
    World.add(this.engine.world, Object.values(this.walls));

    // Custom Drag Logic (Mobile-friendly Pointer Events)
    const canvas = this.render.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.isTurnActive) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking on an existing block to reposition it
      const clickedBlock = this.blocks.find(b => Matter.Bounds.contains(b.body.bounds, {x, y}));
      if (clickedBlock) {
        this.draggingBlock = clickedBlock;
        // Disable collisions while dragging to prevent pushing the ball
        this.draggingBlock.body.collisionFilter.mask = 0;
        return;
      }

      if (this.shotsLeft <= 0) return;
      
      this.isDragging = true;
      this.dragStart = { x, y };
      this.dragCurrent = { x, y };
    });
    
    window.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (this.draggingBlock) {
        // Move the block with the mouse
        Body.setPosition(this.draggingBlock.body, { x, y });
        
        // Optional: Provide visual feedback if it's too close to the ball
        const dist = Vector.magnitude(Vector.sub({x, y}, this.ball.position));
        if (dist < 60) {
          this.draggingBlock.body.render.strokeStyle = '#f43f5e'; // Red border
        } else {
          this.draggingBlock.body.render.strokeStyle = '#fff';
        }
      } else if (this.isDragging) {
        this.dragCurrent = { x, y };
      }
    });
    
    window.addEventListener('pointerup', (e) => {
      if (this.draggingBlock) {
        // Restore collisions
        this.draggingBlock.body.collisionFilter.mask = 0xFFFFFFFF;
        
        // Drop the block
        const dist = Vector.magnitude(Vector.sub(this.draggingBlock.body.position, this.ball.position));
        this.draggingBlock.body.render.strokeStyle = '#fff'; // Reset border
        
        // If dropped too close to ball, collect it back into inventory
        if (dist < 60) {
          World.remove(this.engine.world, this.draggingBlock.body);
          this.blocks = this.blocks.filter(b => b !== this.draggingBlock);
          this.blocksLeft++;
          this.updateHUD();
        }
        
        this.draggingBlock = null;
        return;
      }

      if (this.isDragging) {
        this.isDragging = false;
        const dx = this.dragStart.x - this.dragCurrent.x;
        const dy = this.dragStart.y - this.dragCurrent.y;
        
        // Only launch if dragged a minimum distance
        if (Math.hypot(dx, dy) > 10) {
          this.isTurnActive = true;
          this.shotsLeft--;
          this.updateHUD();
          
          // Apply a constant force regardless of drag distance
          const dist = Math.hypot(dx, dy);
          const forceMagnitude = 0.2; // Adjust for the desired 'constant' speed
          const force = { x: (dx / dist) * forceMagnitude, y: (dy / dist) * forceMagnitude };
          Body.applyForce(this.ball, this.ball.position, force);
          
          this.checkTurnEnd();
        }
      }
    });

    // Draw the arrow
    Events.on(this.render, 'afterRender', () => {
      if (this.isDragging && this.dragStart && this.dragCurrent && this.ball) {
        const ctx = this.render.context;
        const dx = this.dragStart.x - this.dragCurrent.x;
        const dy = this.dragStart.y - this.dragCurrent.y;
        
        const startX = this.ball.position.x;
        const startY = this.ball.position.y;
        // Limit arrow length for visual consistency
        const maxDrawLen = 200;
        let drawLen = Math.hypot(dx, dy);
        let scale = 1;
        if (drawLen > maxDrawLen) {
          scale = maxDrawLen / drawLen;
        }
        
        const endX = startX + dx * scale;
        const endY = startY + dy * scale;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 5;
        ctx.stroke();
        
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 15 * Math.cos(angle - Math.PI / 6), endY - 15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 15 * Math.cos(angle + Math.PI / 6), endY - 15 * Math.sin(angle + Math.PI / 6));
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
      }
    });

    // Collision events
    Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        // Check if bodyA or bodyB is the ball
        const isBallA = pairs[i].bodyA === this.ball;
        const isBallB = pairs[i].bodyB === this.ball;
        const isBall = isBallA || isBallB;

        // The bell is a composite, so we check if bodyA or bodyB is one of its parts
        const isBellPartA = this.bell && this.bell.parts.includes(pairs[i].bodyA);
        const isBellPartB = this.bell && this.bell.parts.includes(pairs[i].bodyB);
        const isBellHit = isBellPartA || isBellPartB;

        if (isBall && isBellHit) {
          this.hitBell();
        }

        this.blocks.forEach(block => {
          if (pairs[i].bodyA === block.body || pairs[i].bodyB === block.body) {
            this.hitBlock(block);
          }
        });
      }
    });

    Events.on(this.engine, 'beforeUpdate', () => {
      // Cap maximum speed to prevent tunneling (going out of bounds or through the bell)
      if (this.ball) {
        const maxSpeed = 25; // Lowered to ensure CCD catches it
        const speed = Vector.magnitude(this.ball.velocity);
        if (speed > maxSpeed) {
          Body.setVelocity(this.ball, Vector.mult(Vector.normalise(this.ball.velocity), maxSpeed));
        }
      }
    });

    Render.run(this.render);
    this.runner = Runner.create();
  }

  createBall() {
    if (this.ball) {
      World.remove(this.engine.world, this.ball);
    }
    // Fixed start position
    const startX = 150;
    const startY = this.height / 2;
    this.ball = Bodies.circle(startX, startY, 20, {
      restitution: 0.95, 
      frictionAir: 0.002, // Less air friction = faster
      friction: 0, // No surface friction to prevent sticking
      frictionStatic: 0, 
      bullet: true, // Enable continuous collision detection
      render: {
        fillStyle: '#f43f5e',
        strokeStyle: '#fff',
        lineWidth: 3
      }
    });
    World.add(this.engine.world, this.ball);
  }

  createBell() {
    if (this.bell) {
      World.remove(this.engine.world, this.bell);
    }
    
    const bx = this.width - 150;
    const by = this.height / 2;
    
    const style = { fillStyle: '#eab308', strokeStyle: '#ca8a04', lineWidth: 3 };
    const options = { render: style, friction: 0, frictionStatic: 0, restitution: 0.9 };
    
    // Create bell shape parts (taller vertically, and overlapping to prevent physics bugs)
    const handle = Bodies.circle(bx, by - 80, 15, options);
    const top = Bodies.trapezoid(bx, by - 20, 80, 130, 0.4, options);
    const rim = Bodies.rectangle(bx, by + 40, 110, 30, { ...options, chamfer: { radius: 10 } });
    
    // Combine into a single body
    this.bell = Body.create({
      parts: [handle, top, rim],
      isStatic: true
    });
    
    World.add(this.engine.world, this.bell);
  }

  startNewGame() {
    Runner.stop(this.runner);
    
    this.score = 0;
    this.shotsLeft = 3;
    this.blocksLeft = 5;
    this.isTurnActive = false;
    this.isDragging = false;
    this.draggingBlock = null;
    
    this.blocks.forEach(b => World.remove(this.engine.world, b.body));
    this.blocks = [];
    
    this.createBall();
    this.createBell();
    
    this.updateHUD(); // Call updateHUD to update dragger state
    Runner.run(this.runner, this.engine);
  }

  retryGame(keepBlocks) {
    Runner.stop(this.runner);
    
    this.score = 0;
    this.shotsLeft = 3;
    this.isTurnActive = false;
    this.isDragging = false;
    this.draggingBlock = null;
    
    this.createBall();
    
    if (!keepBlocks) {
      this.blocks.forEach(b => World.remove(this.engine.world, b.body));
      this.blocks = [];
      this.blocksLeft = 5;
    } else {
      // Keep blocks, but auto-collect any that are too close to the ball's fixed start position
      const ballPos = {x: 150, y: this.height / 2};
      this.blocks = this.blocks.filter(b => {
        const dist = Vector.magnitude(Vector.sub(b.body.position, ballPos));
        if (dist < 60) {
          World.remove(this.engine.world, b.body);
          this.blocksLeft++;
          return false;
        }
        b.hits = 0;
        b.body.render.opacity = 1;
        return true;
      });
    }
    
    this.createBell();
    
    this.updateHUD();
    Runner.run(this.runner, this.engine);
  }

  pauseGame() {
    Runner.stop(this.runner);
  }

  resumeGame() {
    Runner.run(this.runner, this.engine);
  }

  stopGame() {
    Runner.stop(this.runner);
  }

  placeBlock(x, y) {
    if (this.isTurnActive) return; // Cannot place blocks while the ball is moving

    const dist = Vector.magnitude(Vector.sub({x, y}, this.ball.position));
    if (dist < 60) return; // Prevent placing on ball

    const blockBody = Bodies.rectangle(x, y, 60, 60, {
      isStatic: true,
      restitution: 1.0, // Reduced from 1.2 to prevent exponential speed gain
      friction: 0, // Prevent ball from sticking
      frictionStatic: 0,
      render: {
        fillStyle: '#10b981',
        strokeStyle: '#fff',
        lineWidth: 2
      }
    });
    
    World.add(this.engine.world, blockBody);
    this.blocks.push({ body: blockBody, hits: 0, maxHits: 3 });
    
    this.blocksLeft--;
    this.updateHUD();
  }

  hitBell() {
    this.score += 100;
    this.updateHUD();
    
    this.hitStop();
    this.spawnConfetti(this.ball.position.x, this.ball.position.y);
  }

  hitBlock(block) {
    block.hits++;
    block.body.render.opacity = 1 - (block.hits / block.maxHits) * 0.5;
    
    if (block.hits >= block.maxHits) {
      World.remove(this.engine.world, block.body);
      this.blocks = this.blocks.filter(b => b !== block);
      this.spawnConfetti(block.body.position.x, block.body.position.y, ['#10b981', '#059669']);
    }
  }

  hitStop() {
    this.engine.timing.timeScale = 0.3; // Less drastic to prevent physics tunneling
    setTimeout(() => {
      if (this.engine) this.engine.timing.timeScale = 1;
    }, 50);
  }

  spawnConfetti(x, y, colors = ['#f43f5e', '#38bdf8', '#fbbf24'], particleCount = 30) {
    const rx = x / this.width;
    const ry = y / this.height;
    
    confetti({
      particleCount: particleCount,
      spread: 70,
      origin: { x: rx, y: ry },
      colors: colors,
      zIndex: 100,
      disableForReducedMotion: true
    });
  }

  checkTurnEnd() {
    // Reset friction when turn starts
    this.ball.frictionAir = 0.002;
    
    const checkInterval = setInterval(() => {
      const speed = Vector.magnitude(this.ball.velocity);
      
      // Smooth braking: slightly weaker braking than before for a more natural stop
      if (speed < 2.5 && speed > 0.05) {
        this.ball.frictionAir = 0.03; // Weak brake
      }
      
      // Stop completely when it's very slow
      if (speed <= 0.05) {
        clearInterval(checkInterval);
        
        // Ensure ball comes to a complete stop
        Body.setVelocity(this.ball, {x: 0, y: 0});
        Body.setAngularVelocity(this.ball, 0);
        this.ball.frictionAir = 0.002; // Reset for next shot
        
        if (this.shotsLeft <= 0) {
          setTimeout(() => {
            if (this.onGameOver) this.onGameOver(this.score);
          }, 1000);
        } else {
          // Just end the turn, do not reset the ball position so next shot starts from here
          this.isTurnActive = false;
          this.updateHUD(); // Enable blocks again
        }
      }
    }, 100);
  }

  updateHUD() {
    document.getElementById('score-val').innerText = this.score;
    document.getElementById('shots-val').innerText = this.shotsLeft;
    document.getElementById('blocks-left').innerText = this.blocksLeft;
    
    const dragger = document.getElementById('block-dragger');
    if (this.blocksLeft <= 0 || this.isTurnActive) {
      dragger.classList.add('disabled');
      dragger.setAttribute('draggable', 'false');
    } else {
      dragger.classList.remove('disabled');
      dragger.setAttribute('draggable', 'true');
    }
  }
}
