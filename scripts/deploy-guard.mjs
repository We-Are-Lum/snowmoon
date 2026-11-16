// The deploy guard (the safety PR, owner 2026-11-12): a production build on Vercel runs only from main, as git deploys
// it. A deploy made by hand from a working tree (`vercel --prod` on a branch, a shared checkout) is refused before it
// builds, so the live site keeps the deployment it has. `vercel redeploy` of a main deployment keeps its git details and
// passes. Off the Vercel build machines (local builds, check scripts) and on previews it does nothing.
// Reads only Vercel's own build variables (names below), never a key.
const env = process.env;
if (env.VERCEL === '1' && env.VERCEL_ENV === 'production') {
  const ref = env.VERCEL_GIT_COMMIT_REF ?? '';
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (ref !== 'main' || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error(`deploy-guard: a production build must come from main through git (this one: branch "${ref || 'none'}", commit "${sha || 'none'}"). Merge to main instead; to redeploy, use \`vercel redeploy\` on the current production deployment.`);
    process.exit(1);
  }
  console.log(`deploy-guard: production build from main at ${sha.slice(0, 8)}`);
}
