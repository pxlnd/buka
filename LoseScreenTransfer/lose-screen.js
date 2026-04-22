(function(global) {
  'use strict';

  var DEFAULT_HIDE_DELAY_MS = 220;

  function toBool(value) {
    if (value === true || value === false) return value;
    if (typeof value === 'number') return value !== 0;
    var str = String(value || '').trim().toLowerCase();
    return str === 'true' || str === '1' || str === 'yes';
  }

  function formatSeconds(value) {
    var total = Math.max(0, parseInt(value, 10) || 0);
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function joinUrl(base, file) {
    if (!file) return base;
    if (/^(?:https?:)?\/\//i.test(file) || file.indexOf('data:') === 0 || file.charAt(0) === '/') {
      return file;
    }
    var normalized = String(base || './assets').replace(/\/+$/, '');
    return normalized + '/' + String(file).replace(/^\/+/, '');
  }

  function resolveScriptBase(scriptFileName) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].getAttribute('src') || '';
      if (!src) continue;
      if (src.indexOf(scriptFileName) !== -1) {
        var idx = src.lastIndexOf('/');
        return idx >= 0 ? src.slice(0, idx + 1) : './';
      }
    }
    return './';
  }

  function ensureStylesheet(href) {
    if (!href) return;
    if (document.querySelector('link[data-lose-screen-style="1"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-lose-screen-style', '1');
    document.head.appendChild(link);
  }

  function LoseScreen(options) {
    var opts = options || {};
    this._scriptBase = resolveScriptBase('lose-screen.js');

    this.assetBasePath = opts.assetBasePath || joinUrl(this._scriptBase.replace(/\/$/, ''), 'assets');
    this.stylesheetPath = opts.stylesheetPath || joinUrl(this._scriptBase.replace(/\/$/, ''), 'lose-screen.css');
    this.injectStyles = opts.injectStyles !== false;

    this.handlers = {
      onShow: opts.onShow,
      onHide: opts.onHide,
      onRewardRequest: opts.onRewardRequest,
      onRewardResult: opts.onRewardResult,
      onSoftRevive: opts.onSoftRevive,
      onRestart: opts.onRestart,
      onClose: opts.onClose,
      onPurchase: opts.onPurchase,
      onStateChange: opts.onStateChange
    };

    this.state = {
      coinsCount: Math.max(0, parseInt(opts.coins, 10) || 0),
      heartsCount: Math.max(0, parseInt(opts.hearts, 10) || 0),
      heartsMaxCount: Math.max(0, parseInt(opts.maxHearts, 10) || 5),
      heartsRecoverySeconds: Math.max(0, parseInt(opts.heartsRecoverySeconds, 10) || 0),
      livesTimerText: typeof opts.livesTimer === 'string' ? opts.livesTimer : '--:--',
      timeOutCoinsCost: Math.max(0, parseInt(opts.timeOutCoinsCost, 10) || 0),
      isSubscribed: toBool(opts.isSubscribed),
      visible: false
    };

    this._hideTimer = null;
    this._recoveryTimerId = null;

    if (this.injectStyles) ensureStylesheet(this.stylesheetPath);

    this.mountNode = opts.mount && opts.mount.nodeType === 1 ? opts.mount : document.body;
    this.root = this._createMarkup();
    this.mountNode.appendChild(this.root);

    this.refs = this._collectRefs();
    this._hydrateAssets();
    this._bindEvents();

    this._renderAll();

    if (this.state.heartsRecoverySeconds > 0) {
      this._ensureHeartsRecoveryTicker();
    }
  }

  LoseScreen.prototype._createMarkup = function() {
    var container = document.createElement('div');
    container.className = 'ls-overlay';
    container.setAttribute('aria-hidden', 'true');
    container.innerHTML = [
      '<div class="ls-top-bar" aria-label="Resources">',
        '<div class="ls-resource ls-resource-hearts">',
          '<img class="ls-resource-bg" data-ls-src="heart.png" alt="">',
          '<span class="ls-heart-count">0</span>',
          '<span class="ls-heart-status">FULL</span>',
        '</div>',
        '<div class="ls-resource ls-resource-coins">',
          '<img class="ls-resource-bg" data-ls-src="coins.png" alt="">',
          '<span class="ls-coins-value">0</span>',
        '</div>',
      '</div>',
      '<div class="ls-modal" role="dialog" aria-modal="true" aria-label="Out of time">',
        '<button type="button" class="ls-close" aria-label="Close">&times;</button>',
        '<div class="ls-title">OUT OF TIME!</div>',
        '<div class="ls-subtitle"><span>Revive</span> to keep playing</div>',
        '<div class="ls-card">',
          '<img class="ls-clock-image" data-ls-src="timer.png" alt="+60 seconds">',
          '<div class="ls-actions">',
            '<button type="button" class="ls-action-btn ls-soft-btn" aria-label="Revive for coins">',
              '<img data-ls-src="coins_button.png" alt="">',
              '<span class="ls-coin-cost">0</span>',
            '</button>',
            '<button type="button" class="ls-action-btn ls-reward-btn" aria-label="Revive free by ad">',
              '<img data-ls-src="ads_button.png" alt="">',
              '<span class="ls-reward-label">FREE</span>',
            '</button>',
          '</div>',
        '</div>',
        '<button type="button" class="ls-hidden-restart" aria-hidden="true" tabindex="-1">Restart</button>',
      '</div>',
      '<div class="ls-offer">',
        '<img data-ls-src="Offer.png" alt="Premium offer">',
        '<button type="button" class="ls-offer-purchase" aria-label="Purchase premium">',
          '<img data-ls-src="purchase_button.png" alt="">',
        '</button>',
      '</div>'
    ].join('');

    return container;
  };

  LoseScreen.prototype._collectRefs = function() {
    return {
      heartCount: this.root.querySelector('.ls-heart-count'),
      heartStatus: this.root.querySelector('.ls-heart-status'),
      coinsValue: this.root.querySelector('.ls-coins-value'),
      coinCost: this.root.querySelector('.ls-coin-cost'),
      rewardButton: this.root.querySelector('.ls-reward-btn'),
      softButton: this.root.querySelector('.ls-soft-btn'),
      closeButton: this.root.querySelector('.ls-close'),
      restartButton: this.root.querySelector('.ls-hidden-restart'),
      purchaseButton: this.root.querySelector('.ls-offer-purchase'),
      offer: this.root.querySelector('.ls-offer')
    };
  };

  LoseScreen.prototype._hydrateAssets = function() {
    var scope = this;
    var nodes = this.root.querySelectorAll('[data-ls-src]');
    nodes.forEach(function(node) {
      var file = node.getAttribute('data-ls-src');
      node.src = joinUrl(scope.assetBasePath, file);
      node.removeAttribute('data-ls-src');
    });
  };

  LoseScreen.prototype._emit = function(name, payload) {
    var cb = this.handlers[name];
    if (typeof cb !== 'function') return undefined;
    try {
      return cb(payload, this);
    } catch (error) {
      setTimeout(function() {
        throw error;
      }, 0);
      return undefined;
    }
  };

  LoseScreen.prototype._notifyStateChange = function() {
    this._emit('onStateChange', this.getState());
  };

  LoseScreen.prototype._bindEvents = function() {
    var scope = this;

    this.refs.rewardButton.addEventListener('click', function() {
      scope._emit('onRewardRequest', scope.getState());
    });

    this.refs.softButton.addEventListener('click', function() {
      if (scope.state.coinsCount < scope.state.timeOutCoinsCost) return;
      scope.state.coinsCount -= scope.state.timeOutCoinsCost;
      scope._renderCoins();
      scope._renderSoftButtonState();
      scope._notifyStateChange();

      var result = scope._emit('onSoftRevive', {
        addedSeconds: 60,
        spentCoins: scope.state.timeOutCoinsCost,
        state: scope.getState()
      });

      if (result !== false) scope.hide();
    });

    this.refs.restartButton.addEventListener('click', function() {
      if (scope.state.heartsCount <= 0) return;
      scope.state.heartsCount -= 1;
      scope._renderHearts();
      scope._notifyStateChange();

      var result = scope._emit('onRestart', scope.getState());
      if (result !== false) scope.hide();
    });

    this.refs.closeButton.addEventListener('click', function() {
      var result = scope._emit('onClose', scope.getState());
      if (result !== false) scope.hide();
    });

    this.refs.purchaseButton.addEventListener('click', function() {
      scope._emit('onPurchase', scope.getState());
    });
  };

  LoseScreen.prototype._ensureHeartsRecoveryTicker = function() {
    var scope = this;
    if (this._recoveryTimerId || this.state.heartsRecoverySeconds <= 0) return;
    this._recoveryTimerId = setInterval(function() {
      if (scope.state.heartsRecoverySeconds <= 0) {
        scope._stopHeartsRecoveryTicker();
        return;
      }
      scope.state.heartsRecoverySeconds -= 1;
      scope._renderHearts();
      scope._notifyStateChange();
    }, 1000);
  };

  LoseScreen.prototype._stopHeartsRecoveryTicker = function() {
    if (!this._recoveryTimerId) return;
    clearInterval(this._recoveryTimerId);
    this._recoveryTimerId = null;
  };

  LoseScreen.prototype._renderCoins = function() {
    this.refs.coinsValue.textContent = String(this.state.coinsCount);
    this.refs.coinCost.textContent = String(this.state.timeOutCoinsCost);
  };

  LoseScreen.prototype._renderHearts = function() {
    this.refs.heartCount.textContent = String(this.state.heartsCount);

    if (this.state.heartsCount >= this.state.heartsMaxCount) {
      this._stopHeartsRecoveryTicker();
      this.refs.heartStatus.textContent = 'FULL';
      this.refs.heartStatus.classList.remove('not-full');
      return;
    }

    var timerText = this.state.livesTimerText || (this.state.heartsRecoverySeconds > 0
      ? formatSeconds(this.state.heartsRecoverySeconds)
      : '--:--');

    this.refs.heartStatus.textContent = timerText;
    this.refs.heartStatus.classList.add('not-full');
  };

  LoseScreen.prototype._renderOffer = function() {
    this.refs.offer.hidden = !!this.state.isSubscribed;
  };

  LoseScreen.prototype._renderSoftButtonState = function() {
    var disabled = this.state.coinsCount < this.state.timeOutCoinsCost;
    this.refs.softButton.disabled = disabled;
    this.refs.softButton.classList.toggle('is-disabled', disabled);
    this.refs.softButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  };

  LoseScreen.prototype._renderAll = function() {
    this._renderCoins();
    this._renderHearts();
    this._renderOffer();
    this._renderSoftButtonState();
  };

  LoseScreen.prototype.show = function() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    this.state.visible = true;
    this._renderAll();

    this.root.style.display = 'flex';
    this.root.setAttribute('aria-hidden', 'false');

    var scope = this;
    requestAnimationFrame(function() {
      if (!scope.state.visible) return;
      scope.root.style.opacity = '1';
    });

    this._emit('onShow', this.getState());
  };

  LoseScreen.prototype.hide = function() {
    if (!this.state.visible) return;
    this.state.visible = false;
    this.root.style.opacity = '0';

    var scope = this;
    this._hideTimer = setTimeout(function() {
      scope._hideTimer = null;
      if (scope.state.visible) return;
      scope.root.style.display = 'none';
      scope.root.setAttribute('aria-hidden', 'true');
      scope._emit('onHide', scope.getState());
    }, DEFAULT_HIDE_DELAY_MS);
  };

  LoseScreen.prototype.rewardResult = function(value) {
    var success = value === true || String(value).toLowerCase() === 'true';
    var result = this._emit('onRewardResult', {
      success: success,
      state: this.getState()
    });

    if (success && result !== false) {
      this.hide();
    }
  };

  LoseScreen.prototype.setHandlers = function(handlers) {
    if (!handlers || typeof handlers !== 'object') return;
    for (var key in handlers) {
      if (!Object.prototype.hasOwnProperty.call(handlers, key)) continue;
      this.handlers[key] = handlers[key];
    }
  };

  LoseScreen.prototype.setCoins = function(value) {
    this.state.coinsCount = Math.max(0, parseInt(value, 10) || 0);
    this._renderCoins();
    this._renderSoftButtonState();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setHearts = function(value) {
    this.state.heartsCount = Math.max(0, parseInt(value, 10) || 0);
    this._renderHearts();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setTimeOutCoinsCost = function(value) {
    this.state.timeOutCoinsCost = Math.max(0, parseInt(value, 10) || 0);
    this._renderCoins();
    this._renderSoftButtonState();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setHeartsMax = function(value) {
    this.state.heartsMaxCount = Math.max(0, parseInt(value, 10) || 0);
    this._renderHearts();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setMaxHearts = function(value) {
    this.setHeartsMax(value);
  };

  LoseScreen.prototype.setMaxLives = function(value) {
    this.setHeartsMax(value);
  };

  LoseScreen.prototype.setHeartRecoverySeconds = function(value) {
    this.state.heartsRecoverySeconds = Math.max(0, parseInt(value, 10) || 0);

    if (this.state.heartsRecoverySeconds > 0) {
      this._ensureHeartsRecoveryTicker();
    } else {
      this._stopHeartsRecoveryTicker();
    }

    this._renderHearts();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setHeartsRecoverySeconds = function(value) {
    this.setHeartRecoverySeconds(value);
  };

  LoseScreen.prototype.setLivesTimer = function(value) {
    this.state.livesTimerText = String(value || '--:--');
    this._renderHearts();
    this._notifyStateChange();
  };

  LoseScreen.prototype.setSubscriptionStatus = function(value) {
    this.state.isSubscribed = toBool(value);
    this._renderOffer();
    this._notifyStateChange();
  };

  LoseScreen.prototype.getState = function() {
    return {
      coinsCount: this.state.coinsCount,
      heartsCount: this.state.heartsCount,
      heartsMaxCount: this.state.heartsMaxCount,
      heartsRecoverySeconds: this.state.heartsRecoverySeconds,
      livesTimerText: this.state.livesTimerText,
      timeOutCoinsCost: this.state.timeOutCoinsCost,
      isSubscribed: this.state.isSubscribed,
      visible: this.state.visible
    };
  };

  LoseScreen.prototype.destroy = function() {
    this.hide();
    this._stopHeartsRecoveryTicker();

    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }

    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  };

  global.LoseScreen = LoseScreen;
})(window);
