cd /Users/nathan/snowmoon-style-test || exit 1
# Settings read in place from the main checkout (locked; never copied, never written).
npx tsx --conditions=react-server --env-file=/Users/nathan/snowmoon/.env.local /Users/nathan/snowmoon-style-test/scripts/bases-pick-2-2026-11-10.ts /private/tmp/claude-501/-Users-nathan-snowmoon/b065ecb5-ae9b-5616-b62f-ffe127e10e19/scratchpad/bases-pick-2
status=$?
ls -lO /Users/nathan/snowmoon/.env.local
exit $status
