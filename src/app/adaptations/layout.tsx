import { ADAPTATIONS } from '~/lib/config';
import './adaptations.css';

/** While adaptations are out of view (ADAPTATIONS.visible), every page here says so; the pages stay in the repo. */
export default function AdaptationsLayout({ children }: { children: React.ReactNode }) {
  if (ADAPTATIONS.visible) return children;
  return (
    <div className="page prose adaptations">
      <h1>Adaptations</h1>
      <p>Nothing is published here yet.</p>
    </div>
  );
}
