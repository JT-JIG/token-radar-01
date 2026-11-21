# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JT-JIG/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/JT-JIG/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard)

[A token launch radar](https://make.fun/bounty/token-radar-01) — a dashboard ranking pre-token protocols by implied value, built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it is

From DefiLlama's sealed snapshot of 758 protocols, the radar finds the ones that record no token and could plausibly issue one of their own, ranks all 198 of them by an implied value, and gives each a farm plan. The watchlist's 40 protocols are all covered; 158 pre-token protocols below the $50M floor are ranked alongside them. The 144 pre-token protocols left out — wrapped, staked or bridged products of tokens that already trade, versioned pools, exchanges — are listed in the dashboard's Set aside view with the rule that set each aside.

## The model (radar-2)

The implied value follows from the snapshot's own figures, and the multiple is the market's, not mine:

```
multiple   = median market-cap-to-TVL ratio of the live-token protocols in the same
             category (at least 3 live protocols), else the market-wide median;
             capped at 1.0, so no implied value exceeds the protocol's TVL
implied    = round( tvl_usd × multiple × growth multiplier × maturity multiplier )
growth     = 1 + clamp(change_7d, −60, 120) / 100 × 0.5
maturity   = 0.6 + 0.4 × √(min(age_days, 1095) / 1095)
```

Tenure matters most in the first year: the maturity premium rises steeply while a protocol proves it survives, then saturates. No protocol name is special-cased — the same function scores every row. The dashboard prints the whole calibration table and recomputes each row's implied value in the page, showing the check against the number `board.json` carries.

## The dashboard

A static page, no network: a sortable, filterable board (search, category, chain, watchlist-only), a detail view per protocol with its model breakdown and seven-step farm plan, a Set aside view, a Live token view showing the market caps the multiples are calibrated from, and a model section stating the formula and the calibration.

## How it runs

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to `/output/board.json` and the dashboard's data to `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with the vendored make.fun library.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```
