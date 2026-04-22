# LoseScreen Transfer

Self-contained LoseScreen package extracted from this project.

## Folder Contents

- `lose-screen.js` - main component (creates DOM, handles state, handles button logic)
- `lose-screen.css` - styles
- `assets/` - all required images
- `legacy-api-adapter.js` - optional global wrappers to keep old function names
- `demo.html` - local demo

## Quick Start

1. Copy the whole `LoseScreenTransfer` folder into your new project.
2. Connect styles and script:

```html
<link rel="stylesheet" href="./LoseScreenTransfer/lose-screen.css">
<script src="./LoseScreenTransfer/lose-screen.js"></script>
```

3. Create and use component:

```html
<script>
  var loseScreen = new LoseScreen({
    assetBasePath: './LoseScreenTransfer/assets',
    onRewardRequest: function() {
      // start ad flow
    },
    onRewardResult: function(payload) {
      // payload.success === true/false
      // return false if you do not want auto-close on success
    },
    onSoftRevive: function(payload) {
      // payload.addedSeconds = 60
      // payload.spentCoins = current coin cost
    },
    onClose: function() {
      // close game / back action
    },
    onPurchase: function() {
      // open premium offer
    }
  });

  loseScreen.setCoins(100);
  loseScreen.setHearts(3);
  loseScreen.setTimeOutCoinsCost(50);
  loseScreen.setMaxLives(5);
  loseScreen.setLivesTimer('12:00');
  loseScreen.setSubscriptionStatus(false);

  loseScreen.show();
</script>
```

## Main API

- `show()`
- `hide()`
- `destroy()`
- `rewardResult(value)`
- `setCoins(value)`
- `setHearts(value)`
- `setTimeOutCoinsCost(value)`
- `setHeartsMax(value)`
- `setMaxHearts(value)`
- `setMaxLives(value)`
- `setHeartRecoverySeconds(value)`
- `setHeartsRecoverySeconds(value)`
- `setLivesTimer(value)`
- `setSubscriptionStatus(value)`
- `setHandlers(handlers)`
- `getState()`

## Optional Legacy Mapping

If you want to keep the old global API names (`setCoins`, `setHearts`, `rewardResult`, ...), add:

```html
<script src="./LoseScreenTransfer/legacy-api-adapter.js"></script>
<script>
  var loseScreen = new LoseScreen({
    assetBasePath: './LoseScreenTransfer/assets'
  });

  attachLoseScreenLegacyAPI(loseScreen);

  // now you can call old names
  showLoseScreen();
  setCoins(120);
  setHearts(2);
  setTimeOutCoinsCost(60);
</script>
```

## Notes

- Component has no dependency on this project engine.
- Styles are namespaced with `ls-` classes to avoid collisions.
- `onSoftRevive` auto-decreases coins and auto-closes by default.
- `onRewardRequest` does not auto-close. Call `rewardResult(true/false)` when ad flow finishes.
