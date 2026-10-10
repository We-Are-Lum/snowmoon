import { LegalPage } from '~/components/legal-page';
import { PRIVACY } from '~/lib/legal';

export const metadata = { title: 'Privacy' };
export const dynamic = 'force-static';

export default function Privacy() {
  return <LegalPage doc={PRIVACY} which="privacy" />;
}
