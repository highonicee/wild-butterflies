/**
 * ui.js
 * Manages all DOM screens, transitions, and user interaction.
 * Communicates via callbacks — no direct Three.js dependency.
 *
 * Fixes applied:
 *  - Removed "A Ritual of Two Names" eyebrow text entirely.
 *  - Fixed cursor-jump bug: second input no longer auto-focuses.
 *  - UI always visible on load (introScreen starts as visible).
 *  - Title changed to "Create a Butterfly for Someone".
 *  - Heart button labelled "Generate Butterfly" via aria-label.
 *  - Clean two-step form: Your Name → Their Name → heart button.
 */

export class UI {
  constructor({ onSummon, onRegenerate, onBack, onSave }) {
    this.onSummon     = onSummon;
    this.onRegenerate = onRegenerate;
    this.onBack       = onBack;
    this.onSave       = onSave;

    this.nameA = '';
    this.nameB = '';

    this._build();
    this._bindEvents();

    // Staggered intro — screen is already visible, just reveal elements
    requestAnimationFrame(() => {
      setTimeout(() => this.introScreen.classList.add('visible'), 80);
      setTimeout(() => this.titleEl.classList.add('show'),        400);
      setTimeout(() => this.line1.classList.add('show'),          750);
      setTimeout(() => this.inputWrapA.classList.add('show'),    1050);
    });
  }

  _build() {
    const app = document.getElementById('app');

    // ── Vignette ──
    const vig = document.createElement('div');
    vig.className = 'vignette';
    app.appendChild(vig);

    // ── Loading ring ──
    this.loadingRing = document.createElement('div');
    this.loadingRing.id = 'loading-ring';
    this.loadingRing.innerHTML = `
      <svg viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="17" stroke="rgba(255,77,109,0.18)" stroke-width="1.2"/>
        <path d="M 20 3 A 17 17 0 0 1 37 20" stroke="#ff4d6d" stroke-width="1.2" stroke-linecap="round"/>
      </svg>`;
    app.appendChild(this.loadingRing);

    // ── Screen 1: Intro ──
    this.introScreen = document.createElement('div');
    this.introScreen.id = 'screen-intro';
    this.introScreen.className = 'screen';

    // Build form without innerHTML to avoid focus/event issues
    this.introScreen.innerHTML = `
      <h1 class="site-title" id="siteTitle">Create a Butterfly<br><em>for Someone</em></h1>

      <p class="prompt-line" id="line1">Your Name</p>
      <div class="input-wrapper" id="inputWrapA">
        <input id="inputA" type="text" maxlength="28" placeholder="your name"
               autocomplete="off" spellcheck="false" />
        <div class="input-glow"></div>
      </div>

      <div class="divider" id="dividerAB"></div>

      <p class="prompt-line" id="line2">Their Name</p>
      <div class="input-wrapper" id="inputWrapB">
        <input id="inputB" type="text" maxlength="28" placeholder="their name"
               autocomplete="off" spellcheck="false" />
        <div class="input-glow"></div>
      </div>

      <button id="heart-btn" aria-label="Generate Butterfly" title="Generate Butterfly">
        Generate Butterfly
      </button>
    `;
    app.appendChild(this.introScreen);

    // ── Screen 2: Butterfly ──
    this.butterflyScreen = document.createElement('div');
    this.butterflyScreen.id = 'screen-butterfly';
    this.butterflyScreen.className = 'screen';
    this.butterflyScreen.innerHTML = `
      <div class="names-display" id="namesDisplay"></div>
      <div class="btn-row">
        <button class="ghost-btn" id="btn-back">Go Back</button>
        <button class="ghost-btn regen-heart" id="btn-regen" title="New Butterfly" aria-label="New Butterfly">
          <svg class="beating-heart" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z"/>
          </svg>
        </button>
        <button class="ghost-btn save" id="btn-save">&#10515; Save Image</button>
      </div>
    `;
    // Music toggle — fixed position, always visible
    this.musicBtn = document.createElement('button');
    this.musicBtn.id = 'btn-music';
    this.musicBtn.innerHTML = '♪';
    this.musicBtn.title = 'Toggle music';
    this.musicBtn.setAttribute('aria-label', 'Toggle ambient music');
    app.appendChild(this.musicBtn);

    // ── "with love, ritika" — top left signature ──
    const sig = document.createElement('a');
    sig.id = 'signature';
    sig.innerHTML = 'with love, <em>ritika</em>';
    sig.href = 'https://github.com/highonicee';
    sig.target = '_blank';
    sig.rel = 'noopener noreferrer';
    sig.title = 'Visit Ritika on GitHub';
    app.appendChild(sig);
    app.appendChild(this.butterflyScreen);

    // ── Cache refs ──
    this.titleEl    = document.getElementById('siteTitle');
    this.line1      = document.getElementById('line1');
    this.line2      = document.getElementById('line2');
    this.inputWrapA = document.getElementById('inputWrapA');
    this.inputWrapB = document.getElementById('inputWrapB');
    this.inputA     = document.getElementById('inputA');
    this.inputB     = document.getElementById('inputB');
    this.dividerAB  = document.getElementById('dividerAB');
    this.heartBtn   = document.getElementById('heart-btn');
    this.namesDisplay = document.getElementById('namesDisplay');
    this.musicPlaying = false;
    this._initMusic();
    // Auto-play on first user interaction anywhere on the page
    this._autoPlayOnInteraction();
  }

