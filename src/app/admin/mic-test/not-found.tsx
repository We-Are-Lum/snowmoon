import NotFound from 'next/dist/client/components/builtin/not-found';
import { MicTest } from '~/components/mic-test';

/** /admin/mic-test: the site's usual "not found" for everyone; a signed-in admin's browser draws the test in its place. */
export default function MicTestNotFound() {
  return <MicTest fallback={<NotFound />} />;
}
