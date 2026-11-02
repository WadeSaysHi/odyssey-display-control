# Design

Uses Anthropic’s [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) skill, reviewed at commit 41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f.

A quiet desktop input selector for one Odyssey OLED G8. A sculpted ultrawide monitor preview is the single expressive element; everything else serves switching and truthful state.

Tokens: canvas #e9edf2, surface #ffffff, ink #182330, muted #526171, blue #245cc5, verified #216347. System typography uses SF Pro on macOS and Segoe UI on Windows, with tabular numerals for freshness. Left-aligned controls and a centered monitor preview.

```
App title                         Connection
           Ultrawide monitor
           Actual current input
USB-C          DisplayPort          HDMI
                Result / freshness
Connection sheet: IP, pair, forget
```

Review: a dashboard with multiple status cards would obscure this app’s one task. The final layout uses a single monitor stage and one segmented input rail. It avoids invented metrics, extra navigation, decorative labels and custom window buttons. Native title bars support each OS. Every source has text, status is never color alone, keyboard focus is visible, and reduced motion is honored.
