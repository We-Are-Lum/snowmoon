# Minpentai onchain v1 (spike)

MatchLog and RulesetRegistry. Local only: nothing here is deployed. See docs/proposals/minpentai-onchain-v1.md.

```sh
cd contracts/minpentai
git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std.git lib/forge-std   # once
forge build && forge test
slither . --exclude-dependencies --filter-paths "lib|test"
cd ../..
npx tsx scripts/build-minpentai-onchain-fixtures.ts   # fixtures/onchain.json, from the TypeScript
npm run test:minpentai-onchain-fixtures
npm run minpentai:onchain-gas                         # record() gas on a fresh local anvil
```
