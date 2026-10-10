# 🦄 Unicorn Rainbow Quest

A gentle touch game for a 5-year-old, with unicorns, rainbows, and fairies. It plays in any browser (phone, tablet, or laptop) with no install. On a phone, choose **Share → Add to Home Screen** to open it full screen.

## How to play
- Touch the screen (or move the trackpad pointer), and the unicorn runs there.
- Each stage has one goal. The game reads the goal out loud and counts along.
- There's no way to lose. When the goal is done, you get a rainbow and confetti.

## Stages
| # | Name | Goal | Status |
|---|------|------|--------|
| 1 | Star Meadow ⭐ | Collect 10 rainbow stars | ✅ Playable |
| 2 | Fairy Forest 🧚 | Pop 8 bubbles to free the fairies | ✅ Playable |
| 3 | Ice Cream Sky 🍦 | Play as a fairy: fly into 6 bubbles, free the ice creams, eat them | ✅ Playable |
| 🏆 | Trophy Room | Find 1 unicorn toy, 1 fairy toy, and 3 shells to break the shield and win the trophy (end of game) | ✅ Unlocks after stage 3 |

## Code
Plain HTML, CSS, and JS with no build step. It's hosted on GitHub Pages.
- `index.html`: screens (title, stage map, goal card, win card)
- `game.js`: the game. New stages go in the `STAGES` list at the top.
- `style.css`: buttons and layout

Run locally by opening `index.html` in a browser.
