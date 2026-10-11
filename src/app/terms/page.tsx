import { LegalPage } from '~/components/legal-page';
import { TERMS } from '~/lib/legal';

export const metadata = { title: 'Terms' };
export const dynamic = 'force-static';

export default function Terms() {
  return <LegalPage doc={TERMS} which="terms" />;
}
