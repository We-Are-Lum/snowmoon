# Minpentai onchain v1 (spike)

MatchLog (commit before play: start(), record(), close()) and RulesetRegistry. Local only: nothing here is deployed. See docs/proposals/minpentai-onchain-v1.md and docs/proposals/minpentai-commit-before-play.md.

MatchLog reads block hashes from the EIP-2935 history contract, so local chains must run Prague (`anvil --hardfork prague`); the Forge tests use a mock of it (test/MockHistory.sol).

```sh
cd contracts/minpentai
git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std.git lib/forge-std   # once
forge build && forge test
slither . --exclude-dependencies --filter-paths "lib|test"
cd ../..
npx tsx scripts/build-minpentai-onchain-fixtures.ts   # fixtures/onchain.json, from the TypeScript
npm run test:minpentai-onchain-fixtures
npm run minpentai:onchain-gas                         # start() and record() gas on a fresh local Prague anvil
npm run test:minpentai-onchain-verifier               # the verifier end to end on a fresh local Prague anvil
npx tsx scripts/minpentai-contract-mutants.ts         # planted bugs in MatchLog.sol: every one must fail the Forge tests
```