  _bindEvents() {
    // After typing first name → reveal second prompt
    // IMPORTANT: never call inputB.focus() here — that causes the cursor-jump bug
    this.inputA.addEventListener('input', () => {
      this.nameA = this.inputA.value.trim();

      if (this.nameA.length >= 1 && !this.line2.classList.contains('show')) {
        setTimeout(() => {
          this.dividerAB.classList.add('show');
          this.line2.classList.add('show');
        }, 200);
        setTimeout(() => {
          this.inputWrapB.classList.add('show');
          // ✅ NO auto-focus on inputB — this was causing the cursor-jump bug
        }, 600);
        setTimeout(() => {
          this.heartBtn.classList.add('show');
        }, 1100);
      }

      this._updateHeartState();
    });

    this.inputB.addEventListener('input', () => {
      this.nameB = this.inputB.value.trim();
      this._updateHeartState();
    });

    // Allow pressing Enter on either input to summon
    this.inputA.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.nameA) {
        // Move focus to second input naturally on Enter
        this.inputB.focus();
      }
    });

    this.inputB.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.nameA && this.nameB) this._triggerSummon();
    });

    this.heartBtn.addEventListener('click', () => {
      if (this.nameA && this.nameB) this._triggerSummon();
    });

    document.getElementById('btn-back').addEventListener('click', () => this._goBack());
    document.getElementById('btn-save').addEventListener('click', () => {
      this.onSave && this.onSave();
    });
    this.musicBtn.addEventListener('click', () => this._toggleMusic());
    document.getElementById('btn-regen').addEventListener('click', () => {
      this.onRegenerate && this.onRegenerate();
    });
  }

  _updateHeartState() {
    const ready = this.nameA.length > 0 && this.nameB.length > 0;
    this.heartBtn.classList.toggle('ready', ready);
  }

  _triggerSummon() {
    if (!this.nameA || !this.nameB) return;

    this.namesDisplay.innerHTML =
      `<em>${this.nameA}</em><span class="heart-sep">♥</span><em>${this.nameB}</em>`;

    this.loadingRing.classList.add('show');

    this.introScreen.classList.add('hidden');
    this.introScreen.classList.remove('visible');

    setTimeout(() => {
      this.loadingRing.classList.remove('show');
      this.onSummon && this.onSummon(this.nameA, this.nameB);
    }, 1600);
  }

  showButterflyScreen() {
    this.butterflyScreen.classList.add('visible');
    this.butterflyScreen.classList.remove('hidden');
  }

  hideButterflyScreen() {
    this.butterflyScreen.classList.remove('visible');
    this.butterflyScreen.classList.add('hidden');
  }

  _goBack() {
    this.hideButterflyScreen();

    // Full reset
    this.nameA = '';
    this.nameB = '';
    this.inputA.value = '';
    this.inputB.value = '';
    this.line2.classList.remove('show');
    this.inputWrapB.classList.remove('show');
    this.dividerAB.classList.remove('show');
    this.heartBtn.classList.remove('show', 'ready');

    setTimeout(() => {
      this.introScreen.classList.add('visible');
      this.introScreen.classList.remove('hidden');
      this.inputA.focus();
    }, 800);

    this.onBack && this.onBack();
  }

  showLoading() { this.loadingRing.classList.add('show'); }
  hideLoading() { this.loadingRing.classList.remove('show'); }

  // ── Auto-play on first interaction ──────────────────────────────────────────
  _autoPlayOnInteraction() {
    const tryPlay = () => {
      if (!this.musicPlaying) {
        this._doPlay();
      }
      document.removeEventListener('click', tryPlay);
      document.removeEventListener('keydown', tryPlay);
      document.removeEventListener('touchstart', tryPlay);
    };
    document.addEventListener('click',      tryPlay, { once: true });
    document.addEventListener('keydown',    tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });
  }

  // ── Ambient music ─────────────────────────────────────────────────────────────
  _initMusic() {
    this._audioFadeId  = null;
    this.musicPlaying  = false;

    this.audio         = document.createElement('audio');
    this.audio.src     = '/song.mp3';
    this.audio.loop    = true;
    this.audio.volume  = 0;
    this.audio.preload = 'auto';
    document.body.appendChild(this.audio);

    this.audio.addEventListener('canplaythrough', () => {
      console.log('✓ song.mp3 loaded and ready');
    });
    this.audio.addEventListener('error', (e) => {
      console.error('✗ song.mp3 not found in /public/ — error:', e.target.error);
      this.musicBtn.style.opacity = '0.35';
      this.musicBtn.title = 'Place song.mp3 in /public/';
    });
  }

  _toggleMusic() {
    if (this.musicPlaying) {
      this._doStop();
      this.musicPlaying = false;
    } else {
      this._doPlay();
    }
    // Note: musicPlaying is set inside _doPlay after promise resolves
    this.musicBtn.classList.toggle('playing', this.musicPlaying);
    this.musicBtn.innerHTML = this.musicPlaying ? '♫' : '♪';
  }

  _doPlay() {
    clearInterval(this._audioFadeId);
    this.audio.volume = 0;
    this.audio.play()
      .then(() => {
        console.log('▶ playing');
        this.musicPlaying = true;
        this.musicBtn.classList.add('playing');
        this.musicBtn.innerHTML = '♫';
        // Fade in
        this._audioFadeId = setInterval(() => {
          if (this.audio.volume < 0.75) {
            this.audio.volume = Math.min(0.75, this.audio.volume + 0.018);
          } else {
            clearInterval(this._audioFadeId);
          }
        }, 60);
      })
      .catch(err => {
        console.error('✗ play() failed:', err);
        this.musicPlaying = false;
        this.musicBtn.classList.remove('playing');
        this.musicBtn.innerHTML = '♪';
      });
  }

  _doStop() {
    clearInterval(this._audioFadeId);
    this._audioFadeId = setInterval(() => {
      if (this.audio.volume > 0.018) {
        this.audio.volume = Math.max(0, this.audio.volume - 0.018);
      } else {
        this.audio.volume = 0;
        this.audio.pause();
        clearInterval(this._audioFadeId);
      }
    }, 60);
  }

  // keep old names in case called elsewhere
  _startMusic() { this._doPlay();  }
  _stopMusic()  { this._doStop();  }
}