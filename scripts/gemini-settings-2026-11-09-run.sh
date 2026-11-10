cd /Users/nathan/snowmoon-style-test || exit 1
# Read-only copy of the main checkout's settings, for this run only (the original is locked; never touched).
cp /Users/nathan/snowmoon/.env.local /Users/nathan/snowmoon-style-test/.env.local || exit 1
if ls -lO /Users/nathan/snowmoon-style-test/.env.local | grep -q uchg; then
  echo "STOP: the worktree copy has the uchg flag"
  exit 1
fi
# Filter the copy only: no site chat key, no stale OIDC token.
sed -i '' -e '/^GROQ_API_KEY=/d' -e '/^VERCEL_OIDC_TOKEN=/d' /Users/nathan/snowmoon-style-test/.env.local || { echo "STOP: could not write the worktree copy"; rm -f /Users/nathan/snowmoon-style-test/.env.local; exit 1; }
npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon-style-test/.env.local /Users/nathan/snowmoon-style-test/scripts/gemini-settings-2026-11-09.ts /private/tmp/claude-501/-Users-nathan-snowmoon/b065ecb5-ae9b-5616-b62f-ffe127e10e19/scratchpad/gemini-settings
status=$?
rm -f /Users/nathan/snowmoon-style-test/.env.local
ls -lO /Users/nathan/snowmoon/.env.local
exit $status
