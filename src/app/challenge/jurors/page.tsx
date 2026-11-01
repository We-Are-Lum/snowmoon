import { notFound } from 'next/navigation';
import { CHALLENGE } from '~/lib/config';
import { bookCharacter } from '~/lib/images/designs';
import { jurorsOn } from '~/lib/deep-funding/jurors-db';
import { JurorQuestions } from '~/components/juror-questions';

/**
 * The deep funding test's juror page (docs/proposals/deep-funding-runner.md): a juror answers about six questions for
 * a character's final version, four comparisons and two originality, without seeing any model's answer. Off (not
 * found) while DEEP_FUNDING.jurors is off or Privacy doesn't yet describe the jurors' answers.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Jurors', description: 'The remix challenge’s credit test: questions for jurors.' };

export default async function JurorsPage() {
  if (!jurorsOn()) notFound();
  const chars = CHALLENGE.characters.map((s) => ({ slug: s, name: bookCharacter(s)?.name ?? s }));
  return (
    <div className="page prose">
      <h1>Jurors</h1>
      <p>
        For each character’s final version, AI models and a few people divide the credit among everything it was built on. You are one of those people.
        Answer from the pictures and words alone; you won’t see what the models said. Your answers are published by juror number, never by name.
      </p>
      <JurorQuestions characters={chars} />
    </div>
  );
}
